/**
 * `POST /api/billing/checkout` — Creación de sesión de Stripe Checkout para suscripción Pro.
 *
 * Requiere rol de propietario (`owner`) en el espacio de trabajo.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { workspaces } from '@/db/schema';
import { requireActor } from '@/server/forms/actor';
import { esStripeConfigurado } from '@/server/billing/entorno';
import { crearSesionCheckout } from '@/server/billing/stripe';
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
      { error: 'Solo el propietario del espacio de trabajo puede gestionar la facturación.' },
      { status: 403 },
    );
  }

  if (!esStripeConfigurado()) {
    return NextResponse.json(
      { error: 'El servicio de facturación no está configurado en este entorno.' },
      { status: 503 },
    );
  }

  const [workspace] = await db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      stripeCustomerId: workspaces.stripeCustomerId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, actor.workspaceId));

  if (!workspace) {
    return NextResponse.json({ error: 'Espacio de trabajo no encontrado' }, { status: 404 });
  }

  const baseUrl = urlBaseDePeticion(request);
  const checkoutUrl = await crearSesionCheckout({
    workspaceId: workspace.id,
    customerEmail: actor.email,
    stripeCustomerId: workspace.stripeCustomerId,
    baseUrl,
  });

  if (!checkoutUrl) {
    return NextResponse.json(
      { error: 'No se ha podido iniciar el proceso de pago con Stripe.' },
      { status: 500 },
    );
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return NextResponse.json({ url: checkoutUrl });
  }

  return NextResponse.redirect(checkoutUrl, { status: 303 });
}
