/**
 * Esquema de base de datos, organizado por dominio.
 *
 * Este fichero es el único punto de entrada: `drizzle.config.ts` apunta aquí y
 * el cliente de Drizzle se construye con `import * as schema from "@/db/schema"`,
 * de modo que `db.query.*` dispone de todas las tablas y relaciones.
 *
 * - `enums`         — tipos enumerados de PostgreSQL.
 * - `auth`          — `users`, `auth_accounts`, `auth_sessions` (adapter de Auth.js).
 * - `forms`         — `forms`, `form_drafts`, `form_versions`.
 * - `media`         — `media_assets`, `media_asset_refs`.
 * - `responses`     — `response_sessions`, `answers`, `form_events`.
 * - `rate-limits`   — `rate_limits`.
 * - `relations`     — relaciones para la API de consultas.
 */

export * from "./enums";
export * from "./auth";
export * from "./workspaces";
export * from "./forms";
export * from "./media";
export * from "./responses";
export * from "./rate-limits";
export * from "./billing";
export * from "./relations";

