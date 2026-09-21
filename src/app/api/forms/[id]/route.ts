/**
 * `GET   /api/forms/:id` — formulario con su borrador y contadores.
 * `PATCH /api/forms/:id` — metadatos: título, slug y archivado.
 */

import type { NextRequest } from 'next/server';

import {
  formIdSchema,
  getForm,
  requireActor,
  updateFormMetadata,
  updateFormSchema,
} from '@/server/forms';

import { jsonResponse, parseWith, readJsonBody, route } from '../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** En el App Router los parámetros de ruta llegan como promesa. */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return route(async () => {
    const actor = await requireActor();
    const { id } = await context.params;
    const form = await getForm(parseWith(formIdSchema, id), actor);
    return jsonResponse({ form });
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return route(async () => {
    const actor = await requireActor();
    const { id } = await context.params;
    const input = parseWith(updateFormSchema, await readJsonBody(request));
    const form = await updateFormMetadata(parseWith(formIdSchema, id), input, actor);
    return jsonResponse({ form });
  });
}
