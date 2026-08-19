/**
 * Resultados, métricas y exportación CSV (fase 8 de PLAN.md).
 *
 * Punto de entrada de las rutas `src/app/api/forms/[id]/results` y
 * `…/results.csv`. Nada de esto conoce HTTP: las funciones lanzan `FormsError`
 * con un código de dominio, que el borde traduce.
 *
 * `servicio.ts` y `consultas.ts` importan `@/db` en carga, así que este barril
 * **abre el pool de PostgreSQL**. Los módulos puros (`catalogo`, `metricas`,
 * `csv`, `esquemas`, `tipos`) se importan directamente en los tests para poder
 * ejecutarlos sin `DATABASE_URL`.
 */

export * from './catalogo';
export * from './csv';
export * from './esquemas';
export * from './metricas';
export * from './servicio';
export * from './tipos';
export {
  TAMANO_LOTE,
  cargarContexto,
  condicionDeSesiones,
  type ContextoResultados,
  type FilaSesion,
} from './consultas';
