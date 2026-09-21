// @vitest-environment node

/**
 * Publicación versionada contra PostgreSQL de verdad.
 *
 * **Se salta solo cuando no hay `DATABASE_URL`**, para que CI siga en verde sin
 * base de datos. Con la base levantada:
 *
 * ```bash
 * DATABASE_URL=postgresql://typeapromo:typeapromo@localhost:5432/typeapromo \
 *   npx vitest run src/server/publish
 * ```
 *
 * Cubre la mitad de publicación del criterio de «hecho» de la fase 7: que
 * publicar una segunda versión **no toca ni un byte de la primera**. La otra
 * mitad —que tampoco toca un recorrido ni una respuesta— está en
 * `src/server/responses/__tests__/experiencia.integration.test.ts`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '@/server/forms/actor';

const hasDatabase =
  typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
const describeDb = hasDatabase ? describe : describe.skip;

type PublishModule = typeof import('../publicar');
type FormsServiceModule = typeof import('@/server/forms/service');
type DbModule = typeof import('@/db');
type SchemaModule = typeof import('@/db/schema');
type DrizzleModule = typeof import('drizzle-orm');
type FixturesModule = typeof import('@/lib/forms/__tests__/fixtures');
type FormsLibModule = typeof import('@/lib/forms');

describeDb('publicación versionada · integración', () => {
  let publish: PublishModule;
  let service: FormsServiceModule;
  let dbModule: DbModule;
  let schema: SchemaModule;
  let drizzle: DrizzleModule;
  let fixtures: FixturesModule;
  let formsLib: FormsLibModule;

  /** Actor sin fila en `users`: `published_by` es nulable. */
  const actor: Actor = {
    id: null,
    email: 'fase7@typeapromo.local',
    name: 'Fase 7',
    workspaceId: '00000000-0000-0000-0000-000000000001',
    role: 'owner',
  };

  const sufijo = `pub${Date.now().toString(36)}`;
  const creados: string[] = [];
  let assetId: string | null = null;

  beforeAll(async () => {
    [publish, service, dbModule, schema, drizzle, fixtures, formsLib] = await Promise.all([
      import('../publicar'),
      import('@/server/forms/service'),
      import('@/db'),
      import('@/db/schema'),
      import('drizzle-orm'),
      import('@/lib/forms/__tests__/fixtures'),
      import('@/lib/forms'),
    ]);

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
    assetId = asset?.id ?? null;
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

  /** Documento publicable con una bifurcación y una imagen de tema. */
  function documento(etiqueta: string) {
    const base = fixtures.makeForm({
      title: `Encuesta ${etiqueta}`,
      blocks: [
        fixtures.welcome('inicio'),
        fixtures.singleChoice('perfil', ['cliente', 'proveedor'], { required: true }),
        fixtures.shortText('empresa'),
        fixtures.rating('satisfaccion', { scale: 5 }),
      ],
      rules: [
        fixtures.rule(
          'r1',
          'perfil',
          'equals',
          'proveedor',
          fixtures.toBlock('satisfaccion'),
        ),
      ],
      endScreens: [fixtures.ending('gracias')],
    });

    return {
      ...base,
      theme:
        assetId === null ? base.theme : { ...base.theme, logoAssetId: assetId },
      blocks: base.blocks.map((bloque) =>
        bloque.id === 'perfil' ? { ...bloque, title: `¿Quién eres? (${etiqueta})` } : bloque,
      ),
    } as typeof base;
  }

  async function crearFormulario(nombre: string) {
    const form = await service.createForm(
      { title: `${nombre} ${sufijo}`, definition: documento('v1') },
      actor,
    );
    creados.push(form.id);
    return form;
  }

  it('crea la versión 1, mueve `active_version_id` y deja el formulario publicado', async () => {
    const form = await crearFormulario('Publicar');

    const resultado = await publish.publishForm(form.id, {}, actor);

    expect(resultado.version.versionNumber).toBe(1);
    expect(resultado.version.schemaVersion).toBe(formsLib.SCHEMA_VERSION);
    expect(resultado.form.status).toBe('published');
    expect(resultado.form.activeVersionId).toBe(resultado.version.id);
    expect(resultado.form.activeVersionNumber).toBe(1);

    const [fila] = await dbModule.db
      .select()
      .from(schema.formVersions)
      .where(drizzle.eq(schema.formVersions.id, resultado.version.id));

    expect(fila?.formId).toBe(form.id);
    expect(fila?.versionNumber).toBe(1);
    expect(formsLib.formDefinitionSchema.safeParse(fila?.definition).success).toBe(true);
  });

  it('escribe las referencias de media con ámbito `version`', async () => {
    expect(assetId).not.toBeNull();
    const form = await crearFormulario('Con imagen');
    const resultado = await publish.publishForm(form.id, {}, actor);

    const refs = await dbModule.db
      .select()
      .from(schema.mediaAssetRefs)
      .where(drizzle.eq(schema.mediaAssetRefs.formId, form.id));

    const deVersion = refs.filter((ref) => ref.scope === 'version');
    expect(deVersion).toHaveLength(1);
    expect(deVersion[0]?.assetId).toBe(assetId);
    expect(deVersion[0]?.versionId).toBe(resultado.version.id);

    // La referencia del borrador sigue ahí: son dos ámbitos independientes.
    expect(refs.some((ref) => ref.scope === 'draft')).toBe(true);
  });

  it('un documento inválido no crea nada y devuelve los problemas concretos', async () => {
    const form = await crearFormulario('Inválido');

    // Salto hacia atrás: uno de los cuatro casos que exige el plan.
    const roto = fixtures.makeForm({
      title: 'Roto',
      blocks: [fixtures.shortText('uno'), fixtures.shortText('dos')],
      endScreens: [fixtures.ending('fin')],
    });
    await service.saveDraft(
      form.id,
      {
        revision: 1,
        definition: {
          ...roto,
          rules: [
            {
              id: 'r-atras',
              sourceQuestionId: 'dos',
              operator: 'is_not_empty',
              value: null,
              priority: 1,
              target: { kind: 'block', id: 'uno' },
            },
          ],
        },
      },
      actor,
    );

    await expect(publish.publishForm(form.id, {}, actor)).rejects.toMatchObject({
      code: 'DATOS_INVALIDOS',
      status: 400,
    });

    const versiones = await dbModule.db
      .select()
      .from(schema.formVersions)
      .where(drizzle.eq(schema.formVersions.formId, form.id));
    expect(versiones).toHaveLength(0);

    const [fila] = await dbModule.db
      .select({ activeVersionId: schema.forms.activeVersionId, status: schema.forms.status })
      .from(schema.forms)
      .where(drizzle.eq(schema.forms.id, form.id));
    expect(fila?.activeVersionId).toBeNull();
    expect(fila?.status).toBe('draft');
  });

  it('el detalle del error lleva los problemas del validador, no un recuento', async () => {
    const form = await crearFormulario('Detalle');
    const roto = fixtures.makeForm({
      title: 'Sin bloques',
      blocks: [fixtures.shortText('uno')],
      endScreens: [fixtures.ending('fin')],
    });
    await service.saveDraft(
      form.id,
      {
        revision: 1,
        definition: {
          ...roto,
          rules: [
            {
              id: 'r-fantasma',
              sourceQuestionId: 'uno',
              operator: 'equals',
              value: 'x',
              priority: 1,
              target: { kind: 'block', id: 'no-existe' },
            },
          ],
        },
      },
      actor,
    );

    const fallo = await publish.publishForm(form.id, {}, actor).catch((error: unknown) => error);
    const detalles = (fallo as { details?: { errors?: { code: string }[] } }).details;

    expect(detalles?.errors?.some((problema) => problema.code === 'RULE_TARGET_NOT_FOUND')).toBe(
      true,
    );
  });

  it('rechaza publicar con una revisión de borrador desfasada', async () => {
    const form = await crearFormulario('Revisión');

    await expect(publish.publishForm(form.id, { revision: 99 }, actor)).rejects.toMatchObject({
      code: 'CONFLICTO_REVISION',
      status: 409,
    });
  });

  it('no publica un formulario archivado', async () => {
    const form = await crearFormulario('Archivado');
    await service.archiveForm(form.id, actor);

    await expect(publish.publishForm(form.id, {}, actor)).rejects.toMatchObject({
      code: 'TRANSICION_INVALIDA',
      status: 409,
    });
  });

  it('la segunda versión no altera ni un byte de la primera', async () => {
    const form = await crearFormulario('Dos versiones');
    const primera = await publish.publishForm(form.id, {}, actor);

    const [antes] = await dbModule.db
      .select()
      .from(schema.formVersions)
      .where(drizzle.eq(schema.formVersions.id, primera.version.id));

    // Se reescribe el borrador entero: etiquetas nuevas, bloque nuevo y una
    // regla distinta.
    const detalle = await service.getForm(form.id);
    await service.saveDraft(
      form.id,
      { revision: detalle.draft?.revision ?? 1, definition: documento('v2') },
      actor,
    );

    const segunda = await publish.publishForm(form.id, {}, actor);
    expect(segunda.version.versionNumber).toBe(2);
    expect(segunda.version.id).not.toBe(primera.version.id);

    const [despues] = await dbModule.db
      .select()
      .from(schema.formVersions)
      .where(drizzle.eq(schema.formVersions.id, primera.version.id));

    expect(despues).toEqual(antes);
    expect(JSON.stringify(despues?.definition)).toBe(JSON.stringify(antes?.definition));

    const [fila] = await dbModule.db
      .select({ activeVersionId: schema.forms.activeVersionId })
      .from(schema.forms)
      .where(drizzle.eq(schema.forms.id, form.id));
    expect(fila?.activeVersionId).toBe(segunda.version.id);
  });

  it('republicar un formulario cerrado lo reabre y limpia `closed_at`', async () => {
    const form = await crearFormulario('Reabrir');
    await publish.publishForm(form.id, {}, actor);
    const cerrado = await service.closeForm(form.id);
    expect(cerrado.status).toBe('closed');

    const reabierto = await publish.publishForm(form.id, {}, actor);
    expect(reabierto.form.status).toBe('published');
    expect(reabierto.form.closedAt).toBeNull();
    expect(reabierto.version.versionNumber).toBe(2);
  });
});
