/**
 * Constantes compartidas entre la configuración de Auth.js y la ruta de acceso
 * directo. Viven aparte para que ninguna de las dos tenga que importar a la
 * otra.
 */

/** Duración de la sesión administrativa: 30 días, igual que el valor por defecto de Auth.js. */
export const DURACION_SESION_SEGUNDOS = 60 * 60 * 24 * 30;
