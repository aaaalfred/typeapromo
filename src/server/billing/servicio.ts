/**
 * Servicio de facturación, control de cuotas por plan y procesamiento de webhooks.
 *
 * Soporta dos planes:
 * - Free: 1 formulario publicado simultáneo, 100 respuestas/mes por espacio.
 * - Pro: formularios publicados ilimitados, 10.000 respuestas/mes.
 */

import type Stripe from 'stripe';
import { esStripeConfigurado } from './entorno';

export const LIMITES_PLAN = {
  free: {
    formulariosPublicadosMax: 1,
    respuestasMesMax: 100,
  },
  pro: {
    formulariosPublicadosMax: Infinity,
    respuestasMesMax: 10_000,
  },
} as const;

export type PlanTipo = 'free' | 'pro';
export type PlanStatusTipo = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface ResumenBilling {
  plan: PlanTipo;
  planStatus: PlanStatusTipo;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  formulariosPublicados: number;
  formulariosPublicadosMax: number;
  respuestasMes: number;
  respuestasMesMax: number;
  puedePublicar: boolean;
  puedeResponder: boolean;
  stripeConfigurado: boolean;
}

/**
 * Obtiene el primer instante del mes en curso (en UTC).
 */
export function inicioDeMesActual(ahora: Date = new Date()): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Obtiene el resumen de facturación y uso para un espacio de trabajo.
 */
export async function obtenerResumenBilling(workspaceId: string): Promise<ResumenBilling> {
  const { db } = await import('@/db');
  const { workspaces, forms, responseSessions } = await import('@/db/schema');
  const { and, eq, gte, sql } = await import('drizzle-orm');

  const [workspace] = await db
    .select({
      plan: workspaces.plan,
      planStatus: workspaces.planStatus,
      stripeCustomerId: workspaces.stripeCustomerId,
      stripeSubscriptionId: workspaces.stripeSubscriptionId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));

  const plan: PlanTipo = workspace?.plan === 'pro' ? 'pro' : 'free';
  const planStatus: PlanStatusTipo = workspace?.planStatus ?? 'active';
  const limites = LIMITES_PLAN[plan];

  // 1. Contar formularios publicados activos en el workspace
  const [conteoForms] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(forms)
    .where(and(eq(forms.workspaceId, workspaceId), eq(forms.status, 'published')));

  const formulariosPublicados = conteoForms?.total ?? 0;

  // 2. Contar respuestas/sesiones del mes actual
  const inicioMes = inicioDeMesActual();
  const [conteoRespuestas] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(responseSessions)
    .innerJoin(forms, eq(responseSessions.formId, forms.id))
    .where(and(eq(forms.workspaceId, workspaceId), gte(responseSessions.startedAt, inicioMes)));

  const respuestasMes = conteoRespuestas?.total ?? 0;

  const puedePublicar = formulariosPublicados < limites.formulariosPublicadosMax;
  const puedeResponder = respuestasMes < limites.respuestasMesMax;

  return {
    plan,
    planStatus,
    stripeCustomerId: workspace?.stripeCustomerId ?? null,
    stripeSubscriptionId: workspace?.stripeSubscriptionId ?? null,
    formulariosPublicados,
    formulariosPublicadosMax: limites.formulariosPublicadosMax,
    respuestasMes,
    respuestasMesMax: limites.respuestasMesMax,
    puedePublicar,
    puedeResponder,
    stripeConfigurado: esStripeConfigurado(),
  };
}

/**
 * Comprueba si el workspace puede publicar un formulario adicional.
 */
export async function comprobarLimitePublicacion(
  workspaceId: string,
): Promise<{ permitido: boolean; motivo?: string }> {
  const resumen = await obtenerResumenBilling(workspaceId);
  if (resumen.plan === 'pro') {
    return { permitido: true };
  }

  if (resumen.formulariosPublicados >= resumen.formulariosPublicadosMax) {
    return {
      permitido: false,
      motivo:
        'El plan Free permite 1 formulario publicado simultáneo. Actualiza a Pro para publicar formularios ilimitados.',
    };
  }

  return { permitido: true };
}

/**
 * Comprueba si el workspace del formulario admite recibir una nueva respuesta/sesión este mes.
 */
export async function comprobarLimiteRespuestas(
  workspaceId: string,
): Promise<{ permitido: boolean; motivo?: string }> {
  const resumen = await obtenerResumenBilling(workspaceId);
  if (resumen.plan === 'pro') {
    return { permitido: true };
  }

  if (resumen.respuestasMes >= resumen.respuestasMesMax) {
    return {
      permitido: false,
      motivo: 'Este formulario ha alcanzado el límite mensual de respuestas de su plan.',
    };
  }

  return { permitido: true };
}

/**
 * Procesa un evento de webhook de Stripe garantizando idempotencia mediante la tabla `stripe_events`.
 */
export async function procesarEventoStripe(
  evento: Stripe.Event,
): Promise<{ procesado: boolean; duplicado?: boolean }> {
  const { db } = await import('@/db');
  const { stripeEvents, workspaces } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  // Comprobar idempotencia
  const [yaExiste] = await db
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(eq(stripeEvents.id, evento.id));

  if (yaExiste) {
    return { procesado: true, duplicado: true };
  }

  await db.transaction(async (tx) => {
    // Registrar el evento para prevenir ejecuciones repetidas
    await tx.insert(stripeEvents).values({
      id: evento.id,
      type: evento.type,
    });

    switch (evento.type) {
      case 'checkout.session.completed': {
        const session = evento.data.object as Stripe.Checkout.Session;
        const workspaceId =
          session.client_reference_id ?? (session.metadata?.workspaceId as string | undefined);

        if (workspaceId) {
          const customerId =
            typeof session.customer === 'string' ? session.customer : session.customer?.id;
          const subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription?.id;

          await tx
            .update(workspaces)
            .set({
              plan: 'pro',
              planStatus: 'active',
              stripeCustomerId: customerId ?? null,
              stripeSubscriptionId: subscriptionId ?? null,
              updatedAt: new Date(),
            })
            .where(eq(workspaces.id, workspaceId));
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = evento.data.object as Stripe.Subscription;
        const workspaceId = sub.metadata?.workspaceId as string | undefined;

        let statusMapeado: PlanStatusTipo = 'active';
        if (sub.status === 'past_due') statusMapeado = 'past_due';
        else if (sub.status === 'canceled' || sub.status === 'unpaid') statusMapeado = 'canceled';
        else if (sub.status === 'trialing') statusMapeado = 'trialing';

        if (workspaceId) {
          await tx
            .update(workspaces)
            .set({
              planStatus: statusMapeado,
              updatedAt: new Date(),
            })
            .where(eq(workspaces.id, workspaceId));
        } else if (sub.id) {
          await tx
            .update(workspaces)
            .set({
              planStatus: statusMapeado,
              updatedAt: new Date(),
            })
            .where(eq(workspaces.stripeSubscriptionId, sub.id));
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = evento.data.object as Stripe.Subscription;
        const workspaceId = sub.metadata?.workspaceId as string | undefined;

        if (workspaceId) {
          await tx
            .update(workspaces)
            .set({
              plan: 'free',
              planStatus: 'canceled',
              stripeSubscriptionId: null,
              updatedAt: new Date(),
            })
            .where(eq(workspaces.id, workspaceId));
        } else if (sub.id) {
          await tx
            .update(workspaces)
            .set({
              plan: 'free',
              planStatus: 'canceled',
              stripeSubscriptionId: null,
              updatedAt: new Date(),
            })
            .where(eq(workspaces.stripeSubscriptionId, sub.id));
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = evento.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

        if (customerId) {
          await tx
            .update(workspaces)
            .set({
              planStatus: 'past_due',
              updatedAt: new Date(),
            })
            .where(eq(workspaces.stripeCustomerId, customerId));
        }
        break;
      }

      default:
        // Otros eventos son registrados para idempotencia y omitidos
        break;
    }
  });

  return { procesado: true, duplicado: false };
}
