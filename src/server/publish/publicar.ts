/**
 * Publicación versionada (PLAN.md · fase 7).
 *
 * La secuencia completa vive en **una sola transacción**, y ese es el punto:
 *
 * 1. Se bloquea la fila del formulario (`SELECT … FOR UPDATE`) para que dos
 *    publicaciones simultáneas no elijan el mismo `version_number`.
 * 2. Se lee el borrador y se valida entero con `validateForPublication()`, el
 *    validador de `@/lib/forms` — destinos inexistentes, saltos hacia atrás,
 *    preguntas inalcanzables y reglas contradictorias. Si falla, **no se crea
 *    nada** y salen los problemas concretos.
 * 3. Se inserta el snapshot inmutable en `form_versions` con el siguiente
 *    número correlativo del formulario.
 * 4. Se mueve `forms.active_version_id` **en la misma transacción**.
 * 5. Se escriben las `media_asset_refs` con `scope='version'`, que es lo que
 *    blinda las imágenes de la versión frente al borrado.
 *
 * Lo que **no** hace, y es igual de importante: no toca ni una fila de
 * `form_versions` anterior, ni de `answers`, ni de `response_sessions`. Publicar
 * una segunda versión no puede alterar un recorrido, una etiqueta ni una
 * respuesta de la primera porque cada sesión cuelga de su `version_id` y ese
 * snapshot ya no se vuelve a escribir nunca.
 */

import { and, eq, max as maxOf, sql } from 'drizzle-orm';

import { db } from '@/db';
import { formDrafts, formVersions, forms } from '@/db/schema';
import { validateForPublication, type FormDefinition } from '@/lib/forms';
import {
  FormsError,
  borradorNoEncontrado,
  conflictoDeRevision,
  datosInvalidos,
  formularioNoEncontrado,
  getForm,
  transicionInvalida,
  type Actor,
  type FormDetail,
} from '@/server/forms';
import type { DbHandle } from '@/server/forms/db';
import { insertVersionAssetRefs } from '@/server/forms/media-refs';

import {
  decidirPublicacion,
  detallesDeValidacion,
  mensajeDeValidacion,
  siguienteNumeroDeVersion,
  type ProblemaPublicacion,
} from './decisiones';
import type { PublishFormInput } from './esquemas';

/* -------------------------------------------------------------------------- */
/* Salida                                                                      */
/* -------------------------------------------------------------------------- */

/** Snapshot recién creado, tal y como se devuelve al panel. */
export interface PublishedVersion {
  readonly id: string;
  readonly versionNumber: number;
  readonly schemaVersion: number;
  readonly publishedAt: Date;
  /** Revisión del borrador que se ha congelado. */
  readonly revision: number;
}

export interface PublishResult {
  /** Mismo envoltorio que el resto de mutaciones del panel. */
  readonly form: FormDetail;
  readonly version: PublishedVersion;
  /**
   * Avisos no bloqueantes del validador (reglas muertas, pantallas finales
   * huérfanas…). Se ha publicado igualmente; el panel decide si los enseña.
   */
  readonly warnings: readonly ProblemaPublicacion[];
}

/* -------------------------------------------------------------------------- */
/* Publicación                                                                 */
/* -------------------------------------------------------------------------- */

/** `23505` es la violación de restricción única de PostgreSQL. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return (error as { readonly code?: unknown }).code === '23505';
}

/**
 * Bloquea la fila del formulario durante el resto de la transacción.
 *
 * Va sobre `forms` a secas, sin joins: PostgreSQL no admite `FOR UPDATE` sobre
 * el lado nulable de un `LEFT JOIN`.
 */
async function lockForm(handle: DbHandle, formId: string, workspaceId?: string) {
  const conditions = [eq(forms.id, formId)];
  if (workspaceId !== undefined) {
    conditions.push(eq(forms.workspaceId, workspaceId));
  }
  const [row] = await handle
    .select({
      id: forms.id,
      workspaceId: forms.workspaceId,
      status: forms.status,
      activeVersionId: forms.activeVersionId,
    })
    .from(forms)
    .where(and(...conditions))
    .limit(1)
    .for('update');

  if (!row) throw formularioNoEncontrado();
  return row;
}

/**
 * Publica el borrador vivo del formulario.
 *
 * Se reintenta un número acotado de veces ante una colisión de
 * `(form_id, version_number)`: dos publicaciones simultáneas del mismo
 * formulario son raras, pero el índice único es quien decide, no el cálculo.
 */
export async function publishForm(
  formId: string,
  input: PublishFormInput,
  actor: Actor,
): Promise<PublishResult> {
  const MAX_INTENTOS = 3;

  for (let intento = 1; intento <= MAX_INTENTOS; intento += 1) {
    try {
      const creada = await db.transaction(async (tx) => publicarEnTransaccion(tx, formId, input, actor));
      // El detalle se lee fuera de la transacción, ya con `active_version_id`
      // movido: es una lectura y no necesita el bloqueo.
      const form = await getForm(formId, actor);
      return { form, version: creada.version, warnings: creada.warnings };
    } catch (error) {
      if (!isUniqueViolation(error) || intento === MAX_INTENTOS) {
        if (isUniqueViolation(error)) {
          throw new FormsError(
            'ERROR_INTERNO',
            'No se ha podido reservar un número de versión libre. Inténtalo de nuevo.',
          );
        }
        throw error;
      }
    }
  }

  // Inalcanzable: el bucle o devuelve o lanza.
  throw new FormsError('ERROR_INTERNO', 'No se ha podido publicar el formulario.');
}

interface VersionCreada {
  readonly version: PublishedVersion;
  readonly warnings: readonly ProblemaPublicacion[];
}

async function publicarEnTransaccion(
  tx: DbHandle,
  formId: string,
  input: PublishFormInput,
  actor: Actor,
): Promise<VersionCreada> {
  const current = await lockForm(tx, formId, actor.workspaceId);

  const decision = decidirPublicacion(current.status);
  if (!decision.ok) throw transicionInvalida(decision.message);

  const [draft] = await tx
    .select({ definition: formDrafts.definition, revision: formDrafts.revision })
    .from(formDrafts)
    .where(eq(formDrafts.formId, formId))
    .limit(1);

  if (!draft) throw borradorNoEncontrado();

  if (input.revision !== undefined && input.revision !== draft.revision) {
    throw conflictoDeRevision(input.revision, draft.revision);
  }

  // El documento se valida **entero** y sin confiar en su forma: lo que hay en
  // el JSONB pudo escribirlo una versión anterior del esquema.
  const informe = validateForPublication(draft.definition);
  if (!informe.ok || informe.definition === null) {
    throw datosInvalidos(mensajeDeValidacion(informe), { ...detallesDeValidacion(informe) });
  }
  const definition: FormDefinition = informe.definition;

  const [agregado] = await tx
    .select({ maximo: maxOf(formVersions.versionNumber) })
    .from(formVersions)
    .where(eq(formVersions.formId, formId));

  const versionNumber = siguienteNumeroDeVersion(agregado?.maximo ?? null);

  const [snapshot] = await tx
    .insert(formVersions)
    .values({
      formId,
      versionNumber,
      definition,
      schemaVersion: definition.schemaVersion,
      publishedBy: actor.id,
    })
    .returning({
      id: formVersions.id,
      versionNumber: formVersions.versionNumber,
      schemaVersion: formVersions.schemaVersion,
      publishedAt: formVersions.publishedAt,
    });

  if (!snapshot) {
    throw new FormsError('ERROR_INTERNO', 'No se ha podido crear la versión publicada.');
  }

  // El movimiento de `active_version_id` va aquí dentro a propósito: si esto
  // fallara, el snapshot tampoco existiría y no quedaría una versión colgando.
  await tx
    .update(forms)
    .set({
      activeVersionId: snapshot.id,
      status: decision.estado,
      // Republicar un formulario cerrado lo reabre: si `closed_at` sobreviviera,
      // desarchivarlo más adelante lo devolvería a `closed` por error.
      closedAt: null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(forms.id, formId), eq(forms.status, current.status)));

  // Las imágenes de la versión quedan blindadas frente al borrado mientras la
  // versión exista (`src/db/README.md`, «Borrado seguro de media»).
  await insertVersionAssetRefs(tx, formId, snapshot.id, definition);

  return {
    version: { ...snapshot, revision: draft.revision },
    warnings: informe.warnings.map((aviso) => ({
      code: aviso.code,
      message: aviso.message,
      path: aviso.path.join('.'),
    })),
  };
}
