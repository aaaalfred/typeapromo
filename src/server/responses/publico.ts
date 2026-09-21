/**
 * Lectura pública de un formulario por su slug.
 *
 * **Siempre la versión activa, nunca el borrador.** Es la regla que hace que
 * publicar una segunda versión no altere lo que ve quien ya está respondiendo, y
 * la que impide que un cambio a medias del editor se filtre al público. Este
 * módulo no lee `form_drafts` en ningún caso; ni siquiera lo importa.
 *
 * Un formulario cerrado o archivado **no es un 404**: existe, tiene contenido y
 * merece un mensaje. El texto sale de `meta.closedMessage` del documento
 * publicado —que es inmutable y se configura en el editor antes de publicar— y
 * cae a un texto por defecto si no se ha escrito ninguno.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { formVersions, forms } from '@/db/schema';
import { formDefinitionSchema, type FormDefinition } from '@/lib/forms';

import { ResponsesError } from './errores';
import {
  MENSAJE_CERRADO_POR_DEFECTO,
  estadoPublicoDe,
  mensajeDeEstado,
  type EstadoPublico,
} from './estado';

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

/** Versión activa servida al público. */
export interface VersionPublica {
  readonly id: string;
  readonly versionNumber: number;
  readonly definition: FormDefinition;
  readonly publishedAt: Date;
}

export interface FormularioPublico {
  readonly formId: string;
  readonly workspaceId: string;
  readonly slug: string;
  readonly title: string;
  readonly estado: EstadoPublico;
  /** Versión activa. `null` solo cuando el estado es `sin_publicar`. */
  readonly version: VersionPublica | null;
  /** Mensaje a mostrar cuando el estado no es `disponible`. */
  readonly mensaje: string | null;
}

/** Formulario disponible: el tipo con la versión ya estrechada a no nula. */
export interface FormularioDisponible extends FormularioPublico {
  readonly estado: 'disponible';
  readonly version: VersionPublica;
}

/* -------------------------------------------------------------------------- */
/* Lectura                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Un snapshot ilegible con el esquema actual es un fallo del servidor, no del
 * visitante: se responde `500` con un mensaje neutro y sin traza de zod.
 * `form_versions.schema_version` existe precisamente para poder localizar estos
 * casos cuando cambie la forma del documento.
 */
function parseSnapshot(value: unknown): FormDefinition {
  const parsed = formDefinitionSchema.safeParse(value);
  if (!parsed.success) {
    throw new ResponsesError(
      'ERROR_INTERNO',
      'Este formulario no se puede mostrar ahora mismo. Inténtalo más tarde.',
    );
  }
  return parsed.data;
}

/**
 * Carga el formulario público por slug. Devuelve `null` si el slug no existe:
 * eso sí es un 404 legítimo, porque no hay nada que contar.
 */
export async function cargarFormularioPublico(
  slug: string,
): Promise<FormularioPublico | null> {
  const [fila] = await db
    .select({
      formId: forms.id,
      workspaceId: forms.workspaceId,
      slug: forms.slug,
      title: forms.title,
      status: forms.status,
      activeVersionId: forms.activeVersionId,
      versionNumber: formVersions.versionNumber,
      definition: formVersions.definition,
      publishedAt: formVersions.publishedAt,
    })
    .from(forms)
    .leftJoin(formVersions, eq(formVersions.id, forms.activeVersionId))
    .where(eq(forms.slug, slug))
    .limit(1);

  if (!fila) return null;

  const tieneVersion =
    fila.activeVersionId !== null &&
    fila.versionNumber !== null &&
    fila.publishedAt !== null;

  const estado = estadoPublicoDe(fila.status, tieneVersion);

  const version: VersionPublica | null =
    tieneVersion && fila.activeVersionId !== null
      ? {
          id: fila.activeVersionId,
          versionNumber: fila.versionNumber as number,
          definition: parseSnapshot(fila.definition),
          publishedAt: fila.publishedAt as Date,
        }
      : null;

  return {
    formId: fila.formId,
    workspaceId: fila.workspaceId,
    slug: fila.slug,
    title: fila.title,
    estado,
    version,
    mensaje: mensajeDeEstado(estado, version?.definition ?? null),
  };
}

/**
 * Igual que `cargarFormularioPublico`, pero exige que admita respuestas. Es lo
 * que usan los endpoints de escritura: crear sesión, guardar respuesta y
 * completar solo tienen sentido sobre un formulario abierto.
 */
export async function exigirFormularioDisponible(
  slug: string,
): Promise<FormularioDisponible> {
  const formulario = await cargarFormularioPublico(slug);
  if (formulario === null) {
    throw new ResponsesError('NO_ENCONTRADO', 'Este formulario no existe.');
  }
  if (formulario.estado !== 'disponible' || formulario.version === null) {
    throw new ResponsesError(
      'FORMULARIO_NO_DISPONIBLE',
      formulario.mensaje ?? MENSAJE_CERRADO_POR_DEFECTO,
    );
  }
  return { ...formulario, estado: 'disponible', version: formulario.version };
}
