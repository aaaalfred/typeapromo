/**
 * `GET /api/billing/resumen` — Resumen de plan, uso de formularios y respuestas.
 */

import { NextResponse } from 'next/server';

import { requireActor } from '@/server/forms/actor';
import { obtenerResumenBilling } from '@/server/billing/servicio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await requireActor().catch(() => null);
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const resumen = await obtenerResumenBilling(actor.workspaceId);
  return NextResponse.json(resumen);
}
