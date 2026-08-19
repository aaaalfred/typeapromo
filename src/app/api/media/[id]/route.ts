/**
 * `GET    /api/media/:id` — estado del activo y sus URL públicas.
 * `DELETE /api/media/:id` — borrado seguro respetando `media_asset_refs`.
 *
 * El `DELETE` de un activo en uso responde `409 ACTIVO_REFERENCIADO` con un
 * mensaje que explica dónde se usa, nunca un `500`.
 */

import type { NextRequest } from 'next/server';

import {
  assetIdSchema,
  borrarActivo,
  contarReferencias,
  jsonResponse,
  obtenerActivo,
  parseWith,
  requiereActorMedia,
  route,
} from '@/server/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** En el App Router los parámetros de ruta llegan como promesa. */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return route(async () => {
    await requiereActorMedia();
    const { id } = await context.params;
    const assetId = parseWith(assetIdSchema, id);
    const [asset, referencias] = await Promise.all([
      obtenerActivo(assetId),
      contarReferencias(assetId),
    ]);
    return jsonResponse({ asset, referencias });
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return route(async () => {
    await requiereActorMedia();
    const { id } = await context.params;
    const resultado = await borrarActivo(parseWith(assetIdSchema, id));
    return jsonResponse(resultado);
  });
}
