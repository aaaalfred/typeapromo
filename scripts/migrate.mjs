#!/usr/bin/env node
/**
 * Aplica las migraciones pendientes de `drizzle/`.
 *
 * Existe además de `npm run db:migrate` (drizzle-kit) porque drizzle-kit es una
 * `devDependency` y la imagen de producción es el `standalone` de Next: ahí no
 * está, así que el contenedor no podría migrarse a sí mismo. El migrador de
 * `drizzle-orm` sí viaja en la imagen, envuelve cada migración en una
 * transacción y lleva el registro en la tabla `drizzle.__drizzle_migrations`,
 * de modo que la ejecución es idempotente: repetirla no aplica nada dos veces.
 *
 * Uso:  DATABASE_URL=postgres://… node scripts/migrate.mjs
 */
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'drizzle',
)

async function main() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    console.error('[migrate] Falta la variable de entorno DATABASE_URL.')
    process.exitCode = 1
    return
  }

  // `max: 1` porque migrar es secuencial: no hay nada que paralelizar.
  const pool = new pg.Pool({ connectionString, max: 1 })

  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER })
    console.log('[migrate] Migraciones al día.')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  // Sin `DATABASE_URL` en el mensaje: la cadena de conexión lleva credenciales.
  console.error('[migrate] Fallo al aplicar migraciones:', error)
  process.exit(1)
})
