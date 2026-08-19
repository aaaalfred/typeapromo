/**
 * `POST /api/public/forms/:slug/sessions` — abre (o reanuda) la sesión de
 * respuesta.
 *
 * La ruta **no lleva token**: el de PR.md desapareció con PLAN.md · §2.1. El
 * token se genera aquí, se devuelve en una cookie `HttpOnly` + `SameSite=Lax` y
 * en base de datos solo queda su SHA-256.
 *
 * Es **idempotente por navegador**: si la cookie ya apunta a una sesión viva de
 * este formulario, se devuelve esa en lugar de crear otra. Sin esto, recargar la
 * página inflaría el contador de sesiones iniciadas y perdería lo respondido.
 * La sesión reanudada conserva **su** versión aunque entretanto se haya
 * publicado otra: es lo que hace que una segunda publicación no altere un
 * recorrido en curso.
 */

import type { NextRequest } from 'next/server';

import {
  aVistaSesion,
  cargarSesion,
  crearSesion,
  crearSesionSchema,
  exigirFormularioDisponible,
  slugPublicoSchema,
} from '@/server/responses';

import {
  aplicarLimite,
  conCookieDeSesion,
  jsonResponse,
  parseWith,
  readJsonBody,
  route,
  tokenDePeticion,
} from '../../../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return route(async () => {
    await aplicarLimite(request, 'sesiones');

    const { slug } = await context.params;
    parseWith(crearSesionSchema, await readJsonBody(request));

    const formulario = await exigirFormularioDisponible(parseWith(slugPublicoSchema, slug));

    const existente = await cargarSesion(
      formulario.formId,
      tokenDePeticion(request, formulario.formId),
    );

    if (existente !== null) {
      return jsonResponse({ sesion: aVistaSesion(existente), reanudada: true });
    }

    const { token, sesion } = await crearSesion(formulario);

    return conCookieDeSesion(
      jsonResponse({ sesion: aVistaSesion(sesion), reanudada: false }, 201),
      formulario.formId,
      token,
    );
  });
}
