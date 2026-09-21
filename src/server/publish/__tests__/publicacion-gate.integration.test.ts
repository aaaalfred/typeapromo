import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '@/server/forms/actor';
import { isFormsError } from '@/server/forms/errors';

const hasDatabase = typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
const describeDb = hasDatabase ? describe : describe.skip;

type PublishModule = typeof import('../publicar');
type ServiceModule = typeof import('@/server/forms/service');
type DbModule = typeof import('@/db');
type SchemaModule = typeof import('@/db/schema');
type DrizzleModule = typeof import('drizzle-orm');
type FixturesModule = typeof import('@/lib/forms/__tests__/fixtures');

describeDb('gate de publicación según el plan del workspace · integración', () => {
  let publish: PublishModule;
  let service: ServiceModule;
  let dbModule: DbModule;
  let schema: SchemaModule;
  let drizzle: DrizzleModule;
  let fixtures: FixturesModule;

  const testWsId = '77777777-cccc-4444-7777-cccccccccccc';
  const testUserId = '66666666-cccc-4444-6666-cccccccccccc';

  const actor: Actor = {
    id: testUserId,
    email: 'gate@typeapromo.local',
    name: 'Gate Tester',
    workspaceId: testWsId,
    role: 'owner',
  };

  const creados: string[] = [];

  beforeAll(async () => {
    [publish, service, dbModule, schema, drizzle, fixtures] = await Promise.all([
      import('../publicar'),
      import('@/server/forms/service'),
      import('@/db'),
      import('@/db/schema'),
      import('drizzle-orm'),
      import('@/lib/forms/__tests__/fixtures'),
    ]);

    const { db } = dbModule;
    const { workspaces, users, workspaceMembers } = schema;

    // Crear workspace en plan 'free'
    await db
      .insert(workspaces)
      .values({
        id: testWsId,
        name: 'Workspace Plan Free Gate',
        slug: 'ws-plan-free-gate',
        plan: 'free',
        planStatus: 'active',
      })
      .onConflictDoNothing();

    await db
      .insert(users)
      .values({
        id: testUserId,
        email: actor.email!,
        name: actor.name,
      })
      .onConflictDoNothing();

    await db
      .insert(workspaceMembers)
      .values({
        workspaceId: testWsId,
        userId: testUserId,
        role: 'owner',
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    const { db } = dbModule;
    const { forms, workspaces, users, eq } = { ...schema, ...drizzle };

    await db.delete(forms).where(eq(forms.workspaceId, testWsId));
    await db.delete(workspaces).where(eq(workspaces.id, testWsId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  function documentoValido(etiqueta: string) {
    return fixtures.makeForm({
      title: `Formulario ${etiqueta}`,
      blocks: [
        fixtures.welcome('inicio'),
        fixtures.shortText('nombre', { required: true }),
      ],
      endScreens: [fixtures.ending('fin')],
    });
  }

  it('permite publicar el 1º formulario en plan Free', async () => {
    const form1 = await service.createForm(
      { title: 'Primer Formulario', definition: documentoValido('1') },
      actor,
    );
    creados.push(form1.id);

    const resultado = await publish.publishForm(form1.id, { revision: 1 }, actor);
    expect(resultado.form.status).toBe('published');
    expect(resultado.version.versionNumber).toBe(1);
  });

  it('bloquea la publicación del 2º formulario en plan Free con PLAN_INSUFICIENTE (402)', async () => {
    const form2 = await service.createForm(
      { title: 'Segundo Formulario', definition: documentoValido('2') },
      actor,
    );
    creados.push(form2.id);

    const error: unknown = await publish
      .publishForm(form2.id, { revision: 1 }, actor)
      .catch((e: unknown) => e);

    expect(isFormsError(error)).toBe(true);
    if (isFormsError(error)) {
      expect(error.code).toBe('PLAN_INSUFICIENTE');
      expect(error.status).toBe(402);
      expect(error.message).toContain('El plan Free permite 1 formulario publicado');
    }
  });

  it('tras actualizar el workspace a plan Pro, se permite publicar el 2º formulario', async () => {
    const { db } = dbModule;
    const { workspaces, eq } = { ...schema, ...drizzle };

    // Actualizar a plan Pro
    await db
      .update(workspaces)
      .set({ plan: 'pro', planStatus: 'active' })
      .where(eq(workspaces.id, testWsId));

    const form2Id = creados[1];
    if (!form2Id) throw new Error('form2Id no existe');

    const resultado = await publish.publishForm(form2Id, { revision: 1 }, actor);
    expect(resultado.form.status).toBe('published');
    expect(resultado.version.versionNumber).toBe(1);
  });
});
