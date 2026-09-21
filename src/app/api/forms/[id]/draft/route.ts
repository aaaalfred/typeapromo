/**
 * `PUT /api/forms/:id/draft` — guardado del borrador con **revisión optimista**.
 *
 * El cliente envía la revisión que leyó. Si ya no es la del servidor, la
 * respuesta es `409` con `details.revisionServidor` en el cuerpo; nunca una
 * sobrescritura silenciosa. Es el criterio de «hecho» de la fase 3: dos pestañas
 * editando el mismo borrador producen un `409` limpio en la segunda.
 */

import type { NextRequest } from 'next/server';

import { formIdSchema, requireActor, saveDraft, saveDraftSchema } from '@/server/forms';

import { jsonResponse, parseWith, readJsonBody, route } from '../../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  return route(async () => {
    const actor = await requireActor();
    const { id } = await context.params;
    const input = parseWith(saveDraftSchema, await readJsonBody(request));
    const draft = await saveDraft(parseWith(formIdSchema, id), input, actor);
    return jsonResponse({ draft });
  });
}
