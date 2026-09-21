/**
 * Punto de entrada de la capa de datos.
 *
 *   import { db, schema } from "@/db";
 *   import { forms, formVersions } from "@/db/schema";
 */

export { db, pool, type Database } from "./client";
export * as schema from "./schema";
export * from "./schema";
