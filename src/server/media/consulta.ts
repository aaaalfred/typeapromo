/**
 * Lecturas de activos para el editor.
 *
 * `GET /api/media/:id` existe sobre todo para que la subida pueda sondear el
 * estado si la respuesta de `complete` se pierde: devuelve `uploading`, `ready`
 * o `failed` con su motivo, sin repetir el procesado.
 */

import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { mediaAssets } from '@/db/schema';

import { obtenerAlmacen } from './contexto';
import { activoNoEncontrado } from './errores';
import { aVista, type ActivoVista } from './vista';

export async function obtenerActivo(assetId: string): Promise<ActivoVista> {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);

  if (asset === undefined) throw activoNoEncontrado();
  return aVista(asset, obtenerAlmacen());
}

/** Varios activos de golpe, en el orden en que los devuelve la base de datos. */
export async function obtenerActivos(
  assetIds: readonly string[],
): Promise<ActivoVista[]> {
  if (assetIds.length === 0) return [];

  const almacen = obtenerAlmacen();
  const filas = await db
    .select()
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, [...assetIds]));

  return filas.map((fila) => aVista(fila, almacen));
}
