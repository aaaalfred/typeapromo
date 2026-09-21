/**
 * `POST /api/stripe/webhook` — Endpoint de recepción de eventos de Stripe.
 *
 * Valida la firma del webhook con `STRIPE_WEBHOOK_SECRET` y procesa los eventos
 * de forma idempotente a través de la tabla `stripe_events`.
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { stripeWebhookSecret } from '@/server/billing/entorno';
import { obtenerStripe } from '@/server/billing/stripe';
import { procesarEventoStripe } from '@/server/billing/servicio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const webhookSecret = stripeWebhookSecret();
  if (!webhookSecret) {
    console.error('[STRIPE WEBHOOK] Falta STRIPE_WEBHOOK_SECRET en las variables de entorno.');
    return NextResponse.json(
      { error: 'Webhook no configurado en el servidor' },
      { status: 500 },
    );
  }

  const firma = request.headers.get('stripe-signature');
  if (!firma) {
    return NextResponse.json(
      { error: 'Falta el encabezado stripe-signature' },
      { status: 400 },
    );
  }

  const stripe = obtenerStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: 'Cliente de Stripe no disponible' },
      { status: 500 },
    );
  }

  let evento: Stripe.Event;
  try {
    const cuerpoTexto = await request.text();
    evento = stripe.webhooks.constructEvent(cuerpoTexto, firma, webhookSecret);
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : 'Firma de webhook no válida';
    console.warn('[STRIPE WEBHOOK] Error de validación de firma:', mensaje);
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }

  try {
    const resultado = await procesarEventoStripe(evento);
    return NextResponse.json({ received: true, ...resultado });
  } catch (err: unknown) {
    console.error('[STRIPE WEBHOOK] Error al procesar evento:', err);
    return NextResponse.json(
      { error: 'Error interno al procesar el evento de Stripe' },
      { status: 500 },
    );
  }
}
