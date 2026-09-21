/**
 * Identidad del usuario que ejecuta una operación de la API de formularios.
 *
 * Es el **único** punto de la fase 3 que conoce la identidad: ni el servicio ni
 * las rutas la resuelven por su cuenta, todos dependen de `requireActor()`.
 *
 * **Falla cerrada.** Sin sesión válida no hay actor y la ruta responde `401`.
 * Aquí no se redirige, a diferencia de `requiereSesion()`, que es para páginas:
 * un cliente de API que recibe un 302 hacia el login en vez de un 401 no puede
 * distinguir «no autenticado» de «la respuesta es una página de HTML».
 *
 * Cada actor pertenece a un `workspaceId` (aislamiento multi-inquilino) con un
 * rol determinado (`owner` | `member`).
 */

import type { WorkspaceRole } from '@/db/schema/workspaces';
import { noAutenticado } from './errors';

/**
 * Usuario que ejecuta la operación, con su espacio de trabajo y rol.
 */
export interface Actor {
  readonly id: string | null;
  readonly email: string | null;
  readonly name: string | null;
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
}

/**
 * Resuelve la membresía de workspace para un usuario dado.
 */
export async function obtenerMembresiaActor(
  userId: string,
): Promise<{ workspaceId: string; role: WorkspaceRole } | null> {
  const { db } = await import('@/db');
  const { workspaceMembers } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const [row] = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);

  return row ?? null;
}

/**
 * Resuelve el actor a partir de la sesión, o `null` si no hay identidad válida
 * o no tiene ningún workspace asignado.
 */
export async function resolveActor(): Promise<Actor | null> {
  const { evaluarSesion, sesionActual } = await import('@/lib/auth/sesion');

  const sesion = await sesionActual();
  if (!sesion?.user?.id) return null;

  // El workspace/guard se reevalúa en cada petición, no solo al iniciar sesión.
  if (!evaluarSesion(sesion).permitido) return null;

  const membresia = await obtenerMembresiaActor(sesion.user.id);
  if (!membresia) return null;

  return {
    id: sesion.user.id,
    email: sesion.user.email ?? null,
    name: sesion.user.name ?? null,
    workspaceId: membresia.workspaceId,
    role: membresia.role,
  };
}

/** Igual que `resolveActor`, pero lanza `FormsError` 401 en lugar de devolver `null`. */
export async function requireActor(): Promise<Actor> {
  const actor = await resolveActor();
  if (!actor) throw noAutenticado();
  return actor;
}
