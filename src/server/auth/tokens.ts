/**
 * Gestión de tokens de un solo uso (verificación de email y restablecimiento de contraseña).
 *
 * El token en texto plano viaja únicamente en el enlace del correo;
 * en la base de datos solo se guarda su hash SHA-256 y la fecha de expiración.
 *
 * Las funciones de base de datos importan `@/db` dinámicamente para que las funciones
 * criptográficas puras (`generarTokenAleatorio`, `hashearToken`) puedan importarse y probarse
 * sin requerir una conexión activa a PostgreSQL.
 */

import { createHash, randomBytes } from 'node:crypto';

/** Caducidad del token de verificación de correo: 24 horas. */
export const CADUCIDAD_VERIFICACION_MS = 24 * 60 * 60 * 1000;

/** Caducidad del token de restablecimiento de contraseña: 1 hora. */
export const CADUCIDAD_RESTABLECIMIENTO_MS = 60 * 60 * 1000;

/**
 * Genera un token criptográficamente seguro de 64 caracteres hexadecimales (256 bits).
 */
export function generarTokenAleatorio(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Calcula el hash SHA-256 de un token para su almacenamiento y búsqueda en base de datos.
 */
export function hashearToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Crea y persiste un token de verificación de correo para el usuario indicado.
 * Devuelve el token en texto plano para incluirlo en el correo.
 */
export async function crearTokenVerificacion(userId: string): Promise<string> {
  const { db } = await import('@/db');
  const { emailVerificationTokens } = await import('@/db/schema');

  const tokenPlano = generarTokenAleatorio();
  const tokenHash = hashearToken(tokenPlano);
  const expiresAt = new Date(Date.now() + CADUCIDAD_VERIFICACION_MS);

  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return tokenPlano;
}

/**
 * Valida y consume un token de verificación de correo.
 * Si el token es válido, no ha expirado y no ha sido consumido, lo marca como consumido
 * y devuelve el `userId`. En cualquier otro caso devuelve `null`.
 */
export async function consumirTokenVerificacion(tokenPlano: string): Promise<{ userId: string } | null> {
  const { db } = await import('@/db');
  const { emailVerificationTokens } = await import('@/db/schema');
  const { and, eq, gt, isNull } = await import('drizzle-orm');

  const tokenHash = hashearToken(tokenPlano);
  const ahora = new Date();

  const [fila] = await db
    .update(emailVerificationTokens)
    .set({ consumedAt: ahora })
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.consumedAt),
        gt(emailVerificationTokens.expiresAt, ahora),
      ),
    )
    .returning({ userId: emailVerificationTokens.userId });

  if (!fila) {
    return null;
  }

  return { userId: fila.userId };
}

/**
 * Crea y persiste un token de restablecimiento de contraseña para el usuario indicado.
 * Devuelve el token en texto plano para incluirlo en el correo.
 */
export async function crearTokenRestablecimiento(userId: string): Promise<string> {
  const { db } = await import('@/db');
  const { passwordResetTokens } = await import('@/db/schema');

  const tokenPlano = generarTokenAleatorio();
  const tokenHash = hashearToken(tokenPlano);
  const expiresAt = new Date(Date.now() + CADUCIDAD_RESTABLECIMIENTO_MS);

  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return tokenPlano;
}

/**
 * Valida y consume un token de restablecimiento de contraseña.
 * Si el token es válido, no ha expirado y no ha sido consumido, lo marca como consumido
 * y devuelve el `userId`. En cualquier otro caso devuelve `null`.
 */
export async function consumirTokenRestablecimiento(tokenPlano: string): Promise<{ userId: string } | null> {
  const { db } = await import('@/db');
  const { passwordResetTokens } = await import('@/db/schema');
  const { and, eq, gt, isNull } = await import('drizzle-orm');

  const tokenHash = hashearToken(tokenPlano);
  const ahora = new Date();

  const [fila] = await db
    .update(passwordResetTokens)
    .set({ consumedAt: ahora })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.consumedAt),
        gt(passwordResetTokens.expiresAt, ahora),
      ),
    )
    .returning({ userId: passwordResetTokens.userId });

  if (!fila) {
    return null;
  }

  return { userId: fila.userId };
}
