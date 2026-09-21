import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Estados del ciclo de vida de un formulario (PR.md · «Panel del equipo»).
 */
export const formStatusEnum = pgEnum("form_status", [
  "draft",
  "published",
  "closed",
  "archived",
]);

/**
 * Estado de un activo de media dentro del pipeline staging → público.
 */
export const mediaAssetStatusEnum = pgEnum("media_asset_status", [
  "uploading",
  "ready",
  "failed",
]);

/**
 * Ámbito de una referencia a un activo: el borrador vivo de un formulario
 * o un snapshot publicado concreto (PLAN.md · §2.4).
 */
export const mediaRefScopeEnum = pgEnum("media_ref_scope", ["draft", "version"]);

/**
 * Estado de una sesión de respuesta.
 *
 * No existe el valor `abandoned` de forma deliberada: el abandono se deriva en
 * consulta (`completed_at IS NULL AND last_activity_at < now() - interval '30 minutes'`),
 * tal y como fija PLAN.md · §2.9. Materializarlo exigiría un job periódico.
 */
export const responseSessionStatusEnum = pgEnum("response_session_status", [
  "in_progress",
  "completed",
]);

/**
 * Eventos de recorrido para métricas (PR.md · «Modelo de datos» → `form_events`).
 */
export const formEventTypeEnum = pgEnum("form_event_type", [
  "started",
  "advanced",
  "abandoned",
  "completed",
]);
