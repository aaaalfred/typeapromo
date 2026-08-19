/**
 * `POST /api/media/upload-intent` — pasos 1 a 3 del flujo de PR.md.
 *
 * Crea la fila en `media_assets` con estado `uploading` y devuelve una URL `PUT`
 * temporal contra el **bucket privado**. Los bytes no pasan por la aplicación:
 * el navegador sube directamente al endpoint S3.
 *
 * La clave de staging la decide el servidor y queda guardada en la fila; el
 * cliente solo maneja el identificador del activo. Por eso `complete` no admite
 * ninguna clave: no hay forma de que una finalización apunte a un objeto ajeno.
 *
 * El identificador se genera aquí con `randomUUID()` en lugar de dejárselo al
 * `DEFAULT gen_random_uuid()` de la columna porque la clave de staging lo
 * incluye: generarlo antes ahorra el `UPDATE` de vuelta.
 */

import { randomUUID } from 'node:crypto';

import { db } from '@/db';
import { mediaAssets } from '@/db/schema';

import { claveDeStaging } from './claves';
import { obtenerAlmacen } from './contexto';
import { estadoInvalido } from './errores';
import type { UploadIntentInput } from './esquemas';
import type { ActorMedia } from './sesion';
import { aVista, type ActivoVista } from './vista';

/**
 * Vigencia de la URL prefirmada. Sobra para subir 8 MB por una conexión mala y
 * es lo bastante corta como para que una URL filtrada no sirva de mucho.
 */
export const VIGENCIA_PRESIGN_SEGUNDOS = 15 * 60;

export interface InstruccionesDeSubida {
  url: string;
  method: 'PUT';
  /**
   * Cabeceras que la carga debe enviar **exactamente**. Van firmadas: si el
   * navegador manda otro `Content-Type` u otro tamaño, el bucket rechaza el
   * `PUT` y el objeto no llega a existir.
   */
  headers: Record<string, string>;
  expiresAt: string;
}

export interface ResultadoIntento {
  asset: ActivoVista;
  upload: InstruccionesDeSubida;
}

export async function crearIntentoDeSubida(
  input: UploadIntentInput,
  actor: ActorMedia,
): Promise<ResultadoIntento> {
  const almacen = obtenerAlmacen();

  const id = randomUUID();
  const stagingKey = claveDeStaging(id);

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id,
      createdBy: actor.id,
      status: 'uploading',
      bucket: almacen.bucketStaging,
      stagingKey,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      originalFilename: input.filename ?? null,
    })
    .returning();

  if (asset === undefined) {
    throw estadoInvalido('No se ha podido registrar la imagen.');
  }

  const url = await almacen.urlDeSubidaPrefirmada({
    bucket: almacen.bucketStaging,
    clave: stagingKey,
    contentType: input.mimeType,
    byteSize: input.byteSize,
    expiraEnSegundos: VIGENCIA_PRESIGN_SEGUNDOS,
  });

  return {
    asset: aVista(asset, almacen),
    upload: {
      url,
      method: 'PUT',
      headers: {
        'content-type': input.mimeType,
        'content-length': String(input.byteSize),
      },
      expiresAt: new Date(Date.now() + VIGENCIA_PRESIGN_SEGUNDOS * 1000).toISOString(),
    },
  };
}
