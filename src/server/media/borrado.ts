/**
 * `DELETE /api/media/:id` — borrado seguro.
 *
 * Criterio de aceptación de PR.md: «Un activo usado por una versión publicada no
 * puede eliminarse físicamente mientras esa versión exista». La autoridad no es
 * `created_by` —duplicar un formulario comparte activos, así que quien subió la
 * imagen deja de ser quien decide— sino `media_asset_refs`, tal y como fija
 * `src/db/README.md`.
 *
 * El recuento y el borrado van en la **misma transacción**, con la fila del
 * activo bloqueada (`SELECT … FOR UPDATE`). Sin ese bloqueo existe una ventana
 * real: un guardado de borrador que inserta la referencia justo después del
 * `COUNT` y justo antes del `DELETE` dejaría un formulario apuntando a una
 * imagen que ya no existe.
 *
 * Cuando el activo está referenciado se responde `409` con un mensaje que
 * explica dónde se usa. Nunca un `500`: que algo esté en uso es un resultado
 * previsto, no un fallo.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { mediaAssetRefs, mediaAssets } from '@/db/schema';
import type { AlmacenObjetos } from '@/lib/storage';

import { obtenerAlmacen } from './contexto';
import {
  mensajeDeBloqueo,
  puedeBorrarse,
  resumirReferencias,
  type ResumenReferencias,
} from './decisiones';
import { MediaError, activoNoEncontrado } from './errores';

export interface ResultadoBorrado {
  id: string;
  borrado: true;
  /** Claves eliminadas de los buckets. Útil en el log, no en la interfaz. */
  objetosBorrados: number;
}

export async function borrarActivo(assetId: string): Promise<ResultadoBorrado> {
  const almacen = obtenerAlmacen();

  const claves = await db.transaction(async (tx) => {
    const [asset] = await tx
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, assetId))
      .limit(1)
      .for('update');

    if (asset === undefined) throw activoNoEncontrado();

    const filas = await tx
      .select({ scope: mediaAssetRefs.scope })
      .from(mediaAssetRefs)
      .where(eq(mediaAssetRefs.assetId, assetId));

    const resumenReferencias = resumirReferencias(filas);
    if (!puedeBorrarse(resumenReferencias)) {
      throw referenciado(resumenReferencias);
    }

    await tx.delete(mediaAssets).where(eq(mediaAssets.id, assetId));

    return {
      publicas: [
        ...(asset.publicKey === null ? [] : [asset.publicKey]),
        ...asset.variants.map((variante) => variante.key),
      ],
      staging: asset.stagingKey,
    };
  });

  const objetosBorrados = await borrarObjetos(almacen, claves);
  return { id: assetId, borrado: true, objetosBorrados };
}

/**
 * Los objetos se borran **después** de que la transacción confirme. Al revés,
 * un `ROLLBACK` dejaría la fila viva apuntando a objetos que ya no existen, que
 * es el estado más difícil de diagnosticar. Al hacerlo así, el peor caso es un
 * objeto huérfano en el bucket, y de eso ya se ocupa la limpieza.
 */
async function borrarObjetos(
  almacen: AlmacenObjetos,
  claves: { publicas: string[]; staging: string | null },
): Promise<number> {
  let borrados = 0;
  try {
    if (claves.publicas.length > 0) {
      borrados += await almacen.borrarVarios(almacen.bucketPublico, claves.publicas);
    }
    if (claves.staging !== null) {
      await almacen.borrar(almacen.bucketStaging, claves.staging);
      borrados += 1;
    }
  } catch (error) {
    console.error('[api/media] la fila se borró pero quedan objetos', error);
  }
  return borrados;
}

function referenciado(resumen: ResumenReferencias): MediaError {
  return new MediaError('ACTIVO_REFERENCIADO', mensajeDeBloqueo(resumen), {
    referencias: resumen.total,
    borradores: resumen.borradores,
    versiones: resumen.versiones,
  });
}

/**
 * ¿Está este activo en uso? Consulta de solo lectura, la que documenta
 * `src/db/README.md`. La expone el módulo porque el editor la necesita para
 * enseñar «en uso» antes de que el usuario pulse borrar.
 */
export async function contarReferencias(assetId: string): Promise<ResumenReferencias> {
  const filas = await db
    .select({ scope: mediaAssetRefs.scope })
    .from(mediaAssetRefs)
    .where(eq(mediaAssetRefs.assetId, assetId));
  return resumirReferencias(filas);
}
