/**
 * Nombres de la cookie de sesión de Auth.js.
 *
 * Se replican aquí —en lugar de importarlos de `@auth/core`— porque los necesita
 * `src/proxy.ts`, que debe seguir siendo puro, y porque la ruta de acceso
 * directo escribe la cookie a mano. Están fijados por `@auth/core`
 * (`lib/utils/cookie.ts`): cambiar de versión mayor obliga a revisarlos.
 */

/** Nombre base sobre HTTP (desarrollo). */
export const COOKIE_SESION = 'authjs.session-token';
/** Nombre sobre HTTPS: `@auth/core` añade el prefijo `__Secure-`. */
export const COOKIE_SESION_SEGURA = `__Secure-${COOKIE_SESION}`;

/** Nombre de la cookie según el esquema de la petición. */
export function nombreCookieSesion(seguro: boolean): string {
  return seguro ? COOKIE_SESION_SEGURA : COOKIE_SESION;
}

/**
 * `true` si el nombre corresponde a la cookie de sesión, incluidos los
 * fragmentos numerados (`…session-token.0`) que `@auth/core` genera cuando el
 * valor supera los 4 KB.
 */
export function esCookieDeSesion(nombre: string): boolean {
  return [COOKIE_SESION, COOKIE_SESION_SEGURA].some(
    (base) => nombre === base || nombre.startsWith(`${base}.`),
  );
}

/** `true` si entre los nombres presentes hay una cookie de sesión. */
export function hayCookieDeSesion(nombres: readonly string[]): boolean {
  return nombres.some(esCookieDeSesion);
}
