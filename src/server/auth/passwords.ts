/**
 * Utilidades para el hashing y verificación segura de contraseñas con Argon2id.
 *
 * Utiliza `@node-rs/argon2`, implementado en Rust con binding nativo seguro.
 */

import { hash, verify } from '@node-rs/argon2';

/** Longitud mínima exigida para contraseñas de usuario. */
export const LONGITUD_MINIMA_PASSWORD = 10;

/**
 * Genera un hash Argon2id a partir de una contraseña en texto plano.
 */
export async function hashearPassword(password: string): Promise<string> {
  return hash(password);
}

/**
 * Comprueba si una contraseña coincide con el hash Argon2id almacenado.
 */
export async function verificarPassword(hashAlmacenado: string, passwordCandidata: string): Promise<boolean> {
  try {
    return await verify(hashAlmacenado, passwordCandidata);
  } catch {
    return false;
  }
}
