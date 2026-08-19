/**
 * `POST /api/media/:id/complete`
 *
 * Verifica el objeto subido —firma binaria real, tamaño y dimensiones leídas de
 * la cabecera antes de decodificar—, lo procesa con Sharp, publica las variantes
 * en el bucket público y borra el objeto de staging.
 *
 * No admite ningún parámetro más que el identificador: la clave de staging la
 * guarda el servidor desde `upload-intent`.
 */

import type { NextRequest } from 'next/server';

import {
  assetIdSchema,
  completarSubida,
  jsonResponse,
  parseWith,
  requiereActorMedia,
  route,
} from '@/server/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** En el App Router los parámetros de ruta llegan como promesa. */
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  return route(async () => {
    await requiereActorMedia();
    const { id } = await context.params;
    const asset = await completarSubida(parseWith(assetIdSchema, id));
    return jsonResponse({ asset });
  });
}
