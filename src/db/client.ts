import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Cliente de Drizzle sobre el driver `pg`.
 *
 * Runtime Node.js obligatorio en todas las rutas: `pg` no funciona en Edge
 * (PLAN.md · §3). El pool se cachea en `globalThis` para que el hot reload de
 * desarrollo no abra una conexión nueva en cada recarga de módulo.
 */

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta la variable de entorno DATABASE_URL");
  }
  return new Pool({ connectionString });
}

const globalForDb = globalThis as typeof globalThis & { __dbPool?: Pool };

export const pool: Pool = globalForDb.__dbPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dbPool = pool;
}

export const db = drizzle(pool, { schema });

export type Database = typeof db;
