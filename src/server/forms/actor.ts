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
 * La sesión se reevalúa contra el workspace autorizado en cada petición
 * (`evaluarSesion`), no solo al entrar: si `SLACK_TEAM_ID` cambia o alguien sale
 * del workspace, su sesión deja de valer sin esperar a que caduque.
 */

import { noAutenticado } from './errors';

/**
 * Usuario que ejecuta la operación.
 *
 * `id` viene siempre relleno: la sesión de Auth.js lo garantiza. Se mantiene
 * nulable porque `forms.created_by` y `form_drafts.updated_by` lo son en el
 * esquema, y el servicio no debe asumir autoría para escribir.
 */
export interface Actor {
  readonly id: string | null;
  readonly email: string | null;
  readonly name: string | null;
}

/**
 * Resuelve el actor a partir de la sesión, o `null` si no hay identidad válida.
 *
 * La importación de `@/lib/auth/sesion` es dinámica y no de nivel de módulo:
 * arrastra Auth.js y con él `@/db`, cuyo pool de `pg` se crea al importar y
 * lanza sin `DATABASE_URL`. Con la importación diferida, los tests que solo
 * comprueban que se falla cerrado no necesitan base de datos.
 */
export async function resolveActor(): Promise<Actor | null> {
  const { evaluarSesion, sesionActual } = await import('@/lib/auth/sesion');

  const sesion = await sesionActual();
  if (!sesion?.user?.id) return null;

  // El workspace se reevalúa en cada petición, no solo al iniciar sesión.
  if (!evaluarSesion(sesion).permitido) return null;

  return {
    id: sesion.user.id,
    email: sesion.user.email ?? null,
    name: sesion.user.name ?? null,
  };
}

/** Igual que `resolveActor`, pero lanza `FormsError` 401 en lugar de devolver `null`. */
export async function requireActor(): Promise<Actor> {
  const actor = await resolveActor();
  if (!actor) throw noAutenticado();
  return actor;
}
