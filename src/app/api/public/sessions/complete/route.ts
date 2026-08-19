/**
 * `POST /api/public/sessions/complete` — cierra la sesión de respuesta.
 *
 * Sin segmento `:token`: la sesión sale de la cookie `HttpOnly`
 * (PLAN.md · §2.1).
 *
 * Es **idempotente**: llamarla dos veces devuelve el mismo estado sin volver a
 * escribir ni a registrar el evento de finalización. La pantalla final se puede
 * recargar y una conexión inestable puede reenviar la petición.
 *
 * La cookie se borra al terminar. La sesión sigue en la base de datos con sus
 * respuestas —eso es lo que se analiza y se exporta—, pero ya no hay nada que
 * reanudar y conservar el token solo dejaría un secreto vivo sin utilidad.
 */

import type { NextRequest } from 'next/server';

import { completarSesion, completarSesionSchema } from '@/server/responses';

import {
  aplicarLimite,
  jsonResponse,
  parseWith,
  readJsonBody,
  route,
  sinCookieDeSesion,
  tokenDePeticion,
} from '../../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return route(async () => {
    await aplicarLimite(request, 'completar');

    const cuerpo = parseWith(completarSesionSchema, await readJsonBody(request));

    const resultado = await completarSesion(
      cuerpo.formId,
      tokenDePeticion(request, cuerpo.formId),
    );

    return sinCookieDeSesion(jsonResponse({ sesion: resultado.vista }), cuerpo.formId);
  });
}
