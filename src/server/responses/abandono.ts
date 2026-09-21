/**
 * Abandono derivado, no almacenado (PLAN.md · §2.9).
 *
 * No existe el valor `abandoned` en `response_session_status` ni se escribe ese
 * evento en `form_events`: una sesión está abandonada **si y solo si** no tiene
 * `completed_at` y su `last_activity_at` es de hace más de 30 minutos. Es una
 * consulta, no un estado, y por eso no hace falta ningún job periódico.
 *
 * La consecuencia que conviene tener presente: una sesión puede dejar de estar
 * abandonada. Si alguien vuelve a la pestaña dos horas después y responde otra
 * pregunta, `last_activity_at` se actualiza y la sesión sale del conjunto. Eso
 * es correcto —la persona no había abandonado— y es exactamente lo que no
 * podría deshacer un estado materializado.
 *
 * Módulo **puro**: aquí vive la regla; la fase 8 construye sus consultas con
 * ella.
 */

import { and, isNull, lt, type SQL } from 'drizzle-orm';

import { responseSessions } from '@/db/schema';

/** Minutos de inactividad a partir de los cuales se considera abandonada. */
export const MINUTOS_PARA_ABANDONO = 30;

export function limiteDeAbandono(ahora: Date): Date {
  return new Date(ahora.getTime() - MINUTOS_PARA_ABANDONO * 60_000);
}

/** Forma mínima de una sesión para decidir si cuenta como abandonada. */
export interface SesionParaAbandono {
  readonly completedAt: Date | null;
  readonly lastActivityAt: Date;
}

export function estaAbandonada(sesion: SesionParaAbandono, ahora: Date): boolean {
  if (sesion.completedAt !== null) return false;
  return sesion.lastActivityAt.getTime() < limiteDeAbandono(ahora).getTime();
}

/**
 * Traducción literal del predicado a SQL:
 *
 * ```sql
 * completed_at IS NULL AND last_activity_at < now() - interval '30 minutes'
 * ```
 */
export function condicionAbandonada(ahora: Date): SQL | undefined {
  return and(
    isNull(responseSessions.completedAt),
    lt(responseSessions.lastActivityAt, limiteDeAbandono(ahora)),
  );
}
