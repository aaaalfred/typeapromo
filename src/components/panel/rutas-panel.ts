/**
 * Rutas del panel, en un único sitio.
 *
 * `RUTA_PANEL` (`/app`) es la raíz que protege `src/proxy.ts` y a la que apunta
 * el destino por defecto tras iniciar sesión, así que todas las pantallas del
 * equipo cuelgan de ella.
 *
 * `rutaEditor()` existe aparte porque la pantalla del editor la construye otra
 * fase: concentrar aquí su URL permite enlazarla desde el listado antes de que
 * exista y moverla después tocando una sola línea.
 */

import { RUTA_PANEL } from '@/lib/auth/rutas';

export { RUTA_PANEL };

/** Listado de formularios del equipo. */
export const RUTA_FORMULARIOS = `${RUTA_PANEL}/formularios`;

/** Editor visual de un formulario (fase 5, en construcción). */
export function rutaEditor(idFormulario: string): string {
  return `${RUTA_FORMULARIOS}/${encodeURIComponent(idFormulario)}/editar`;
}

/** Enlace público del formulario publicado. */
export function rutaPublica(slug: string): string {
  return `/f/${encodeURIComponent(slug)}`;
}
