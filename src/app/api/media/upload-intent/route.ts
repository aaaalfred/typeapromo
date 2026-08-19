/**
 * `POST /api/media/upload-intent`
 *
 * Valida sesión, MIME y tamaño declarados, crea el activo en estado `uploading`
 * y devuelve una URL `PUT` prefirmada contra el bucket **privado** de staging.
 * Los bytes nunca pasan por la aplicación.
 */

import type { NextRequest } from 'next/server';

import {
  crearIntentoDeSubida,
  jsonResponse,
  parseWith,
  readJsonBody,
  requiereActorMedia,
  route,
  uploadIntentSchema,
} from '@/server/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return route(async () => {
    const actor = await requiereActorMedia();
    const input = parseWith(uploadIntentSchema, await readJsonBody(request));
    const resultado = await crearIntentoDeSubida(input, actor);
    return jsonResponse(resultado, 201);
  });
}
