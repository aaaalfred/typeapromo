/**
 * Capa de servicio de formularios (fase 3 de PLAN.md).
 *
 * Punto de entrada único para las rutas de `src/app/api/forms`. Nada de esto
 * conoce HTTP: las funciones lanzan `FormsError` con un código de dominio.
 *
 * `service.ts` importa `@/db` en carga, así que este barril **abre el pool de
 * PostgreSQL**. Los módulos puros (`slug`, `status`, `media-refs`, `schemas`,
 * `errors`) se importan directamente en los tests para poder ejecutarlos sin
 * `DATABASE_URL`.
 */

export * from './actor';
export * from './errors';
export * from './revision';
export * from './schemas';
export * from './service';
export * from './slug';
export * from './status';
export { collectAssetIds, isUuid, reconcileDraftAssetRefs } from './media-refs';
export type { DbHandle, Transaction } from './db';
