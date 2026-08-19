/**
 * Acceso a la sesión desde el servidor.
 *
 * `src/proxy.ts` solo hace una comprobación optimista (¿hay cookie?), tal y como
 * recomienda la documentación de Next para el Proxy. La autorización de verdad
 * se hace aquí, con la sesión leída de PostgreSQL, y es lo que deben usar las
 * páginas de `/app/**` y las rutas de `/api/forms/**`.
 */

import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';

import { auth } from '@/auth';

import { esBypassActivo, teamIdAutorizado } from './entorno';
import { urlDeAccesoDenegado, urlDeLogin } from './rutas';
import { evaluarSesionPersistida, type ResultadoGuard } from './workspace';

/** Sesión actual, o `null` si no hay ninguna. No redirige. */
export async function sesionActual(): Promise<Session | null> {
  return auth();
}

/**
 * Reevalúa el workspace de una sesión ya emitida.
 *
 * Es la segunda mitad del guard: el `team_id` se comprueba al entrar y también
 * en cada petición protegida, contra el valor persistido en `users`. Así, si
 * `SLACK_TEAM_ID` cambia o alguien se saca del workspace, la sesión que ya
 * tenía deja de servir sin esperar a que caduque.
 */
export function evaluarSesion(sesion: Session | null): ResultadoGuard {
  if (sesion?.user === undefined) {
    return { permitido: false, motivo: 'claim-ausente' };
  }
  return evaluarSesionPersistida(sesion.user, teamIdAutorizado(), {
    bypassActivo: esBypassActivo(),
  });
}

/**
 * Exige una sesión válida del workspace autorizado.
 *
 * Redirige al login si no hay sesión y a `/acceso-denegado` si la hay pero ya no
 * vale. Devuelve la sesión para poder usar `sesion.user.id` sin comprobaciones
 * adicionales.
 *
 * @param destino Ruta a la que volver tras iniciar sesión.
 */
export async function requiereSesion(destino?: string): Promise<Session> {
  const sesion = await sesionActual();

  if (sesion?.user === undefined) {
    redirect(urlDeLogin(destino));
  }

  const veredicto = evaluarSesion(sesion);
  if (!veredicto.permitido) {
    redirect(urlDeAccesoDenegado(veredicto.motivo));
  }

  return sesion;
}
