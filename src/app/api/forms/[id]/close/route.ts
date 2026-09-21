/**
 * `POST /api/forms/:id/close` — cierra el formulario.
 *
 * No admite parámetros: el mensaje de cierre vive en `meta.closedMessage` del
 * documento publicado, que es inmutable, y se configura en el editor antes de
 * publicar. Cerrar conserva todas las respuestas.
 */

import type { NextRequest } from 'next/server';

import { closeForm, formIdSchema, requireActor } from '@/server/forms';

import { jsonResponse, parseWith, route } from '../../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  return route(async () => {
    const actor = await requireActor();
    const { id } = await context.params;
    const form = await closeForm(parseWith(formIdSchema, id), actor);
    return jsonResponse({ form });
  });
}
