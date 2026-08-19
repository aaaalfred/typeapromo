// @vitest-environment node

/**
 * El flujo completo, de punta a punta, contra PostgreSQL y MinIO de verdad.
 *
 * **Se salta solo** si falta `DATABASE_URL` o la configuración del almacén, para
 * que CI siga en verde sin infraestructura. Con el compose levantado:
 *
 * ```bash
 * DATABASE_URL=postgresql://typeapromo:typeapromo@localhost:5432/typeapromo \
 * R2_ENDPOINT=http://localhost:9000 R2_ACCESS_KEY_ID=minioadmin \
 * R2_SECRET_ACCESS_KEY=minioadmin R2_BUCKET_STAGING=forms-media-staging \
 * R2_BUCKET_PUBLIC=forms-media-public S3_FORCE_PATH_STYLE=1 \
 * MEDIA_PUBLIC_BASE_URL=http://localhost:9000/forms-media-public \
 *   npx vitest run src/server/media
 * ```
 *
 * Cubre el «hecho cuando» de la fase 6: una imagen recorre staging privado →
 * validación → bucket público, y un activo referenciado por una versión
 * publicada no se puede borrar.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hayConfiguracionDeAlmacen } from '@/lib/storage';

import type { ActorMedia } from '../sesion';

const hayBase =
  typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
const describePipeline = hayBase && hayConfiguracionDeAlmacen() ? describe : describe.skip;

/**
 * Los módulos se importan uno a uno y no por el barril `../index`: este
 * reexporta `sesion.ts`, que arrastra Auth.js, que a su vez no se resuelve fuera
 * del bundler de Next. Aquí se prueba el pipeline, no el guard de sesión.
 */
type MediaModule = typeof import('../intento') &
  typeof import('../completar') &
  typeof import('../consulta') &
  typeof import('../borrado') &
  typeof import('../limpieza') &
  typeof import('../contexto');
type DbModule = typeof import('@/db');
type SchemaModule = typeof import('@/db/schema');
type DrizzleModule = typeof import('drizzle-orm');

describePipeline('pipeline de media · integración', () => {
  let media: MediaModule;
  let dbModule: DbModule;
  let schema: SchemaModule;
  let drizzle: DrizzleModule;
  let sharp: typeof import('sharp').default;

  const actor: ActorMedia = { id: null as unknown as string, email: 'media@typeapromo.local' };
  const activosCreados: string[] = [];
  const formulariosCreados: string[] = [];
  const sufijo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  beforeAll(async () => {
    const [intento, completar, consulta, borrado, limpieza, contexto] = await Promise.all([
      import('../intento'),
      import('../completar'),
      import('../consulta'),
      import('../borrado'),
      import('../limpieza'),
      import('../contexto'),
    ]);
    media = { ...intento, ...completar, ...consulta, ...borrado, ...limpieza, ...contexto };

    [dbModule, schema, drizzle] = await Promise.all([
      import('@/db'),
      import('@/db/schema'),
      import('drizzle-orm'),
    ]);
    sharp = (await import('sharp')).default;
  });

  afterAll(async () => {
    if (!hayBase || !hayConfiguracionDeAlmacen()) return;

    const almacen = media.obtenerAlmacen();
    for (const id of activosCreados) {
      const [fila] = await dbModule.db
        .select()
        .from(schema.mediaAssets)
        .where(drizzle.eq(schema.mediaAssets.id, id));
      if (fila === undefined) continue;
      const claves = [
        ...(fila.publicKey === null ? [] : [fila.publicKey]),
        ...fila.variants.map((v) => v.key),
      ];
      if (claves.length > 0) {
        await almacen.borrarVarios(almacen.bucketPublico, claves).catch(() => 0);
      }
      if (fila.stagingKey !== null) {
        await almacen.borrar(almacen.bucketStaging, fila.stagingKey).catch(() => undefined);
      }
    }
    if (formulariosCreados.length > 0) {
      await dbModule.db
        .delete(schema.forms)
        .where(drizzle.inArray(schema.forms.id, formulariosCreados));
    }
    if (activosCreados.length > 0) {
      await dbModule.db
        .delete(schema.mediaAssets)
        .where(drizzle.inArray(schema.mediaAssets.id, activosCreados));
    }
    await dbModule.pool.end();
  });

  /** Sube unos bytes cualesquiera usando la URL prefirmada del intento. */
  async function subir(
    bytes: Buffer,
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  ): Promise<string> {
    const intento = await media.crearIntentoDeSubida(
      { mimeType, byteSize: bytes.byteLength, filename: 'prueba.png' },
      actor,
    );
    activosCreados.push(intento.asset.id);

    const respuesta = await fetch(intento.upload.url, {
      method: 'PUT',
      headers: intento.upload.headers,
      body: new Uint8Array(bytes),
    });
    expect(respuesta.status).toBe(200);

    return intento.asset.id;
  }

  it('presign → PUT → complete → objeto público legible', async () => {
    const png = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#3355ff' },
    })
      .png()
      .toBuffer();

    const assetId = await subir(png, 'image/png');

    // Antes de completar, la fila está en `uploading` y no hay nada público.
    const pendiente = await media.obtenerActivo(assetId);
    expect(pendiente.status).toBe('uploading');
    expect(pendiente.url).toBeNull();

    const asset = await media.completarSubida(assetId);

    expect(asset.status).toBe('ready');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.width).toBe(2400);
    expect(asset.height).toBe(1200);
    expect(asset.url).not.toBeNull();
    expect(asset.variantes.map((v) => v.label)).toEqual(['w640', 'w1920']);

    // Las variantes están escaladas y son WebP.
    const w640 = asset.variantes.find((v) => v.label === 'w640');
    const w1920 = asset.variantes.find((v) => v.label === 'w1920');
    expect(w640?.width).toBe(640);
    expect(w1920?.width).toBe(1920);
    expect(w640?.mimeType).toBe('image/webp');

    // El bucket público sirve las tres, sin credenciales y con caché inmutable.
    for (const url of [asset.url, w640?.url, w1920?.url]) {
      const respuesta = await fetch(String(url));
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get('cache-control')).toContain('immutable');
      expect(respuesta.headers.get('content-type')).toBe('image/webp');
    }

    // El objeto de staging ha desaparecido.
    const [fila] = await dbModule.db
      .select()
      .from(schema.mediaAssets)
      .where(drizzle.eq(schema.mediaAssets.id, assetId));
    expect(fila?.stagingKey).toBeNull();
    expect(fila?.bucket).toBe(media.obtenerAlmacen().bucketPublico);

    // `complete` es idempotente.
    const repetido = await media.completarSubida(assetId);
    expect(repetido.url).toBe(asset.url);
  }, 60_000);

  it('elimina los metadatos EXIF, incluida la geolocalización', async () => {
    const conExif = await sharp({
      create: { width: 320, height: 240, channels: 3, background: '#ff0000' },
    })
      .withExif({
        IFD0: { Copyright: 'typeapromo', Software: 'prueba' },
        IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
      })
      .jpeg()
      .toBuffer();

    const entrada = await sharp(conExif).metadata();
    expect(entrada.exif).toBeDefined();

    const assetId = await subir(conExif, 'image/jpeg');
    const asset = await media.completarSubida(assetId);

    const publicado = await fetch(String(asset.url));
    const bytes = Buffer.from(await publicado.arrayBuffer());
    const salida = await sharp(bytes).metadata();
    expect(salida.exif).toBeUndefined();
  }, 60_000);

  it('rechaza un SVG aunque se declare como PNG, y deja el activo en failed', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"/>',
      'utf8',
    );
    const assetId = await subir(svg, 'image/png');

    await expect(media.completarSubida(assetId)).rejects.toMatchObject({
      code: 'FORMATO_NO_ADMITIDO',
    });

    const asset = await media.obtenerActivo(assetId);
    expect(asset.status).toBe('failed');
    expect(asset.failureReason).toMatch(/SVG/);
    expect(asset.url).toBeNull();

    // Sin basura a medias: el objeto de staging ya no existe.
    expect(asset.variantes).toHaveLength(0);
  }, 60_000);

  it('rechaza un GIF declarado como WebP', async () => {
    const gif = Buffer.concat([
      Buffer.from('GIF89a', 'ascii'),
      Buffer.from([0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
    ]);
    const assetId = await subir(gif, 'image/webp');

    await expect(media.completarSubida(assetId)).rejects.toMatchObject({
      code: 'FORMATO_NO_ADMITIDO',
    });
    const asset = await media.obtenerActivo(assetId);
    expect(asset.failureReason).toMatch(/GIF/);
  }, 60_000);

  it('un activo referenciado por una versión publicada no se puede borrar', async () => {
    const png = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#00aa55' },
    })
      .png()
      .toBuffer();

    const assetId = await subir(png, 'image/png');
    await media.completarSubida(assetId);

    // Formulario y snapshot mínimos para poder anclar la referencia.
    const [formulario] = await dbModule.db
      .insert(schema.forms)
      .values({ slug: `prueba-media-${sufijo}`, title: 'Prueba de media' })
      .returning();
    expect(formulario).toBeDefined();
    if (formulario === undefined) return;
    formulariosCreados.push(formulario.id);

    const [version] = await dbModule.db
      .insert(schema.formVersions)
      .values({ formId: formulario.id, versionNumber: 1, definition: {} })
      .returning();
    expect(version).toBeDefined();
    if (version === undefined) return;

    await dbModule.db.insert(schema.mediaAssetRefs).values({
      assetId,
      formId: formulario.id,
      scope: 'version',
      versionId: version.id,
    });

    // Es un 409 con mensaje, no un 500.
    await expect(media.borrarActivo(assetId)).rejects.toMatchObject({
      code: 'ACTIVO_REFERENCIADO',
      status: 409,
    });

    const referencias = await media.contarReferencias(assetId);
    expect(referencias).toEqual({ total: 1, borradores: 0, versiones: 1 });

    // El activo sigue publicado y accesible.
    const asset = await media.obtenerActivo(assetId);
    expect(asset.status).toBe('ready');
    expect((await fetch(String(asset.url))).status).toBe(200);

    // Al desaparecer la versión, la referencia cae por cascada y ya se puede.
    await dbModule.db
      .delete(schema.formVersions)
      .where(drizzle.eq(schema.formVersions.id, version.id));

    const borrado = await media.borrarActivo(assetId);
    expect(borrado.borrado).toBe(true);

    await expect(media.obtenerActivo(assetId)).rejects.toMatchObject({
      code: 'NO_ENCONTRADO',
    });
    expect((await fetch(String(asset.url))).status).toBe(404);
  }, 90_000);

  it('la limpieza es idempotente y respeta los plazos', async () => {
    const png = await sharp({
      create: { width: 120, height: 120, channels: 3, background: '#111111' },
    })
      .png()
      .toBuffer();

    // Carga que nunca se completa, envejecida a mano por encima de las 24 h.
    const abandonado = await subir(png, 'image/png');
    await dbModule.db
      .update(schema.mediaAssets)
      .set({ createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) })
      .where(drizzle.eq(schema.mediaAssets.id, abandonado));

    // Carga reciente que no debe tocarse.
    const reciente = await subir(png, 'image/png');

    const primera = await media.ejecutarLimpieza();
    expect(primera.resumen.stagingCaducado).toBeGreaterThanOrEqual(1);

    const [borrado] = await dbModule.db
      .select()
      .from(schema.mediaAssets)
      .where(drizzle.eq(schema.mediaAssets.id, abandonado));
    expect(borrado).toBeUndefined();

    const [superviviente] = await dbModule.db
      .select()
      .from(schema.mediaAssets)
      .where(drizzle.eq(schema.mediaAssets.id, reciente));
    expect(superviviente).toBeDefined();

    // Segunda pasada: no queda nada que hacer con lo mismo.
    const segunda = await media.ejecutarLimpieza();
    expect(segunda.resumen.stagingCaducado).toBe(0);
  }, 90_000);
});
