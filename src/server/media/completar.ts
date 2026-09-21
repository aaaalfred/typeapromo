/**
 * `POST /api/media/:id/complete` — pasos 5 a 9 del flujo de PR.md.
 *
 * Orden deliberado, de lo barato y seguro a lo caro:
 *
 * 1. `HEAD` sobre staging: ¿existe el objeto y cuánto ocupa? Si supera 8 MB se
 *    corta **sin descargar nada**.
 * 2. Descarga a memoria (acotada por el paso anterior) y SHA-256 del original.
 * 3. **Firma binaria real.** El `Content-Type` que declaró el cliente no decide
 *    nada; si los bytes son un SVG o un GIF se rechazan aquí con un mensaje que
 *    lo dice, y si son un JPEG disfrazado de PNG se corrige la columna.
 * 4. **Dimensiones leídas de la cabecera, antes de decodificar** (PLAN.md ·
 *    §2.8). Una bomba de descompresión declara su tamaño y muere en este paso,
 *    sin que Sharp llegue a reservar memoria.
 * 5. Sharp: rotación EXIF aplicada, metadatos descartados, WebP de 640 y 1920.
 * 6. Publicación en el bucket público con claves UUID + hash y caché inmutable.
 * 7. Borrado del objeto de staging y `status = 'ready'`.
 *
 * **Sin basura a medias.** Cualquier fallo entre el paso 1 y el 7 borra lo que
 * ya se hubiera escrito —objetos públicos a medio publicar y el de staging— y
 * deja la fila en `failed` con `failure_reason`. Lo que el borrado de emergencia
 * no consiga limpiar lo recoge después `POST /api/internal/cleanup`, que es la
 * red de seguridad, no el plan A.
 */

import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { mediaAssets, type MediaAsset } from '@/db/schema';
import { CACHE_INMUTABLE, type AlmacenObjetos } from '@/lib/storage';

import { obtenerAlmacen } from './contexto';
import {
  MediaError,
  activoNoEncontrado,
  archivoDemasiadoGrande,
  estadoInvalido,
  formatoNoAdmitido,
  imagenDemasiadoGrande,
} from './errores';
import { aMediaVariant, procesarImagen, type ObjetoProcesado } from './procesado';
import {
  TAMANO_MAXIMO_BYTES,
  detectarFormato,
  esMimeAdmitido,
  formatearMegas,
  leerDimensiones,
  motivoDeRechazo,
  validarDimensiones,
  validarTamano,
} from './reglas';
import { aVista, type ActivoVista } from './vista';

export async function completarSubida(assetId: string): Promise<ActivoVista> {
  const almacen = obtenerAlmacen();
  const asset = await leerActivo(assetId);

  // Idempotencia: reintentar `complete` sobre algo ya publicado devuelve lo
  // mismo. El cliente puede reintentar por timeout sin duplicar objetos.
  if (asset.status === 'ready') return aVista(asset, almacen);

  if (asset.status === 'failed') {
    throw estadoInvalido(
      asset.failureReason ?? 'La imagen no se pudo procesar. Vuelve a subirla.',
    );
  }

  const stagingKey = asset.stagingKey;
  if (stagingKey === null) {
    throw estadoInvalido('La imagen no tiene ninguna carga pendiente.');
  }

  /** Claves públicas ya escritas; se borran si algo falla después. */
  const publicadas: string[] = [];

  try {
    const actualizado = await procesarYPublicar(asset, stagingKey, almacen, publicadas);
    return aVista(actualizado, almacen);
  } catch (error) {
    await revertir(almacen, stagingKey, publicadas);
    const motivo = motivoDeFallo(error);
    await marcarFallido(asset.id, motivo);
    throw error instanceof MediaError
      ? error
      : estadoInvalido('La imagen no se ha podido procesar.');
  }
}

/* -------------------------------------------------------------------------- */

async function procesarYPublicar(
  asset: MediaAsset,
  stagingKey: string,
  almacen: AlmacenObjetos,
  publicadas: string[],
): Promise<MediaAsset> {
  // 1 · ¿Existe y cuánto ocupa? Antes de descargar un solo byte.
  const cabecera = await almacen.metadatos(almacen.bucketStaging, stagingKey);
  if (cabecera === null) {
    throw estadoInvalido(
      'No hemos encontrado el archivo subido. Puede que la carga se interrumpiera; vuelve a intentarlo.',
    );
  }
  if (cabecera.byteSize > TAMANO_MAXIMO_BYTES) {
    throw archivoDemasiadoGrande(
      `El archivo ocupa ${formatearMegas(cabecera.byteSize)} y el máximo admitido son ${formatearMegas(TAMANO_MAXIMO_BYTES)}.`,
    );
  }

  // 2 · Descarga acotada y hash del original.
  const objeto = await almacen.descargar(almacen.bucketStaging, stagingKey);
  const tamano = validarTamano(objeto.byteSize);
  if (!tamano.valido) throw archivoDemasiadoGrande(tamano.motivo);

  const sha256 = createHash('sha256').update(objeto.cuerpo).digest('hex');

  // 3 · El formato lo deciden los bytes, no el cliente.
  const formato = detectarFormato(objeto.cuerpo);
  if (!esMimeAdmitido(formato)) {
    throw formatoNoAdmitido(motivoDeRechazo(formato), { formatoDetectado: formato });
  }

  // 4 · Dimensiones por cabecera, **antes** de decodificar (PLAN.md · §2.8).
  const dimensiones = validarDimensiones(leerDimensiones(objeto.cuerpo, formato));
  if (!dimensiones.valido) throw imagenDemasiadoGrande(dimensiones.motivo);

  // 5 · Sharp. Solo ahora se descomprime.
  const procesado = await procesarImagen(asset.id, sha256, objeto.cuerpo);

  // 6 · Publicación. Se registra cada clave escrita para poder revertir.
  const objetos: ObjetoProcesado[] = [procesado.original, ...procesado.variantes];
  for (const salida of objetos) {
    await almacen.guardar({
      bucket: almacen.bucketPublico,
      clave: salida.clave,
      cuerpo: salida.cuerpo,
      contentType: salida.mimeType,
      cacheControl: CACHE_INMUTABLE,
    });
    publicadas.push(salida.clave);
  }

  // 7 · La fila pasa a `ready` y el objeto de staging deja de existir.
  const [actualizado] = await db
    .update(mediaAssets)
    .set({
      status: 'ready',
      bucket: almacen.bucketPublico,
      stagingKey: null,
      publicKey: procesado.original.clave,
      variants: procesado.variantes.map(aMediaVariant),
      // El MIME real manda sobre el declarado en el intento.
      mimeType: formato,
      byteSize: objeto.byteSize,
      width: procesado.dimensiones.width,
      height: procesado.dimensiones.height,
      sha256,
      failureReason: null,
      readyAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mediaAssets.id, asset.id))
    .returning();

  if (actualizado === undefined) throw activoNoEncontrado();

  await almacen.borrar(almacen.bucketStaging, stagingKey);

  return actualizado;
}

/* -------------------------------------------------------------------------- */

async function leerActivo(assetId: string): Promise<MediaAsset> {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (asset === undefined) throw activoNoEncontrado();
  return asset;
}

/**
 * Mensaje que se guarda en `failure_reason`.
 *
 * Solo los errores de dominio llevan texto para el usuario. Un fallo del SDK o
 * de Sharp se registra en el log del servidor y hacia fuera sale un texto
 * genérico: los mensajes de esas librerías traen rutas, claves de bucket y a
 * veces credenciales.
 */
function motivoDeFallo(error: unknown): string {
  if (error instanceof MediaError) return error.message;
  console.error('[api/media] fallo al procesar la imagen', error);
  return 'La imagen no se ha podido procesar.';
}

/** Deshace lo escrito. Best-effort: si falla, lo recogerá la limpieza. */
async function revertir(
  almacen: AlmacenObjetos,
  stagingKey: string,
  publicadas: readonly string[],
): Promise<void> {
  try {
    if (publicadas.length > 0) {
      await almacen.borrarVarios(almacen.bucketPublico, publicadas);
    }
    await almacen.borrar(almacen.bucketStaging, stagingKey);
  } catch (error) {
    console.error('[api/media] no se ha podido limpiar tras un fallo', error);
  }
}

async function marcarFallido(assetId: string, motivo: string): Promise<void> {
  try {
    await db
      .update(mediaAssets)
      .set({
        status: 'failed',
        failureReason: motivo,
        // Las claves se limpian junto con los objetos: una fila `failed` que
        // conservara `public_key` apuntaría a algo que `revertir` ya ha borrado,
        // y el editor pintaría una imagen rota en vez del motivo del fallo.
        stagingKey: null,
        publicKey: null,
        variants: [],
        readyAt: null,
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, assetId));
  } catch (error) {
    console.error('[api/media] no se ha podido marcar el activo como fallido', error);
  }
}
