// @vitest-environment node

/**
 * Integración contra PostgreSQL de verdad.
 *
 * **Se salta solo cuando no hay `DATABASE_URL`**, para que CI siga en verde sin
 * base de datos. Con la base levantada:
 *
 * ```bash
 * DATABASE_URL=postgresql://typeapromo:typeapromo@localhost:5432/typeapromo \
 *   npx vitest run src/server
 * ```
 *
 * Cubre el criterio de «hecho» de la fase 3: dos pestañas editando el mismo
 * borrador producen un `409` limpio en la segunda.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FormDefinition } from '@/lib/forms';

import type { Actor } from '../actor';

const hasDatabase = typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
const describeDb = hasDatabase ? describe : describe.skip;

type ServiceModule = typeof import('../service');
type DbModule = typeof import('@/db');
type SchemaModule = typeof import('@/db/schema');
type DrizzleModule = typeof import('drizzle-orm');
type FormsLibModule = typeof import('@/lib/forms');

describeDb('servicio de formularios · integración', () => {
  let service: ServiceModule;
  let dbModule: DbModule;
  let schema: SchemaModule;
  let drizzle: DrizzleModule;
  let formsLib: FormsLibModule;

  const actor: Actor = {
    id: null,
    email: 'integracion@typeapromo.local',
    name: 'Integración',
    workspaceId: '00000000-0000-0000-0000-000000000001',
    role: 'owner',
  };

  /** Sufijo único para que los slugs no choquen con datos preexistentes. */
  const sufijo = Date.now().toString(36);
  const creados: string[] = [];
  let assetId: string | null = null;

  beforeAll(async () => {
    [service, dbModule, schema, drizzle, formsLib] = await Promise.all([
      import('../service'),
      import('@/db'),
      import('@/db/schema'),
      import('drizzle-orm'),
      import('@/lib/forms'),
    ]);
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    if (creados.length > 0) {
      await dbModule.db
        .delete(schema.forms)
        .where(drizzle.inArray(schema.forms.id, creados));
    }
    if (assetId !== null) {
      await dbModule.db
        .delete(schema.mediaAssets)
        .where(drizzle.eq(schema.mediaAssets.id, assetId));
    }
    await dbModule.pool.end();
  });

  async function crear(titulo: string) {
    const form = await service.createForm({ title: titulo }, actor);
    creados.push(form.id);
    return form;
  }

  it('crea el formulario con su borrador, slug derivado y contadores a cero', async () => {
    const form = await crear(`Encuesta de Satisfacción ${sufijo}`);

    expect(form.slug).toBe(`encuesta-de-satisfaccion-${sufijo}`);
    expect(form.status).toBe('draft');
    expect(form.draft).toEqual({ revision: 1, updatedAt: expect.any(Date) as Date });
    expect(form.definition.meta.title).toBe(`Encuesta de Satisfacción ${sufijo}`);
    expect(form.responses).toEqual({ sessions: 0, completed: 0 });
    expect(form.activeVersionId).toBeNull();
  });

  it('resuelve la colisión de slug de forma determinista', async () => {
    const primero = await crear(`Colisión ${sufijo}`);
    const segundo = await crear(`Colisión ${sufijo}`);
    const tercero = await crear(`Colisión ${sufijo}`);

    expect(primero.slug).toBe(`colision-${sufijo}`);
    expect(segundo.slug).toBe(`colision-${sufijo}-2`);
    expect(tercero.slug).toBe(`colision-${sufijo}-3`);
  });

  it('lista con búsqueda, filtro por estado y paginación', async () => {
    const form = await crear(`Listable ${sufijo}`);

    const pagina = await service.listForms({
      q: `Listable ${sufijo}`,
      page: 1,
      perPage: 20,
      sort: 'updated',
    });

    expect(pagina.total).toBe(1);
    expect(pagina.items[0]?.id).toBe(form.id);
    expect(pagina.items[0]?.responses).toEqual({ sessions: 0, completed: 0 });

    const publicados = await service.listForms({
      q: `Listable ${sufijo}`,
      status: 'published',
      page: 1,
      perPage: 20,
      sort: 'updated',
    });
    expect(publicados.total).toBe(0);
  });

  it('deja fuera los archivados salvo que se pidan', async () => {
    const form = await crear(`Archivable ${sufijo}`);
    await service.archiveForm(form.id, actor);

    const consulta = { q: `Archivable ${sufijo}`, page: 1, perPage: 20, sort: 'updated' } as const;

    expect((await service.listForms(consulta)).total).toBe(0);
    expect((await service.listForms({ ...consulta, includeArchived: true })).total).toBe(1);

    const restaurado = await service.unarchiveForm(form.id, actor);
    expect(restaurado.status).toBe('draft');
    expect(restaurado.archivedAt).toBeNull();
  });

  it('guarda el borrador y devuelve la revisión incrementada', async () => {
    const form = await crear(`Borrador ${sufijo}`);
    const definition: FormDefinition = {
      ...form.definition,
      meta: { ...form.definition.meta, title: `Borrador editado ${sufijo}` },
    };

    const guardado = await service.saveDraft(form.id, { revision: 1, definition }, actor);

    expect(guardado.revision).toBe(2);
    expect(guardado.title).toBe(`Borrador editado ${sufijo}`);

    const releido = await service.getForm(form.id);
    expect(releido.title).toBe(`Borrador editado ${sufijo}`);
    expect(releido.definition.meta.title).toBe(`Borrador editado ${sufijo}`);
    expect(releido.draft?.revision).toBe(2);
  });

  it('dos pestañas sobre el mismo borrador: la segunda recibe conflicto, no sobrescritura', async () => {
    const form = await crear(`Dos pestañas ${sufijo}`);

    // Ambas pestañas leyeron la revisión 1.
    const pestanaA: FormDefinition = {
      ...form.definition,
      meta: { ...form.definition.meta, title: 'Versión de la pestaña A' },
    };
    const pestanaB: FormDefinition = {
      ...form.definition,
      meta: { ...form.definition.meta, title: 'Versión de la pestaña B' },
    };

    await service.saveDraft(form.id, { revision: 1, definition: pestanaA }, actor);

    const error: unknown = await service
      .saveDraft(form.id, { revision: 1, definition: pestanaB }, actor)
      .catch((reason: unknown) => reason);

    const { isFormsError } = await import('../errors');
    expect(isFormsError(error)).toBe(true);
    if (isFormsError(error)) {
      expect(error.code).toBe('CONFLICTO_REVISION');
      expect(error.status).toBe(409);
      expect(error.details).toEqual({ revisionEnviada: 1, revisionServidor: 2 });
    }

    // Lo escrito por la primera pestaña sigue intacto.
    const releido = await service.getForm(form.id);
    expect(releido.definition.meta.title).toBe('Versión de la pestaña A');
    expect(releido.draft?.revision).toBe(2);
  });

  it('renombrar desde los metadatos sincroniza el documento e incrementa la revisión', async () => {
    const form = await crear(`Renombrable ${sufijo}`);

    const renombrado = await service.updateFormMetadata(
      form.id,
      { title: `Renombrado ${sufijo}` },
      actor,
    );

    expect(renombrado.title).toBe(`Renombrado ${sufijo}`);
    expect(renombrado.definition.meta.title).toBe(`Renombrado ${sufijo}`);
    expect(renombrado.draft?.revision).toBe(2);
    // El slug es estable: renombrar no rompe los enlaces públicos ya repartidos.
    expect(renombrado.slug).toBe(form.slug);
  });

  it('mantiene `media_asset_refs` en cada guardado y al duplicar', async () => {
    const [asset] = await dbModule.db
      .insert(schema.mediaAssets)
      .values({
        status: 'ready',
        bucket: 'forms-media-public',
        publicKey: `pruebas/${sufijo}.webp`,
        mimeType: 'image/webp',
        byteSize: 1024,
      })
      .returning({ id: schema.mediaAssets.id });

    expect(asset).toBeDefined();
    assetId = asset?.id ?? null;
    if (assetId === null) return;

    const form = await crear(`Con imagen ${sufijo}`);

    const conLogo: FormDefinition = {
      ...form.definition,
      theme: { ...form.definition.theme, logoAssetId: assetId },
    };
    await service.saveDraft(form.id, { revision: 1, definition: conLogo }, actor);

    const refsOriginal = await dbModule.db
      .select({ id: schema.mediaAssetRefs.id, scope: schema.mediaAssetRefs.scope })
      .from(schema.mediaAssetRefs)
      .where(drizzle.eq(schema.mediaAssetRefs.formId, form.id));

    expect(refsOriginal).toHaveLength(1);
    expect(refsOriginal[0]?.scope).toBe('draft');

    // Duplicar comparte activos: la copia necesita su propia referencia o el
    // borrado seguro de la fase 6 creería que la imagen ya no la usa nadie.
    const copia = await service.duplicateForm(form.id, {}, actor);
    creados.push(copia.id);

    expect(copia.id).not.toBe(form.id);
    expect(copia.slug).not.toBe(form.slug);
    expect(copia.status).toBe('draft');
    expect(copia.draft?.revision).toBe(1);
    expect(copia.definition.theme.logoAssetId).toBe(assetId);
    expect(copia.title).toBe(`${form.title} (copia)`);

    const refsAsset = await dbModule.db
      .select({ formId: schema.mediaAssetRefs.formId })
      .from(schema.mediaAssetRefs)
      .where(drizzle.eq(schema.mediaAssetRefs.assetId, assetId));

    expect(refsAsset.map((ref) => ref.formId).sort()).toEqual([form.id, copia.id].sort());

    // Quitar la imagen del borrador retira la referencia del original y deja la de la copia.
    const sinLogo: FormDefinition = formsLib.parseFormDefinition({
      ...conLogo,
      theme: { ...conLogo.theme, logoAssetId: undefined },
    });
    await service.saveDraft(form.id, { revision: 2, definition: sinLogo }, actor);

    const refsTrasBorrar = await dbModule.db
      .select({ formId: schema.mediaAssetRefs.formId })
      .from(schema.mediaAssetRefs)
      .where(drizzle.eq(schema.mediaAssetRefs.assetId, assetId));

    expect(refsTrasBorrar.map((ref) => ref.formId)).toEqual([copia.id]);
  });

  it('no deja cerrar un formulario que nunca se publicó', async () => {
    const form = await crear(`Sin publicar ${sufijo}`);

    const error: unknown = await service.closeForm(form.id).catch((reason: unknown) => reason);
    const { isFormsError } = await import('../errors');

    expect(isFormsError(error)).toBe(true);
    if (isFormsError(error)) {
      expect(error.code).toBe('TRANSICION_INVALIDA');
      expect(error.status).toBe(409);
    }
  });

  it('cierra un formulario publicado y es idempotente', async () => {
    const form = await crear(`Publicado ${sufijo}`);

    // La publicación es de la fase 7: aquí basta con simular el estado final.
    await dbModule.db
      .update(schema.forms)
      .set({ status: 'published' })
      .where(drizzle.eq(schema.forms.id, form.id));

    const cerrado = await service.closeForm(form.id);
    expect(cerrado.status).toBe('closed');
    expect(cerrado.closedAt).toBeInstanceOf(Date);

    const otraVez = await service.closeForm(form.id);
    expect(otraVez.status).toBe('closed');
    expect(otraVez.closedAt?.getTime()).toBe(cerrado.closedAt?.getTime());
  });

  it('el borrador de un formulario archivado es de solo lectura', async () => {
    const form = await crear(`Solo lectura ${sufijo}`);
    await service.archiveForm(form.id, actor);

    const error: unknown = await service
      .saveDraft(form.id, { revision: 1, definition: form.definition }, actor)
      .catch((reason: unknown) => reason);

    const { isFormsError } = await import('../errors');
    expect(isFormsError(error)).toBe(true);
    if (isFormsError(error)) {
      expect(error.code).toBe('TRANSICION_INVALIDA');
    }
  });

  it('devuelve NO_ENCONTRADO para un formulario inexistente', async () => {
    const error: unknown = await service
      .getForm('00000000-0000-4000-8000-000000000000')
      .catch((reason: unknown) => reason);

    const { isFormsError } = await import('../errors');
    expect(isFormsError(error)).toBe(true);
    if (isFormsError(error)) {
      expect(error.code).toBe('NO_ENCONTRADO');
      expect(error.status).toBe(404);
    }
  });
});
