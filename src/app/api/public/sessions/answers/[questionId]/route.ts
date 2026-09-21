/**
 * `PUT /api/public/sessions/answers/:questionId` — autosave al avanzar.
 *
 * Sin segmento `:token`: la sesión sale de la cookie `HttpOnly` (PLAN.md · §2.1)
 * y el cuerpo solo dice **de qué formulario** se trata, porque la cookie es una
 * por formulario.
 *
 * La escritura es un upsert idempotente sobre el índice único
 * `(session_id, question_id)`: retroceder y corregir una respuesta actualiza la
 * fila, nunca duplica. Y el destino lo calcula el motor **en el servidor**: el
 * navegador puede pedir guardar, no elegir a dónde va el recorrido.
 *
 * Si esto falla, el renderer no cambia de pantalla y muestra el error sin perder
 * lo introducido: es el contrato de `onAvanzar` del renderer compartido.
 */

import type { NextRequest } from 'next/server';

import { guardarRespuesta, guardarRespuestaSchema, questionIdSchema } from '@/server/responses';

import { aplicarLimite, jsonResponse, parseWith, readJsonBody, route, tokenDePeticion } from '../../../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ questionId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  return route(async () => {
    await aplicarLimite(request, 'respuestas');

    const { questionId } = await context.params;
    const cuerpo = parseWith(guardarRespuestaSchema, await readJsonBody(request));

    const resultado = await guardarRespuesta({
      formId: cuerpo.formId,
      token: tokenDePeticion(request, cuerpo.formId),
      questionId: parseWith(questionIdSchema, questionId),
      valor: cuerpo.value,
    });

    return jsonResponse({ sesion: resultado.vista, terminado: resultado.terminado });
  });
}
