/**
 * Capa de servicio de los formularios (fase 3 de PLAN.md).
 *
 * Aquí no hay nada de HTTP: ni `Request`, ni `Response`, ni códigos de estado.
 * Las funciones reciben datos ya validados y lanzan `FormsError` con un código
 * de dominio; traducirlo a HTTP es responsabilidad de `src/app/api/forms`.
 *
 * Invariantes que sostiene este módulo:
 *
 * 1. Un formulario y su borrador nacen y mueren juntos: se crean en la misma
 *    transacción y `form_drafts.form_id` es único.
 * 2. `forms.title` es copia desnormalizada de `definition.meta.title` para poder
 *    listar y buscar sin abrir el JSONB; toda escritura del borrador la
 *    resincroniza.
 * 3. Toda escritura del borrador reconcilia `media_asset_refs` con ámbito
 *    `draft` en la misma transacción (`src/db/README.md`).
 * 4. El borrador solo se escribe con la revisión que el cliente leyó. Nunca hay
 *    sobrescritura silenciosa.
 */

import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { formDrafts, formVersions, forms, responseSessions } from '@/db/schema';
import {
  createDefaultFormDefinition,
  formDefinitionSchema,
  type FormDefinition,
} from '@/lib/forms';

import type { Actor } from './actor';
import type { DbHandle } from './db';
import {
  FormsError,
  borradorNoEncontrado,
  conflictoDeRevision,
  formularioNoEncontrado,
  transicionInvalida,
} from './errors';
import { reconcileDraftAssetRefs } from './media-refs';
import { decideDraftWrite } from './revision';
import type {
  CreateFormInput,
  DuplicateFormInput,
  ListFormsQuery,
  SaveDraftInput,
  UpdateFormInput,
} from './schemas';
import { resolveSlugCollision, slugSearchPrefix } from './slug';
import {
  DRAFT_READ_ONLY_MESSAGE,
  applyTransition,
  canEditDraft,
  type FormStatus,
} from './status';

/* -------------------------------------------------------------------------- */
/* Tipos de salida                                                             */
/* -------------------------------------------------------------------------- */

/** Contadores de participación mostrados en el listado del panel. */
export interface ResponseCounts {
  /** Sesiones iniciadas, completas o no. */
  readonly sessions: number;
  /** Sesiones con `completed_at`. Es la cifra de «respuestas» del panel. */
  readonly completed: number;
}

/** Estado del borrador vivo, sin el documento. */
export interface DraftState {
  readonly revision: number;
  readonly updatedAt: Date;
}

export interface FormSummary {
  readonly id: string;
  readonly workspaceId: string;
  readonly slug: string;
  readonly title: string;
  readonly status: FormStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly closedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly activeVersionId: string | null;
  readonly activeVersionNumber: number | null;
  readonly publishedAt: Date | null;
  readonly draft: DraftState | null;
  readonly responses: ResponseCounts;
}

/** Formulario con el documento del borrador ya validado contra `FormDefinition`. */
export interface FormDetail extends FormSummary {
  readonly definition: FormDefinition;
}

export interface FormListPage {
  readonly items: readonly FormSummary[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

export interface DraftSaveResult {
  readonly formId: string;
  readonly revision: number;
  readonly updatedAt: Date;
  readonly title: string;
}

/* -------------------------------------------------------------------------- */
/* Utilidades internas                                                         */
/* -------------------------------------------------------------------------- */

const EMPTY_COUNTS: ResponseCounts = { sessions: 0, completed: 0 };

/** `23505` es la violación de restricción única de PostgreSQL. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return (error as { readonly code?: unknown }).code === '23505';
}

/** Escapa los comodines de `LIKE` para que una búsqueda con `%` no lo sea todo. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function now(): Date {
  return new Date();
}

/** Recorta respetando el límite de `title` cuando se le añade un sufijo. */
function truncateTitle(value: string): string {
  return value.length <= 300 ? value : value.slice(0, 300);
}

/**
 * Columnas comunes del listado y del detalle. `form_drafts` y la versión activa
 * entran por `LEFT JOIN`: un formulario recién creado no tiene versión, y el
 * borrador se une por su índice único de `form_id`.
 */
const summaryColumns = {
  id: forms.id,
  workspaceId: forms.workspaceId,
  slug: forms.slug,
  title: forms.title,
  status: forms.status,
  createdAt: forms.createdAt,
  updatedAt: forms.updatedAt,
  closedAt: forms.closedAt,
  archivedAt: forms.archivedAt,
  activeVersionId: forms.activeVersionId,
  activeVersionNumber: formVersions.versionNumber,
  publishedAt: formVersions.publishedAt,
  draftRevision: formDrafts.revision,
  draftUpdatedAt: formDrafts.updatedAt,
} as const;

function selectSummaries(handle: DbHandle) {
  return handle
    .select(summaryColumns)
    .from(forms)
    .leftJoin(formDrafts, eq(formDrafts.formId, forms.id))
    .leftJoin(formVersions, eq(formVersions.id, forms.activeVersionId));
}

/** Fila cruda del resumen, con la nulabilidad que introducen los `LEFT JOIN`. */
type SummaryRow = Awaited<ReturnType<typeof selectSummaries>>[number];

function toSummary(row: SummaryRow, responses: ResponseCounts): FormSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    slug: row.slug,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
    archivedAt: row.archivedAt,
    activeVersionId: row.activeVersionId,
    activeVersionNumber: row.activeVersionNumber,
    publishedAt: row.publishedAt,
    draft:
      row.draftRevision === null || row.draftUpdatedAt === null
        ? null
        : { revision: row.draftRevision, updatedAt: row.draftUpdatedAt },
    responses,
  };
}

/** Contadores de sesiones por formulario, en una sola consulta agregada. */
async function countResponses(
  handle: DbHandle,
  formIds: readonly string[],
): Promise<Map<string, ResponseCounts>> {
  const counts = new Map<string, ResponseCounts>();
  if (formIds.length === 0) return counts;

  const rows = await handle
    .select({
      formId: responseSessions.formId,
      sessions: count(),
      completed: sql<number>`count(*) filter (where ${responseSessions.status} = 'completed')`.mapWith(
        Number,
      ),
    })
    .from(responseSessions)
    .where(inArray(responseSessions.formId, [...formIds]))
    .groupBy(responseSessions.formId);

  for (const row of rows) {
    counts.set(row.formId, { sessions: row.sessions, completed: row.completed });
  }
  return counts;
}

/**
 * Valida el JSONB leído. Un borrador ilegible es un fallo del servidor, no del
 * cliente: se devuelve `500` con un mensaje neutro y sin traza de zod.
 */
function parseStoredDefinition(value: unknown): FormDefinition {
  const parsed = formDefinitionSchema.safeParse(value);
  if (!parsed.success) {
    throw new FormsError(
      'ERROR_INTERNO',
      'El borrador guardado no es legible con el esquema actual del formulario.',
    );
  }
  return parsed.data;
}

/** Slug libre derivado de `source`, consultando solo los slugs con ese prefijo. */
async function uniqueSlug(
  handle: DbHandle,
  source: string,
  excludeFormId?: string,
): Promise<string> {
  const base = slugSearchPrefix(source);
  const conditions: (SQL | undefined)[] = [ilike(forms.slug, `${escapeLikePattern(base)}%`)];
  if (excludeFormId !== undefined) {
    conditions.push(ne(forms.id, excludeFormId));
  }

  const rows = await handle
    .select({ slug: forms.slug })
    .from(forms)
    .where(and(...conditions));

  return resolveSlugCollision(
    base,
    rows.map((row) => row.slug),
  );
}

/** Lee el detalle completo dentro del manejador dado. Lanza 404 si no existe. */
async function readDetail(
  handle: DbHandle,
  formId: string,
  workspaceId?: string,
): Promise<FormDetail> {
  const conditions = [eq(forms.id, formId)];
  if (workspaceId !== undefined) {
    conditions.push(eq(forms.workspaceId, workspaceId));
  }

  const [row] = await selectSummaries(handle)
    .where(and(...conditions))
    .limit(1);
  if (!row) throw formularioNoEncontrado();

  const [draft] = await handle
    .select({ definition: formDrafts.definition })
    .from(formDrafts)
    .where(eq(formDrafts.formId, formId))
    .limit(1);

  if (!draft) throw borradorNoEncontrado();

  const counts = await countResponses(handle, [formId]);

  return {
    ...toSummary(row, counts.get(formId) ?? EMPTY_COUNTS),
    definition: parseStoredDefinition(draft.definition),
  };
}

/**
 * Bloquea la fila del formulario para el resto de la transacción.
 *
 * `SELECT … FOR UPDATE` va sobre `forms` a secas, sin los `LEFT JOIN` del
 * resumen: PostgreSQL no admite el bloqueo sobre el lado nulable de un join
 * externo.
 */
async function lockForm(
  handle: DbHandle,
  formId: string,
  workspaceId?: string,
): Promise<{
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly slug: string;
  readonly status: FormStatus;
  readonly closedAt: Date | null;
  readonly activeVersionId: string | null;
}> {
  const conditions = [eq(forms.id, formId)];
  if (workspaceId !== undefined) {
    conditions.push(eq(forms.workspaceId, workspaceId));
  }

  const [row] = await handle
    .select({
      id: forms.id,
      workspaceId: forms.workspaceId,
      title: forms.title,
      slug: forms.slug,
      status: forms.status,
      closedAt: forms.closedAt,
      activeVersionId: forms.activeVersionId,
    })
    .from(forms)
    .where(and(...conditions))
    .limit(1)
    .for('update');

  if (!row) throw formularioNoEncontrado();
  return row;
}

/* -------------------------------------------------------------------------- */
/* Crear                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Crea el formulario y su borrador en una sola transacción.
 *
 * El slug se deriva del título (o del enviado) y se desambigua de forma
 * determinista. Aun así, dos peticiones simultáneas con el mismo título pueden
 * elegir el mismo candidato y chocar contra el índice único: por eso se
 * reintenta un número acotado de veces antes de rendirse con `SLUG_EN_USO`.
 */
export async function createForm(input: CreateFormInput, actor: Actor): Promise<FormDetail> {
  const title = input.title;
  const definition = input.definition ?? createDefaultFormDefinition(title);

  return withSlugRetry(async () =>
    db.transaction(async (tx) => {
      const slug = await uniqueSlug(tx, input.slug ?? title);

      const [created] = await tx
        .insert(forms)
        .values({
          workspaceId: actor.workspaceId,
          slug,
          title,
          status: 'draft',
          createdBy: actor.id,
        })
        .returning({ id: forms.id });

      if (!created) {
        throw new FormsError('ERROR_INTERNO', 'No se ha podido crear el formulario.');
      }

      await tx.insert(formDrafts).values({
        formId: created.id,
        definition,
        revision: 1,
        updatedBy: actor.id,
      });

      await reconcileDraftAssetRefs(tx, created.id, definition);

      return readDetail(tx, created.id, actor.workspaceId);
    }),
  );
}

/** Reintenta una operación que puede perder la carrera del slug. */
async function withSlugRetry<T>(operation: () => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === MAX_ATTEMPTS) {
        if (isUniqueViolation(error)) {
          throw new FormsError(
            'SLUG_EN_USO',
            'No se ha podido reservar una dirección pública libre. Inténtalo de nuevo.',
          );
        }
        throw error;
      }
    }
  }
  // Inalcanzable: el bucle o devuelve o lanza.
  throw new FormsError('ERROR_INTERNO', 'No se ha podido crear el formulario.');
}

/* -------------------------------------------------------------------------- */
/* Listar y obtener                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Listado del panel: búsqueda por título o slug, filtro por estado y contador de
 * respuestas. Los archivados quedan fuera salvo que se pidan.
 */
export async function listForms(query: ListFormsQuery, actor?: Actor): Promise<FormListPage> {
  const conditions: (SQL | undefined)[] = [];

  if (actor?.workspaceId) {
    conditions.push(eq(forms.workspaceId, actor.workspaceId));
  }

  if (query.status !== undefined) {
    conditions.push(eq(forms.status, query.status));
  } else if (query.includeArchived !== true) {
    conditions.push(ne(forms.status, 'archived'));
  }

  if (query.q !== undefined && query.q.length > 0) {
    const pattern = `%${escapeLikePattern(query.q)}%`;
    conditions.push(or(ilike(forms.title, pattern), ilike(forms.slug, pattern)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(forms).where(where);
  const total = totalRow?.value ?? 0;

  const orderBy =
    query.sort === 'title'
      ? [asc(forms.title), asc(forms.id)]
      : query.sort === 'created'
        ? [desc(forms.createdAt), asc(forms.id)]
        : [desc(forms.updatedAt), asc(forms.id)];

  const rows = await selectSummaries(db)
    .where(where)
    .orderBy(...orderBy)
    .limit(query.perPage)
    .offset((query.page - 1) * query.perPage);

  const counts = await countResponses(
    db,
    rows.map((row) => row.id),
  );

  return {
    items: rows.map((row) => toSummary(row, counts.get(row.id) ?? EMPTY_COUNTS)),
    total,
    page: query.page,
    perPage: query.perPage,
    pageCount: query.perPage > 0 ? Math.ceil(total / query.perPage) : 0,
  };
}

/** Formulario con su borrador. Lanza `NO_ENCONTRADO` si no existe. */
export async function getForm(formId: string, actor?: Actor): Promise<FormDetail> {
  return readDetail(db, formId, actor?.workspaceId);
}

/* -------------------------------------------------------------------------- */
/* Metadatos                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Actualiza título, slug y archivado.
 *
 * Renombrar escribe también `meta.title` en el borrador e incrementa la
 * revisión: el título es parte del documento y no puede divergir de la copia
 * desnormalizada de `forms.title`. Un editor con la revisión anterior recibirá
 * un `409` en su siguiente guardado, que es el comportamiento pretendido.
 */
export async function updateFormMetadata(
  formId: string,
  input: UpdateFormInput,
  actor: Actor,
): Promise<FormDetail> {
  return withSlugRetry(async () =>
    db.transaction(async (tx) => {
      const current = await lockForm(tx, formId, actor.workspaceId);

      const patch: {
        title?: string;
        slug?: string;
        status?: FormStatus;
        archivedAt?: Date | null;
        updatedAt: Date;
      } = { updatedAt: now() };

      if (input.archived !== undefined) {
        const transition = applyTransition(
          {
            status: current.status,
            hasActiveVersion: current.activeVersionId !== null,
            wasClosed: current.closedAt !== null,
          },
          input.archived ? 'archive' : 'unarchive',
        );

        if (!transition.ok) throw transicionInvalida(transition.message);

        if (transition.changed) {
          patch.status = transition.status;
          patch.archivedAt = transition.status === 'archived' ? now() : null;
        }
      }

      if (input.slug !== undefined) {
        patch.slug = await uniqueSlug(tx, input.slug, formId);
      }

      if (input.title !== undefined && input.title !== current.title) {
        patch.title = input.title;
        await renameDraft(tx, formId, input.title, actor);
      }

      await tx
        .update(forms)
        .set(patch)
        .where(and(eq(forms.id, formId), eq(forms.workspaceId, actor.workspaceId)));

      return readDetail(tx, formId, actor.workspaceId);
    }),
  );
}

/** Propaga el título nuevo a `meta.title` del borrador, incrementando la revisión. */
async function renameDraft(
  handle: DbHandle,
  formId: string,
  title: string,
  actor: Actor,
): Promise<void> {
  const [draft] = await handle
    .select({ definition: formDrafts.definition })
    .from(formDrafts)
    .where(eq(formDrafts.formId, formId))
    .limit(1);

  if (!draft) throw borradorNoEncontrado();

  const definition = parseStoredDefinition(draft.definition);
  const renamed: FormDefinition = { ...definition, meta: { ...definition.meta, title } };

  await handle
    .update(formDrafts)
    .set({
      definition: renamed,
      revision: sql`${formDrafts.revision} + 1`,
      updatedAt: now(),
      updatedBy: actor.id,
    })
    .where(eq(formDrafts.formId, formId));
}

/* -------------------------------------------------------------------------- */
/* Borrador                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Guarda el borrador con control de concurrencia optimista.
 *
 * El `UPDATE` filtra por la revisión que envió el cliente
 * (`src/db/README.md`). Si no afecta a ninguna fila, se lanza
 * `CONFLICTO_REVISION` con la revisión real del servidor: la segunda pestaña
 * recibe un `409` limpio y nunca pisa lo que escribió la primera.
 */
export async function saveDraft(
  formId: string,
  input: SaveDraftInput,
  actor: Actor,
): Promise<DraftSaveResult> {
  return db.transaction(async (tx) => {
    const current = await lockForm(tx, formId, actor.workspaceId);

    if (!canEditDraft(current.status)) {
      throw transicionInvalida(DRAFT_READ_ONLY_MESSAGE);
    }

    const [saved] = await tx
      .update(formDrafts)
      .set({
        definition: input.definition,
        revision: sql`${formDrafts.revision} + 1`,
        updatedAt: now(),
        updatedBy: actor.id,
      })
      .where(and(eq(formDrafts.formId, formId), eq(formDrafts.revision, input.revision)))
      .returning({ revision: formDrafts.revision, updatedAt: formDrafts.updatedAt });

    const existing = saved
      ? null
      : (
          await tx
            .select({ revision: formDrafts.revision })
            .from(formDrafts)
            .where(eq(formDrafts.formId, formId))
            .limit(1)
        )[0];

    const decision = decideDraftWrite(input.revision, saved, existing?.revision ?? null);

    if (decision.kind === 'missing') throw borradorNoEncontrado();
    if (decision.kind === 'conflict') {
      throw conflictoDeRevision(decision.expectedRevision, decision.serverRevision);
    }

    const title = truncateTitle(input.definition.meta.title);
    await tx
      .update(forms)
      .set({ title, updatedAt: now() })
      .where(and(eq(forms.id, formId), eq(forms.workspaceId, actor.workspaceId)));

    await reconcileDraftAssetRefs(tx, formId, input.definition);

    return { formId, revision: decision.revision, updatedAt: decision.updatedAt, title };
  });
}

/* -------------------------------------------------------------------------- */
/* Duplicar                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Duplica un formulario: copia nueva en estado `draft`, con su propio borrador y
 * **referencias a los mismos activos visuales**.
 *
 * Las filas de `media_asset_refs` con `scope='draft'` del formulario nuevo se
 * escriben en la misma transacción. Sin ellas, la fase 6 creería que las
 * imágenes compartidas solo las usa el original y las borraría al eliminarlo
 * (`src/db/README.md`, «Borrado seguro de media»).
 */
export async function duplicateForm(
  formId: string,
  input: DuplicateFormInput,
  actor: Actor,
): Promise<FormDetail> {
  return withSlugRetry(async () =>
    db.transaction(async (tx) => {
      const source = await readDetail(tx, formId, actor.workspaceId);
      const title = truncateTitle(input.title ?? `${source.title} (copia)`);

      const definition: FormDefinition = {
        ...source.definition,
        meta: { ...source.definition.meta, title },
      };

      const slug = await uniqueSlug(tx, title);

      const [created] = await tx
        .insert(forms)
        .values({
          workspaceId: actor.workspaceId,
          slug,
          title,
          status: 'draft',
          createdBy: actor.id,
        })
        .returning({ id: forms.id });

      if (!created) {
        throw new FormsError('ERROR_INTERNO', 'No se ha podido duplicar el formulario.');
      }

      await tx.insert(formDrafts).values({
        formId: created.id,
        definition,
        revision: 1,
        updatedBy: actor.id,
      });

      await reconcileDraftAssetRefs(tx, created.id, definition);

      return readDetail(tx, created.id, actor.workspaceId);
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Cerrar y archivar                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Cierra el formulario: deja de admitir respuestas y conserva las existentes.
 * Solo tiene sentido sobre un formulario publicado; es idempotente sobre uno ya
 * cerrado.
 */
export async function closeForm(formId: string, actor?: Actor): Promise<FormDetail> {
  return db.transaction(async (tx) => {
    const current = await lockForm(tx, formId, actor?.workspaceId);

    const transition = applyTransition(
      {
        status: current.status,
        hasActiveVersion: current.activeVersionId !== null,
        wasClosed: current.closedAt !== null,
      },
      'close',
    );

    if (!transition.ok) throw transicionInvalida(transition.message);

    if (transition.changed) {
      await tx
        .update(forms)
        .set({ status: transition.status, closedAt: now(), updatedAt: now() })
        .where(eq(forms.id, formId));
    }

    return readDetail(tx, formId, actor?.workspaceId);
  });
}

/** Archiva el formulario. Atajo de `updateFormMetadata` con `archived: true`. */
export async function archiveForm(formId: string, actor: Actor): Promise<FormDetail> {
  return updateFormMetadata(formId, { archived: true }, actor);
}

/** Devuelve el formulario a su estado anterior al archivado. */
export async function unarchiveForm(formId: string, actor: Actor): Promise<FormDetail> {
  return updateFormMetadata(formId, { archived: false }, actor);
}

