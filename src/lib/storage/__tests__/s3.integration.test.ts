// @vitest-environment node

/**
 * Integración contra un almacén S3-compatible de verdad (MinIO en local).
 *
 * **Se salta solo cuando falta la configuración**, para que CI siga en verde sin
 * MinIO. Con el compose levantado:
 *
 * ```bash
 * R2_ENDPOINT=http://localhost:9000 R2_ACCESS_KEY_ID=minioadmin \
 * R2_SECRET_ACCESS_KEY=minioadmin R2_BUCKET_STAGING=forms-media-staging \
 * R2_BUCKET_PUBLIC=forms-media-public S3_FORCE_PATH_STYLE=1 \
 * MEDIA_PUBLIC_BASE_URL=http://localhost:9000/forms-media-public \
 *   npx vitest run src/lib/storage
 * ```
 *
 * Lo que verifica es el paso que no se puede simular: que la URL prefirmada la
 * acepta el servidor y que las cabeceras firmadas —`Content-Type` y
 * `Content-Length`— son exactamente las que hay que enviar.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hayConfiguracionDeAlmacen, leerConfiguracion } from '../entorno';
import { crearAlmacenS3 } from '../s3';
import type { AlmacenObjetos } from '../tipos';

const describeS3 = hayConfiguracionDeAlmacen() ? describe : describe.skip;

describeS3('almacén S3 · integración', () => {
  // `describe.skip` recorre igualmente el cuerpo para recolectar los tests, así
  // que el almacén se construye en `beforeAll`: hacerlo aquí reventaría la
  // recolección justo cuando no hay configuración, que es cuando se salta.
  let almacen: AlmacenObjetos;

  beforeAll(() => {
    almacen = crearAlmacenS3(leerConfiguracion());
  });

  const sufijo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const clave = `staging/pruebas/${sufijo}`;
  const contenido = Buffer.from('typeapromo · prueba de integración', 'utf8');

  afterAll(async () => {
    await almacen.borrar(almacen.bucketStaging, clave).catch(() => undefined);
    await almacen.borrar(almacen.bucketStaging, `${clave}-mentira`).catch(() => undefined);
    await almacen.borrar(almacen.bucketPublico, `${clave}-publico`).catch(() => undefined);
  });

  it('un HEAD sobre algo que no existe devuelve null, no una excepción', async () => {
    expect(await almacen.metadatos(almacen.bucketStaging, `${clave}-inexistente`)).toBeNull();
  });

  it('la URL prefirmada acepta el PUT con las cabeceras firmadas', async () => {
    const url = await almacen.urlDeSubidaPrefirmada({
      bucket: almacen.bucketStaging,
      clave,
      contentType: 'image/png',
      byteSize: contenido.byteLength,
      expiraEnSegundos: 300,
    });

    expect(url).toContain('X-Amz-Signature');
    // Las dos cabeceras que acotan la carga van firmadas, no solo `host`.
    expect(new URL(url).searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host',
    );
    // Sin checksum precalculado en la URL: ver el comentario de `s3.ts`.
    expect(url).not.toContain('x-amz-checksum');

    const respuesta = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'image/png',
        'content-length': String(contenido.byteLength),
      },
      body: new Uint8Array(contenido),
    });

    expect(respuesta.status).toBe(200);
  });

  it('el objeto subido se puede inspeccionar y descargar', async () => {
    const cabecera = await almacen.metadatos(almacen.bucketStaging, clave);
    expect(cabecera?.byteSize).toBe(contenido.byteLength);
    expect(cabecera?.contentType).toBe('image/png');

    const objeto = await almacen.descargar(almacen.bucketStaging, clave);
    expect(objeto.cuerpo.equals(contenido)).toBe(true);
  });

  it('la firma rechaza un Content-Type distinto del acordado', async () => {
    const url = await almacen.urlDeSubidaPrefirmada({
      bucket: almacen.bucketStaging,
      clave: `${clave}-mentira`,
      contentType: 'image/png',
      byteSize: contenido.byteLength,
      expiraEnSegundos: 300,
    });

    const respuesta = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'image/svg+xml' },
      body: new Uint8Array(contenido),
    });

    expect(respuesta.ok).toBe(false);
  });

  it('el objeto público se sirve con caché inmutable y sin credenciales', async () => {
    const clavePublica = `${clave}-publico`;
    await almacen.guardar({
      bucket: almacen.bucketPublico,
      clave: clavePublica,
      cuerpo: contenido,
      contentType: 'text/plain',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    const respuesta = await fetch(almacen.urlPublica(clavePublica));
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('cache-control')).toContain('immutable');
  });

  it('borrar es idempotente', async () => {
    await almacen.borrar(almacen.bucketStaging, clave);
    await expect(almacen.borrar(almacen.bucketStaging, clave)).resolves.toBeUndefined();
    expect(await almacen.metadatos(almacen.bucketStaging, clave)).toBeNull();
  });
});
