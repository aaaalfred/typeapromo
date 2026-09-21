/**
 * `POST /api/billing/portal` — Apertura del portal de gestión de suscripciones de Stripe.
 *
 * Requiere rol `owner` y un cliente de Stripe existente asociado al workspace.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { workspaces } from '@/db/schema';
import { requireActor } from '@/server/forms/actor';
import { esStripeConfigurado } from '@/server/billing/entorno';
import { crearSesionPortal } from '@/server/billing/stripe';
import { urlBaseDePeticion } from '@/server/auth/session-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const actor = await requireActor().catch(() => null);
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  if (actor.role !== 'owner') {
    return NextResponse.json(
      { error: 'Solo el propietario del espacio de trabajo puede gestionar la suscripción.' },
      { status: 403 },
    );
  }

  if (!esStripeConfigurado()) {
    return NextResponse.json(
      { error: 'El servicio de facturación no está configurado.' },
      { status: 503 },
    );
  }

  const [workspace] = await db
    .select({
      stripeCustomerId: workspaces.stripeCustomerId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, actor.workspaceId));

  if (!workspace?.stripeCustomerId) {
    return NextResponse.json(
      { error: 'El espacio de trabajo aún no tiene un cliente de Stripe asociado.' },
      { status: 400 },
    );
  }

  const baseUrl = urlBaseDePeticion(request);
  const portalUrl = await crearSesionPortal({
    stripeCustomerId: workspace.stripeCustomerId,
    baseUrl,
  });

  if (!portalUrl) {
    return NextResponse.json(
      { error: 'No se ha podido abrir el portal de cliente de Stripe.' },
      { status: 500 },
    );
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return NextResponse.json({ url: portalUrl });
  }

  return NextResponse.redirect(portalUrl, { status: 303 });
}
