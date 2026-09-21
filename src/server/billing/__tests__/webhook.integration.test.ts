import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type Stripe from 'stripe';

const hasDatabase = typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
const describeDb = hasDatabase ? describe : describe.skip;

type DbModule = typeof import('@/db');
type SchemaModule = typeof import('@/db/schema');
type DrizzleModule = typeof import('drizzle-orm');
type ServicioModule = typeof import('../servicio');

describeDb('webhook de Stripe e idempotencia · integración', () => {
  let dbModule: DbModule;
  let schema: SchemaModule;
  let drizzle: DrizzleModule;
  let servicio: ServicioModule;

  const testWsId = '88888888-bbbb-4444-8888-bbbbbbbbbbbb';
  const testCustomerId = 'cus_test_webhook_123';
  const testSubId = 'sub_test_webhook_123';

  beforeAll(async () => {
    [dbModule, schema, drizzle, servicio] = await Promise.all([
      import('@/db'),
      import('@/db/schema'),
      import('drizzle-orm'),
      import('../servicio'),
    ]);

    const { db } = dbModule;
    const { workspaces } = schema;

    await db
      .insert(workspaces)
      .values({
        id: testWsId,
        name: 'Workspace Webhook Test',
        slug: 'ws-webhook-test',
        plan: 'free',
        planStatus: 'active',
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    const { db } = dbModule;
    const { workspaces, stripeEvents, eq, inArray } = { ...schema, ...drizzle };

    await db.delete(workspaces).where(eq(workspaces.id, testWsId));
    await db
      .delete(stripeEvents)
      .where(
        inArray(stripeEvents.id, [
          'evt_checkout_test_1',
          'evt_sub_updated_test_1',
          'evt_sub_deleted_test_1',
          'evt_invoice_failed_test_1',
        ]),
      );
  });

  it('procesa checkout.session.completed y activa plan pro con customerId y subId', async () => {
    const eventoCheckout = {
      id: 'evt_checkout_test_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: testWsId,
          customer: testCustomerId,
          subscription: testSubId,
        },
      },
    } as unknown as Stripe.Event;

    const res1 = await servicio.procesarEventoStripe(eventoCheckout);
    expect(res1.procesado).toBe(true);
    expect(res1.duplicado).toBe(false);

    // Verificar en BD
    const { db } = dbModule;
    const { workspaces, eq } = { ...schema, ...drizzle };

    const [wsActualizado] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, testWsId));

    expect(wsActualizado).toBeDefined();
    expect(wsActualizado?.plan).toBe('pro');
    expect(wsActualizado?.planStatus).toBe('active');
    expect(wsActualizado?.stripeCustomerId).toBe(testCustomerId);
    expect(wsActualizado?.stripeSubscriptionId).toBe(testSubId);
  });

  it('idempotencia: procesar el mismo evento no repite mutación ni produce error', async () => {
    const eventoCheckout = {
      id: 'evt_checkout_test_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: testWsId,
          customer: testCustomerId,
          subscription: testSubId,
        },
      },
    } as unknown as Stripe.Event;

    const res2 = await servicio.procesarEventoStripe(eventoCheckout);
    expect(res2.procesado).toBe(true);
    expect(res2.duplicado).toBe(true);
  });

  it('customer.subscription.updated actualiza planStatus', async () => {
    const eventoUpdated = {
      id: 'evt_sub_updated_test_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: testSubId,
          status: 'past_due',
          metadata: { workspaceId: testWsId },
        },
      },
    } as unknown as Stripe.Event;

    const res = await servicio.procesarEventoStripe(eventoUpdated);
    expect(res.procesado).toBe(true);

    const { db } = dbModule;
    const { workspaces, eq } = { ...schema, ...drizzle };

    const [wsActualizado] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, testWsId));

    expect(wsActualizado?.planStatus).toBe('past_due');
  });

  it('invoice.payment_failed marca past_due por stripeCustomerId', async () => {
    const eventoInvoice = {
      id: 'evt_invoice_failed_test_1',
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: testCustomerId,
        },
      },
    } as unknown as Stripe.Event;

    const res = await servicio.procesarEventoStripe(eventoInvoice);
    expect(res.procesado).toBe(true);

    const { db } = dbModule;
    const { workspaces, eq } = { ...schema, ...drizzle };

    const [wsActualizado] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, testWsId));

    expect(wsActualizado?.planStatus).toBe('past_due');
  });

  it('customer.subscription.deleted degrada a free y canceled', async () => {
    const eventoDeleted = {
      id: 'evt_sub_deleted_test_1',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: testSubId,
          customer: testCustomerId,
          metadata: { workspaceId: testWsId },
        },
      },
    } as unknown as Stripe.Event;

    const res = await servicio.procesarEventoStripe(eventoDeleted);
    expect(res.procesado).toBe(true);

    const { db } = dbModule;
    const { workspaces, eq } = { ...schema, ...drizzle };

    const [wsActualizado] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, testWsId));

    expect(wsActualizado?.plan).toBe('free');
    expect(wsActualizado?.planStatus).toBe('canceled');
  });
});
