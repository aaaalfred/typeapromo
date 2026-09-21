/**
 * Acceso directo a PostgreSQL desde la suite.
 *
 * Se usa para **dos cosas y ninguna más**:
 *
 * 1. **Limpiar.** La API no expone `DELETE /api/forms/:id` —borrar un
 *    formulario publicado con respuestas no es una operación de producto—, así
 *    que el único modo de que cada test deje la base como la encontró es
 *    borrarlo aquí. `forms` arrastra en cascada borrador, versiones, sesiones,
 *    respuestas, eventos y referencias de media.
 * 2. **Comprobar lo que el usuario no ve.** Que el token de sesión pública se
 *    guarde hasheado, que las respuestas históricas sigan atadas a su versión,
 *    que no haya filas duplicadas. Son invariantes del modelo, y la interfaz no
 *    los expone.
 *
 * Nunca se usa para *preparar* el estado que el test luego afirma: eso se hace
 * por la API o por la interfaz, que es lo que se está probando.
 */

import type { Pool, QueryResultRow } from 'pg'
import pg from 'pg'

import { DATABASE_URL } from './entorno'

let pool: Pool | null = null

function obtenerPool(): Pool {
  pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 4 })
  return pool
}

/** Consulta parametrizada. Devuelve las filas tal cual las da `pg`. */
export async function consulta<T extends QueryResultRow>(
  texto: string,
  valores: readonly unknown[] = [],
): Promise<T[]> {
  const resultado = await obtenerPool().query<T>(texto, [...valores])
  return resultado.rows
}

/** Cierra el pool. Lo llama el teardown del fixture de trabajador. */
export async function cerrarPool(): Promise<void> {
  if (pool === null) return
  const actual = pool
  pool = null
  await actual.end()
}

/* -------------------------------------------------------------------------- */
/* Limpieza                                                                    */
/* -------------------------------------------------------------------------- */

/** Borra formularios por identificador. En cascada se va todo lo que cuelga. */
export async function borrarFormularios(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await consulta('delete from forms where id = any($1::uuid[])', [[...ids]])
}

/** Borra activos de media por identificador (los objetos los borra la API). */
export async function borrarActivosDeMedia(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await consulta('delete from media_assets where id = any($1::uuid[])', [[...ids]])
}

/**
 * Vacía el contador de límite de peticiones.
 *
 * La suite entera sale de una sola IP (`127.0.0.1`), y la política pública es de
 * 20 sesiones cada diez minutos por cliente. Cada «participante» de un test
 * representa a una persona distinta que en la vida real vendría de otra IP, así
 * que reiniciar el contador es el equivalente a cambiar de visitante, igual que
 * abrir un contexto de navegador limpio. No desactiva nada: `09-plataforma.spec.ts`
 * comprueba aparte, con su propia IP simulada, que el limitador sigue cortando.
 */
export async function purgarLimitesDePeticion(): Promise<void> {
  await consulta('delete from rate_limits')
}

/** Revoca una sesión administrativa. La suite crea una por trabajador. */
export async function borrarSesionAdministrativa(token: string): Promise<void> {
  await consulta('delete from auth_sessions where session_token = $1', [token])
}

/* -------------------------------------------------------------------------- */
/* Lecturas de comprobación                                                    */
/* -------------------------------------------------------------------------- */

export interface FilaSesionPublica {
  readonly id: string
  readonly version_id: string
  readonly token_hash: string
  readonly status: string
  readonly current_question_id: string | null
  readonly answered_count: number
}

/** Sesiones de respuesta de un formulario, de la más antigua a la más reciente. */
export function sesionesDeFormulario(formId: string): Promise<FilaSesionPublica[]> {
  return consulta<FilaSesionPublica>(
    `select id, version_id, token_hash, status, current_question_id, answered_count
       from response_sessions
      where form_id = $1
      order by started_at asc`,
    [formId],
  )
}

export interface FilaRespuesta {
  readonly session_id: string
  readonly version_id: string
  readonly question_id: string
  readonly question_type: string
  readonly value_json: unknown
}

/** Respuestas de un formulario, ordenadas de forma estable. */
export function respuestasDeFormulario(formId: string): Promise<FilaRespuesta[]> {
  return consulta<FilaRespuesta>(
    `select session_id, version_id, question_id, question_type, value_json
       from answers
      where form_id = $1
      order by session_id, question_id`,
    [formId],
  )
}

/** Versiones publicadas de un formulario, en orden. */
export function versionesDeFormulario(
  formId: string,
): Promise<{ id: string; version_number: number }[]> {
  return consulta<{ id: string; version_number: number }>(
    'select id, version_number from form_versions where form_id = $1 order by version_number asc',
    [formId],
  )
}

/** Número de migraciones aplicadas según el registro de Drizzle. */
export async function migracionesAplicadas(): Promise<number> {
  const filas = await consulta<{ total: string }>(
    'select count(*)::text as total from drizzle.__drizzle_migrations',
  )
  return Number(filas[0]?.total ?? '0')
}
