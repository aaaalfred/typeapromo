/**
 * Helpers para gestión de sesiones de usuario en auth_sessions y cookies HTTP.
 */

import { randomUUID } from 'node:crypto';
import type { NextResponse } from 'next/server';

import { DURACION_SESION_SEGUNDOS } from '@/lib/auth/constantes';
import { nombreCookieSesion } from '@/lib/auth/cookies';

/**
 * Crea una nueva sesión persistida en `auth_sessions`.
 */
export async function crearSesionUsuario(userId: string): Promise<{ token: string; expira: Date }> {
  const { db } = await import('@/db');
  const { authSessions } = await import('@/db/schema');

  const token = randomUUID();
  const expira = new Date(Date.now() + DURACION_SESION_SEGUNDOS * 1000);

  await db.insert(authSessions).values({
    sessionToken: token,
    userId,
    expires: expira,
  });

  return { token, expira };
}

/**
 * Invalida todas las sesiones de un usuario (para restablecimiento seguro de contraseña).
 */
export async function invalidarSesionesUsuario(userId: string): Promise<void> {
  const { db } = await import('@/db');
  const { authSessions } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  await db.delete(authSessions).where(eq(authSessions.userId, userId));
}

/**
 * Añade la cookie de sesión a una respuesta HTTP.
 */
export function fijarCookieSesion(
  response: NextResponse,
  token: string,
  expira: Date,
  esSeguro: boolean,
): void {
  response.cookies.set({
    name: nombreCookieSesion(esSeguro),
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: esSeguro,
    expires: expira,
  });
}

/**
 * Elimina la cookie de sesión de una respuesta HTTP.
 */
export function eliminarCookieSesion(response: NextResponse, esSeguro: boolean): void {
  response.cookies.set({
    name: nombreCookieSesion(esSeguro),
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: esSeguro,
    expires: new Date(0),
    maxAge: 0,
  });
}

/**
 * Determina si la petición actual se sirve sobre HTTPS.
 */
export function esPeticionSegura(request: Request): boolean {
  const proto = request.headers.get('x-forwarded-proto');
  if (proto) return proto.includes('https');
  const url = new URL(request.url);
  return url.protocol === 'https:';
}

/**
 * Obtiene el origen base de la petición respetando encabezados de proxy inverso.
 */
export function urlBaseDePeticion(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host) {
    const primerHost = host.split(',')[0]?.trim();
    if (primerHost) url.host = primerHost;
  }
  const proto = request.headers.get('x-forwarded-proto');
  if (proto === 'https' || proto === 'http') {
    url.protocol = `${proto}:`;
  }
  return url.origin;
}
