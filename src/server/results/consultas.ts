/**
 * Acceso a datos de los resultados.
 *
 * Es la única pieza de `@/server/results` que conoce Drizzle. Todo lo que sale
 * de aquí son filas planas que `metricas.ts` sabe agregar sin saber de dónde
 * vienen.
 *
 * Dos invariantes que sostienen el resto:
 *
 * 1. **El abandono se deriva en la propia consulta.** No hay columna, no hay
 *    evento y no hay job: se traduce el predicado de
 *    `@/server/responses/abandono` a SQL y se cuenta con `count(*) filter`.
 * 2. **Nada se carga entero en memoria.** Las respuestas y las sesiones se
 *    recorren por lotes con paginación por clave (`keyset`), que es lo que
 *    permite exportar el CSV en streaming aunque haya cien mil filas.
 */

import { and, asc, count, eq, gt, gte, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { answers, formVersions, forms, responseSessions } from '@/db/schema';
import { formDefinitionSchema } from '@/lib/forms';
import { condicionAbandonada, limiteDeAbandono } from '@/server/responses/abandono';

import type { VersionEnAlcance } from './catalogo';
import type { RespuestaCruda } from './metricas';
import type { FiltrosResultados, ResumenSesiones, VersionResumen } from './tipos';
import { construirResumen } from './metricas';

/** Filas leídas por vuelta al recorrer respuestas o sesiones. */
export const TAMANO_LOTE = 500;

/* -------------------------------------------------------------------------- */
/* Contexto                                                                    */
/* -------------------------------------------------------------------------- */

export interface FormularioFila {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly activeVersionId: string | null;
}

export interface ContextoResultados {
  readonly form: FormularioFila;
  /** Versiones cuyo snapshot se ha podido parsear. Alimentan el catálogo. */
  readonly versiones: readonly VersionEnAlcance[];
  /** Todas las versiones publicadas, para el selector de la interfaz. */
  readonly metadatos: readonly VersionResumen[];
}

/**
 * Carga el formulario y todos sus snapshots publicados.
 *
 * Un snapshot que no supere `formDefinitionSchema` —escrito por una versión
 * anterior del esquema, por ejemplo— queda fuera del catálogo pero **sigue
 * apareciendo en el selector**: esconderlo haría desaparecer sus respuestas sin
 * decir por qué.
 */
export async function cargarContexto(formId: string): Promise<ContextoResultados | null> {
  const [form] = await db
    .select({
      id: forms.id,
      slug: forms.slug,
      title: forms.title,
      status: forms.status,
      activeVersionId: forms.activeVersionId,
    })
    .from(forms)
    .where(eq(forms.id, formId))
    .limit(1);

  if (form === undefined) return null;

  const filas = await db
    .select({
      id: formVersions.id,
      versionNumber: formVersions.versionNumber,
      publishedAt: formVersions.publishedAt,
      definition: formVersions.definition,
    })
    .from(formVersions)
    .where(eq(formVersions.formId, formId))
    .orderBy(asc(formVersions.versionNumber));

  const versiones: VersionEnAlcance[] = [];
  const metadatos: VersionResumen[] = [];

  for (const fila of filas) {
    metadatos.push({
      id: fila.id,
      versionNumber: fila.versionNumber,
      publishedAt: fila.publishedAt,
      esActiva: fila.id === form.activeVersionId,
    });

    const parseada = formDefinitionSchema.safeParse(fila.definition);
    if (parseada.success) {
      versiones.push({
        id: fila.id,
        versionNumber: fila.versionNumber,
        definition: parseada.data,
      });
    }
  }

  return { form, versiones, metadatos };
}

/* -------------------------------------------------------------------------- */
/* Condiciones                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Traduce los filtros a la condición sobre `response_sessions`.
 *
 * Se aplica **igual al resumen y a la tabla**: lo que se cuenta arriba es
 * exactamente lo que se lista abajo, sin dos universos que puedan discrepar.
 */
export function condicionDeSesiones(
  formId: string,
  filtros: FiltrosResultados,
  ahora: Date,
): SQL {
  const partes: (SQL | undefined)[] = [eq(responseSessions.formId, formId)];

  if (filtros.versionId !== null) {
    partes.push(eq(responseSessions.versionId, filtros.versionId));
  }
  if (filtros.desde !== null) {
    partes.push(gte(responseSessions.startedAt, filtros.desde));
  }
  if (filtros.hasta !== null) {
    partes.push(lte(responseSessions.startedAt, filtros.hasta));
  }

  switch (filtros.estado) {
    case 'completadas':
      partes.push(isNotNull(responseSessions.completedAt));
      break;
    case 'abandonadas':
      partes.push(condicionAbandonada(ahora));
      break;
    case 'en_curso':
      partes.push(
        and(
          isNull(responseSessions.completedAt),
          gte(responseSessions.lastActivityAt, limiteDeAbandono(ahora)),
        ),
      );
      break;
    case 'todas':
      break;
  }

  return and(...partes) ?? sql`true`;
}

/* -------------------------------------------------------------------------- */
/* Resumen                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Resumen en una sola consulta.
 *
 * El abandono es literalmente el predicado del plan escrito como filtro de
 * agregación:
 *
 * ```sql
 * count(*) filter (where completed_at is null and last_activity_at < $limite)
 * ```
 */
export async function resumirEnBaseDeDatos(
  condicion: SQL,
  ahora: Date,
): Promise<ResumenSesiones> {
  const limite = limiteDeAbandono(ahora);

  const [fila] = await db
    .select({
      iniciadas: count(),
      completadas:
        sql<number>`count(*) filter (where ${responseSessions.completedAt} is not null)`.mapWith(
          Number,
        ),
      abandonadas:
        sql<number>`count(*) filter (where ${responseSessions.completedAt} is null and ${responseSessions.lastActivityAt} < ${limite})`.mapWith(
          Number,
        ),
    })
    .from(responseSessions)
    .where(condicion);

  return construirResumen(fila?.iniciadas ?? 0, fila?.completadas ?? 0, fila?.abandonadas ?? 0);
}

export interface FilaAbandono {
  readonly questionId: string | null;
  readonly abandonos: number;
}

/** Abandono por pregunta: la pantalla en la que se quedó cada sesión abandonada. */
export async function abandonoPorPantalla(
  condicion: SQL,
  ahora: Date,
): Promise<FilaAbandono[]> {
  const filas = await db
    .select({
      questionId: responseSessions.currentQuestionId,
      abandonos: count(),
    })
    .from(responseSessions)
    .where(and(condicion, condicionAbandonada(ahora)))
    .groupBy(responseSessions.currentQuestionId);

  return filas;
}

/* -------------------------------------------------------------------------- */
/* Respuestas                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Recorre por lotes todas las respuestas de las sesiones que cumplen el filtro.
 *
 * Paginación por clave sobre `answers.id`: sin `offset`, así que el coste no
 * crece con la profundidad y una escritura concurrente no descoloca la ventana.
 */
export async function* recorrerRespuestas(
  condicion: SQL,
  tamanoLote = TAMANO_LOTE,
): AsyncGenerator<readonly RespuestaCruda[]> {
  let cursor: string | null = null;

  for (;;) {
    const filas = await db
      .select({
        id: answers.id,
        versionId: answers.versionId,
        questionId: answers.questionId,
        valueJson: answers.valueJson,
      })
      .from(answers)
      .innerJoin(responseSessions, eq(answers.sessionId, responseSessions.id))
      .where(cursor === null ? condicion : and(condicion, gt(answers.id, cursor)))
      .orderBy(asc(answers.id))
      .limit(tamanoLote);

    if (filas.length === 0) return;
    yield filas;
    if (filas.length < tamanoLote) return;
    cursor = filas[filas.length - 1]?.id ?? null;
    if (cursor === null) return;
  }
}

/* -------------------------------------------------------------------------- */
/* Sesiones                                                                    */
/* -------------------------------------------------------------------------- */

export interface FilaSesion {
  readonly id: string;
  readonly versionId: string;
  readonly startedAt: Date;
  readonly lastActivityAt: Date;
  readonly completedAt: Date | null;
  readonly answeredCount: number;
}

const COLUMNAS_SESION = {
  id: responseSessions.id,
  versionId: responseSessions.versionId,
  startedAt: responseSessions.startedAt,
  lastActivityAt: responseSessions.lastActivityAt,
  completedAt: responseSessions.completedAt,
  answeredCount: responseSessions.answeredCount,
} as const;

export async function contarSesiones(condicion: SQL): Promise<number> {
  const [fila] = await db
    .select({ valor: count() })
    .from(responseSessions)
    .where(condicion);
  return fila?.valor ?? 0;
}

/** Página de sesiones para la tabla, de la más reciente a la más antigua. */
export async function paginaDeSesiones(
  condicion: SQL,
  page: number,
  perPage: number,
): Promise<FilaSesion[]> {
  return db
    .select(COLUMNAS_SESION)
    .from(responseSessions)
    .where(condicion)
    .orderBy(sql`${responseSessions.startedAt} desc`, sql`${responseSessions.id} desc`)
    .limit(perPage)
    .offset((page - 1) * perPage);
}

/**
 * Instante de inicio con **precisión de microsegundo**, en texto.
 *
 * `timestamptz` guarda microsegundos; el `Date` de JavaScript solo llega al
 * milisegundo. Usar la fecha ya convertida como cursor la trunca hacia abajo, y
 * entonces la última fila de cada lote vuelve a aparecer en el siguiente —y, si
 * un lote entero comparte milisegundo, el recorrido no avanza nunca—. Por eso el
 * cursor viaja como texto exacto y se compara con un `::timestamptz`, que además
 * deja seguir usando el índice `(form_id, started_at)`.
 */
const INICIO_EXACTO = sql<string>`to_char(${responseSessions.startedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const COLUMNAS_SESION_CON_CURSOR = {
  ...COLUMNAS_SESION,
  inicioExacto: INICIO_EXACTO,
} as const;

interface FilaSesionConCursor extends FilaSesion {
  /** Valor del cursor, no un dato de la sesión: no sale de este módulo. */
  readonly inicioExacto: string;
}

/** Posición del recorrido por clave: la última sesión ya emitida. */
interface CursorSesion {
  readonly inicioExacto: string;
  readonly id: string;
}

/**
 * Condición «estrictamente después del cursor» en el orden `(started_at, id)`.
 *
 * Vive fuera del generador y con el tipo de retorno anotado a propósito: dentro
 * del bucle, el cursor se reasigna con un valor derivado de la propia consulta y
 * TypeScript no puede cerrar la inferencia (`TS7022`). Una función con firma
 * explícita rompe ese ciclo sin recurrir a `any`.
 */
function sesionesDespuesDe(condicion: SQL, cursor: CursorSesion | null): SQL {
  if (cursor === null) return condicion;

  const marca = sql`${cursor.inicioExacto}::timestamptz`;
  const posterior = or(
    gt(responseSessions.startedAt, marca),
    and(eq(responseSessions.startedAt, marca), gt(responseSessions.id, cursor.id)),
  );

  return and(condicion, posterior) ?? condicion;
}

/**
 * Recorre por lotes todas las sesiones del filtro, en orden cronológico.
 *
 * Paginación por clave sobre `(started_at, id)`. Es lo que consume el CSV: en
 * ningún momento hay más de un lote de sesiones vivo.
 */
export async function* recorrerSesiones(
  condicion: SQL,
  tamanoLote = TAMANO_LOTE,
): AsyncGenerator<readonly FilaSesion[]> {
  let cursor: CursorSesion | null = null;

  for (;;) {
    const filas: FilaSesionConCursor[] = await db
      .select(COLUMNAS_SESION_CON_CURSOR)
      .from(responseSessions)
      .where(sesionesDespuesDe(condicion, cursor))
      .orderBy(asc(responseSessions.startedAt), asc(responseSessions.id))
      .limit(tamanoLote);

    if (filas.length === 0) return;
    yield filas;
    if (filas.length < tamanoLote) return;

    const ultima: FilaSesionConCursor | undefined = filas[filas.length - 1];
    if (ultima === undefined) return;
    cursor = { inicioExacto: ultima.inicioExacto, id: ultima.id };
  }
}

export interface RespuestaDeSesion {
  readonly sessionId: string;
  readonly versionId: string;
  readonly questionId: string;
  readonly valueJson: unknown;
}

/** Respuestas de un lote de sesiones, agrupadas por sesión. */
export async function respuestasDeSesiones(
  sessionIds: readonly string[],
): Promise<Map<string, RespuestaDeSesion[]>> {
  const agrupadas = new Map<string, RespuestaDeSesion[]>();
  if (sessionIds.length === 0) return agrupadas;

  const filas = await db
    .select({
      sessionId: answers.sessionId,
      versionId: answers.versionId,
      questionId: answers.questionId,
      valueJson: answers.valueJson,
    })
    .from(answers)
    .where(inArray(answers.sessionId, [...sessionIds]));

  for (const fila of filas) {
    const existentes = agrupadas.get(fila.sessionId);
    if (existentes === undefined) agrupadas.set(fila.sessionId, [fila]);
    else existentes.push(fila);
  }

  return agrupadas;
}
