/**
 * Cliente de integración con Stripe para suscripciones y portal de clientes.
 */

import Stripe from 'stripe';
import { stripeApiKey, stripeProPriceId } from './entorno';

export function obtenerStripe(): Stripe | null {
  const apiKey = stripeApiKey();
  if (!apiKey) return null;
  return new Stripe(apiKey, {
    apiVersion: '2026-08-26.dahlia',
    typescript: true,
  });
}

export async function crearSesionCheckout(opciones: {
  workspaceId: string;
  customerEmail?: string | null;
  stripeCustomerId?: string | null;
  baseUrl: string;
}): Promise<string | null> {
  const stripe = obtenerStripe();
  if (!stripe) return null;

  const priceId = stripeProPriceId();
  if (!priceId) {
    throw new Error('Falta la variable de entorno STRIPE_PRO_PRICE_ID');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    customer: opciones.stripeCustomerId ?? undefined,
    customer_email: opciones.stripeCustomerId ? undefined : (opciones.customerEmail ?? undefined),
    client_reference_id: opciones.workspaceId,
    metadata: {
      workspaceId: opciones.workspaceId,
    },
    subscription_data: {
      metadata: {
        workspaceId: opciones.workspaceId,
      },
    },
    success_url: `${opciones.baseUrl}/app/plan?exito=1`,
    cancel_url: `${opciones.baseUrl}/app/plan?cancelado=1`,
  });

  return session.url;
}

export async function crearSesionPortal(opciones: {
  stripeCustomerId: string;
  baseUrl: string;
}): Promise<string | null> {
  const stripe = obtenerStripe();
  if (!stripe) return null;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: opciones.stripeCustomerId,
    return_url: `${opciones.baseUrl}/app/plan`,
  });

  return portalSession.url;
}
