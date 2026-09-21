/**
 * Rutas de la aplicación, escritas a mano.
 *
 * Se repiten aquí en lugar de importarse de `@/components/panel` a propósito:
 * si un test construyera sus URL con el mismo helper que usa la interfaz, un
 * cambio de ruta pasaría desapercibido porque las dos mitades se moverían a la
 * vez. Escribirlas literalmente convierte cualquier cambio de URL en un fallo
 * visible, que es justo lo que debe pasar.
 */

export const RUTA_LOGIN = '/iniciar-sesion'
export const RUTA_ACCESO_DENEGADO = '/acceso-denegado'
export const RUTA_FORMULARIOS = '/app/formularios'

export function rutaEditor(id: string): string {
  return `/app/formularios/${id}/editar`
}

export function rutaResultados(id: string): string {
  return `/app/formularios/${id}/resultados`
}

export function rutaPublica(slug: string): string {
  return `/f/${slug}`
}
