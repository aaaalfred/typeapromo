/**
 * Configuración de Stripe y lectura del entorno.
 */

export function stripeApiKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key && key !== '' ? key : null;
}

export function stripeWebhookSecret(): string | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return secret && secret !== '' ? secret : null;
}

export function stripeProPriceId(): string | null {
  const priceId = process.env.STRIPE_PRO_PRICE_ID?.trim();
  return priceId && priceId !== '' ? priceId : null;
}

export function esStripeConfigurado(): boolean {
  return stripeApiKey() !== null;
}
