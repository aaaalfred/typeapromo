/**
 * `POST /api/forms`  — crea un formulario con su borrador.
 * `GET  /api/forms`  — listado del panel: búsqueda, filtro y contadores.
 */

import type { NextRequest } from 'next/server';

import {
  createForm,
  createFormSchema,
  listForms,
  listFormsQueryFromSearchParams,
  listFormsQuerySchema,
  requireActor,
} from '@/server/forms';

import { jsonResponse, parseWith, readJsonBody, route } from './_http';

// Drizzle sobre el driver `pg` no funciona en Edge (PLAN.md · §3).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return route(async () => {
    const actor = await requireActor();
    const input = parseWith(createFormSchema, await readJsonBody(request));
    const form = await createForm(input, actor);
    return jsonResponse({ form }, 201);
  });
}

export async function GET(request: NextRequest) {
  return route(async () => {
    await requireActor();
    const query = parseWith(
      listFormsQuerySchema,
      listFormsQueryFromSearchParams(request.nextUrl.searchParams),
    );
    return jsonResponse(await listForms(query));
  });
}
