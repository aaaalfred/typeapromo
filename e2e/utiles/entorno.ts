/**
 * Lectura del entorno para la suite end-to-end.
 *
 * Los valores por defecto son los mismos que `playwright.config.ts` inyecta al
 * servidor bajo prueba: si aquí y allí divergieran, los tests hablarían con una
 * base de datos y un almacén distintos de los que usa la aplicación, y el fallo
 * resultante sería incomprensible.
 */

function leer(nombre: string, porDefecto: string): string {
  const valor = process.env[nombre]
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : porDefecto
}

/** Cadena de conexión de PostgreSQL. */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  leer('DATABASE_URL', 'postgresql://typeapromo:typeapromo@localhost:5432/typeapromo')

/** Endpoint S3 del almacén (MinIO en local). */
export const R2_ENDPOINT = leer('R2_ENDPOINT', 'http://localhost:9000')

/** Bucket privado de cargas temporales. */
export const BUCKET_STAGING = leer('R2_BUCKET_STAGING', 'forms-media-staging')

/** Base de lectura pública del bucket público. */
export const MEDIA_PUBLIC_BASE_URL = leer(
  'MEDIA_PUBLIC_BASE_URL',
  'http://localhost:9000/forms-media-public',
)

/**
 * Prefijo de los slugs creados por la suite.
 *
 * Sirve de red de seguridad: si un test se cae antes de limpiar, lo que deje
 * atrás se reconoce a simple vista y se puede barrer con una sola sentencia.
 */
export const PREFIJO_E2E = 'e2e'

/**
 * Origen del servidor bajo prueba.
 *
 * Se replica el cálculo de `playwright.config.ts` porque los fixtures de
 * trabajador no pueden depender de `baseURL`, que es de ámbito de test. Si
 * alguien cambia el puerto allí, hay que cambiarlo aquí.
 */
export const BASE_URL = `http://127.0.0.1:${process.env.E2E_PORT ?? '3100'}`

/** Secreto del cron de limpieza, tal y como lo inyecta `playwright.config.ts`. */
export const CLEANUP_SECRET = leer('CLEANUP_SECRET', 'secreto-limpieza-e2e')
