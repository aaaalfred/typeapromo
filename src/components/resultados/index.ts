/**
 * Interfaz de resultados (fase 8 de PLAN.md).
 *
 * Todo lo que necesita `src/app/(app)/app/formularios/[id]/resultados` sale de
 * aquí. El acceso a la API vive en `./api` y los tipos de transporte en
 * `./tipos`; la página no habla con `fetch` directamente.
 */

export * from './api';
export * from './formato';
export * from './rutas';
export * from './tipos';
export { AbandonoPreguntas, type PropsAbandonoPreguntas } from './abandono-preguntas';
export { Distribuciones, type PropsDistribuciones } from './distribuciones';
export { EsqueletoResultados } from './esqueleto';
export {
  FiltrosResultadosPanel,
  type PropsFiltrosResultados,
} from './filtros-resultados';
export { PanelResultados, type PropsPanelResultados } from './panel-resultados';
export { ResumenResultados, type PropsResumenResultados } from './resumen-resultados';
export {
  TablaRespuestasIndividuales,
  type PropsTablaRespuestas,
} from './tabla-respuestas';
