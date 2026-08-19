/**
 * Rutas de la pantalla de resultados.
 *
 * `(app)` es un *route group* y no aporta segmento, así que la página que vive
 * en `src/app/(app)/app/formularios/[id]/resultados` se sirve en
 * `/app/formularios/:id/resultados`, dentro de lo que protege `src/proxy.ts`.
 *
 * Está aquí y no en `@/components/panel/rutas-panel` para que el enlace desde el
 * listado sea un cambio de una sola línea cuando se añada.
 */

import { RUTA_FORMULARIOS } from '@/components/panel/rutas-panel';

/** Resultados de un formulario: `/app/formularios/:id/resultados`. */
export function rutaResultados(idFormulario: string): string {
  return `${RUTA_FORMULARIOS}/${encodeURIComponent(idFormulario)}/resultados`;
}
