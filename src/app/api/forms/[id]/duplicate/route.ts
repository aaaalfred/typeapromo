/**
 * `POST /api/forms/:id/duplicate` — copia el formulario con su propio borrador y
 * referencias a los mismos activos visuales (`media_asset_refs`, ámbito
 * `draft`).
 */

import type { NextRequest } from 'next/server';

import {
  duplicateForm,
  duplicateFormSchema,
  formIdSchema,
  requireActor,
} from '@/server/forms';

import { jsonResponse, parseWith, readJsonBody, route } from '../../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return route(async () => {
    const actor = await requireActor();
    const { id } = await context.params;
    const input = parseWith(duplicateFormSchema, await readJsonBody(request));
    const form = await duplicateForm(parseWith(formIdSchema, id), input, actor);
    return jsonResponse({ form }, 201);
  });
}
