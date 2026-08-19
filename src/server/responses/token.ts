/**
 * Token de reanudación de una sesión de respuesta.
 *
 * Las dos reglas que fija PLAN.md · §2.1, y de las que depende toda la
 * privacidad de la fase:
 *
 * 1. **El token nunca viaja en la URL.** Sale del servidor en una cookie
 *    `HttpOnly` + `SameSite=Lax` y vuelve por el mismo camino. Una URL acaba en
 *    el historial, en el `Referer` y en los registros de cualquier proxy; una
 *    cookie `HttpOnly` ni siquiera la lee el JavaScript de la página.
 * 2. **En base de datos solo se guarda el SHA-256.** `response_sessions.token_hash`
 *    es un hash, y un volcado de la tabla no permite reanudar la sesión de nadie.
 *
 * Módulo **puro**: se testea sin base de datos.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 32 bytes de entropía. En `base64url` son 43 caracteres, sin `+`, `/` ni `=`,
 * así que el valor viaja limpio en una cookie sin necesidad de escaparlo.
 */
export const LONGITUD_TOKEN_BYTES = 32;

/** Longitud exacta del token codificado. Sirve para descartar basura sin hashear. */
export const LONGITUD_TOKEN = 43;

/** Genera un token nuevo. Es el único valor en claro que existe del secreto. */
export function crearToken(): string {
  return randomBytes(LONGITUD_TOKEN_BYTES).toString('base64url');
}

/** SHA-256 hexadecimal del token. Es lo único que se persiste. */
export function hashDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * `true` si el valor tiene la forma de un token nuestro.
 *
 * Se comprueba antes de consultar la base de datos: una cookie manipulada con
 * un valor arbitrario no debe llegar a convertirse en una consulta.
 */
export function pareceToken(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    valor.length === LONGITUD_TOKEN &&
    /^[A-Za-z0-9_-]+$/.test(valor)
  );
}

/**
 * Comparación de hashes en tiempo constante.
 *
 * La búsqueda por `token_hash` va por índice único y no compara nada en la
 * aplicación, pero cuando hay que confirmar una coincidencia ya leída esta es la
 * forma de hacerlo sin filtrar información por el tiempo de respuesta.
 */
export function hashesIguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
