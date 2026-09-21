import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FormDefinition } from '@/lib/forms';
import type { Actor } from '../actor';
import { isFormsError } from '../errors';

const hasDatabase = typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
const describeDb = hasDatabase ? describe : describe.skip;

type ServiceModule = typeof import('../service');
type DbModule = typeof import('@/db');
type SchemaModule = typeof import('@/db/schema');
type DrizzleModule = typeof import('drizzle-orm');

describeDb('aislamiento multi-inquilino de formularios por workspace', () => {
  let service: ServiceModule;
  let dbModule: DbModule;
  let schema: SchemaModule;
  let drizzle: DrizzleModule;

  const workspaceA = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const workspaceB = '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const actorA: Actor = {
    id: '33333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    email: 'user.a@workspace-a.test',
    name: 'Usuario A',
    workspaceId: workspaceA,
    role: 'owner',
  };

  const actorB: Actor = {
    id: '44444444-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    email: 'user.b@workspace-b.test',
    name: 'Usuario B',
    workspaceId: workspaceB,
    role: 'owner',
  };

  const creadosFormIds: string[] = [];

  beforeAll(async () => {
    [service, dbModule, schema, drizzle] = await Promise.all([
      import('../service'),
      import('@/db'),
      import('@/db/schema'),
      import('drizzle-orm'),
    ]);

    const { db } = dbModule;
    const { workspaces, workspaceMembers, users } = schema;

    // Crear workspaces de prueba A y B
    await db
      .insert(workspaces)
      .values([
        { id: workspaceA, name: 'Espacio A', slug: 'espacio-test-a', plan: 'free', planStatus: 'active' },
        { id: workspaceB, name: 'Espacio B', slug: 'espacio-test-b', plan: 'free', planStatus: 'active' },
      ])
      .onConflictDoNothing();

    // Crear usuarios de prueba A y B
    await db
      .insert(users)
      .values([
        { id: actorA.id!, email: actorA.email!, name: actorA.name, emailVerified: new Date() },
        { id: actorB.id!, email: actorB.email!, name: actorB.name, emailVerified: new Date() },
      ])
      .onConflictDoNothing();

    // Crear membresías
    await db
      .insert(workspaceMembers)
      .values([
        { workspaceId: workspaceA, userId: actorA.id!, role: 'owner' },
        { workspaceId: workspaceB, userId: actorB.id!, role: 'owner' },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    const { db } = dbModule;
    const { forms, workspaces, users } = schema;
    const { inArray } = drizzle;

    await db.delete(forms).where(inArray(forms.workspaceId, [workspaceA, workspaceB]));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceA, workspaceB]));
    await db.delete(users).where(inArray(users.id, [actorA.id!, actorB.id!]));
  });

  it('un formulario creado en el Workspace A pertenece a ese workspace', async () => {
    const formA = await service.createForm({ title: 'Formulario de A' }, actorA);
    creadosFormIds.push(formA.id);

    expect(formA.workspaceId).toBe(workspaceA);
  });

  it('los formularios del Workspace A no aparecen en el listado del Workspace B', async () => {
    const formA = await service.createForm({ title: 'Formulario Confidencial A' }, actorA);
    creadosFormIds.push(formA.id);

    const listadoB = await service.listForms({ page: 1, perPage: 50, sort: 'created' }, actorB);
    const encontradoEnB = listadoB.items.some((f) => f.id === formA.id);

    expect(encontradoEnB).toBe(false);

    const listadoA = await service.listForms({ page: 1, perPage: 50, sort: 'created' }, actorA);
    const encontradoEnA = listadoA.items.some((f) => f.id === formA.id);

    expect(encontradoEnA).toBe(true);
  });

  it('el actor del Workspace B recibe 404 al intentar obtener un formulario del Workspace A', async () => {
    const formA = await service.createForm({ title: 'Formulario Privado A' }, actorA);
    creadosFormIds.push(formA.id);

    // Obtener con actorA funciona
    const obtenidoPorA = await service.getForm(formA.id, actorA);
    expect(obtenidoPorA.id).toBe(formA.id);

    // Obtener con actorB lanza 404 (NO_ENCONTRADO) para no filtrar existencia
    const error: unknown = await service.getForm(formA.id, actorB).catch((e: unknown) => e);
    expect(isFormsError(error)).toBe(true);
    if (isFormsError(error)) {
      expect(error.code).toBe('NO_ENCONTRADO');
      expect(error.status).toBe(404);
    }
  });

  it('el actor del Workspace B no puede modificar metadatos de un formulario del Workspace A', async () => {
    const formA = await service.createForm({ title: 'Formulario Original A' }, actorA);
    creadosFormIds.push(formA.id);

    const error: unknown = await service
      .updateFormMetadata(formA.id, { title: 'Hackeado por B' }, actorB)
      .catch((e: unknown) => e);

    expect(isFormsError(error)).toBe(true);
    if (isFormsError(error)) {
      expect(error.code).toBe('NO_ENCONTRADO');
      expect(error.status).toBe(404);
    }
  });

  it('el actor del Workspace B no puede guardar borradores en un formulario del Workspace A', async () => {
    const formA = await service.createForm({ title: 'Formulario Intacto A' }, actorA);
    creadosFormIds.push(formA.id);

    const nuevaDefinicion: FormDefinition = {
      ...formA.definition,
      meta: { ...formA.definition.meta, title: 'Borrador modificado por B' },
    };

    const error: unknown = await service
      .saveDraft(formA.id, { revision: 1, definition: nuevaDefinicion }, actorB)
      .catch((e: unknown) => e);

    expect(isFormsError(error)).toBe(true);
    if (isFormsError(error)) {
      expect(error.code).toBe('NO_ENCONTRADO');
      expect(error.status).toBe(404);
    }
  });
});
