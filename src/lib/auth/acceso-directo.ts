/**
 * Acceso directo sin credenciales (bypass de desarrollo y CI).
 *
 * Existe porque las pruebas E2E no pueden hablar con Slack real y porque Slack
 * exige redirecciones por HTTPS (PLAN.md · §2, punto 3). Es la única puerta del
 * proyecto que no debe abrirse nunca en producción, así que:
 *
 * - solo funciona con `AUTH_DEV_BYPASS=1`, comparación exacta;
 * - la comprobación se repite aquí aunque la ruta ya la haya hecho, para que la
 *   función sea segura por sí misma si alguien la reutiliza;
 * - crea una sesión **de base de datos** idéntica a la de Slack, no un atajo
 *   paralelo: se lista, se revoca y caduca igual que cualquier otra.
 *
 * No es un provider de Auth.js por una limitación real de la librería: el
 * provider de credenciales solo emite sesiones JWT y `@auth/core` rechaza la
 * configuración si es el único provider con `strategy: 'database'`. Renunciar a
 * las sesiones persistidas para tener un atajo de desarrollo sería el
 * intercambio equivocado, así que el bypass se implementa como una ruta propia
 * dentro de `/api/auth`.
 */

import { randomUUID } from 'node:crypto';

import { db } from '@/db';
import { authSessions, users, type User } from '@/db/schema';

import { DURACION_SESION_SEGUNDOS } from './constantes';
import { esBypassActivo } from './entorno';

/** Identidad fija del usuario de desarrollo. */
export const EMAIL_USUARIO_DESARROLLO = 'desarrollo@typeapromo.local';
export const NOMBRE_USUARIO_DESARROLLO = 'Usuario de desarrollo';

export interface SesionDeAccesoDirecto {
  /** Valor que va en la cookie `authjs.session-token`. */
  token: string;
  expira: Date;
  usuario: User;
}

/**
 * Devuelve el usuario de desarrollo, creándolo si hace falta. El `upsert` sobre
 * `email` evita la carrera de dos pestañas entrando a la vez.
 */
export async function obtenerUsuarioDeDesarrollo(): Promise<User> {
  const ahora = new Date();
  const [usuario] = await db
    .insert(users)
    .values({
      email: EMAIL_USUARIO_DESARROLLO,
      name: NOMBRE_USUARIO_DESARROLLO,
      emailVerified: ahora,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: NOMBRE_USUARIO_DESARROLLO, updatedAt: ahora },
    })
    .returning();

  if (usuario === undefined) {
    throw new Error('No se ha podido preparar el usuario de acceso directo');
  }
  return usuario;
}

/**
 * Crea una sesión persistida para el usuario de desarrollo.
 *
 * @throws si `AUTH_DEV_BYPASS` no vale exactamente `1`.
 */
export async function crearSesionDeAccesoDirecto(): Promise<SesionDeAccesoDirecto> {
  if (!esBypassActivo()) {
    throw new Error('El acceso directo está desactivado: AUTH_DEV_BYPASS no vale 1');
  }

  const usuario = await obtenerUsuarioDeDesarrollo();
  const token = randomUUID();
  const expira = new Date(Date.now() + DURACION_SESION_SEGUNDOS * 1000);

  await db.insert(authSessions).values({
    sessionToken: token,
    userId: usuario.id,
    expires: expira,
  });

  return { token, expira, usuario };
}
