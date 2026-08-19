/**
 * `POST /api/internal/cleanup` — el trabajo programado que PLAN.md · §2.2 saca
 * del proceso: no hay scheduler en el stack, así que el cron del host llama a
 * este endpoint una vez al día.
 *
 * Tres purgas, independientes entre sí:
 *
 * 1. **Cargas de staging incompletas de más de 24 h.** Nunca llegaron a `ready`.
 *    Se borra su objeto privado y su fila.
 * 2. **Activos publicados huérfanos tras 7 días de gracia.** Están `ready`, no
 *    los referencia ni un borrador ni una versión, y llevan más de una semana
 *    así. La gracia existe porque subir una imagen y usarla son dos peticiones
 *    distintas: sin ella, una imagen recién subida y aún sin guardar en el
 *    borrador desaparecería.
 * 3. **Ventanas caducadas de `rate_limits`.** La tabla es efímera por diseño
 *    (`src/db/README.md`) y esta es su única forma de menguar.
 *
 * **Idempotente.** Cada purga selecciona por estado y por antigüedad, así que
 * ejecutarla dos veces seguidas no borra nada la segunda vez. Y en cada activo
 * se borran primero los objetos y después la fila: si el bucket falla, la fila
 * sobrevive y el siguiente pase reintenta, en vez de perder el rastro de unos
 * objetos que ya nadie sabría nombrar.
 */

import { and, eq, inArray, lt, notInArray, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { mediaAssetRefs, mediaAssets, rateLimits, type MediaAsset } from '@/db/schema';
import type { AlmacenObjetos } from '@/lib/storage';

import { obtenerAlmacen } from './contexto';
import {
  limiteHuerfanos,
  limiteRateLimits,
  limiteStagingCaducado,
  type ResumenLimpieza,
} from './decisiones';

/** Tope de activos por pase y categoría. Acota el tiempo de una invocación. */
const LOTE_MAXIMO = 500;

export interface ResultadoLimpieza {
  ejecutadoEn: string;
  resumen: ResumenLimpieza;
}

export async function ejecutarLimpieza(ahora = new Date()): Promise<ResultadoLimpieza> {
  const almacen = obtenerAlmacen();

  const staging = await purgarStagingCaducado(almacen, ahora);
  const huerfanos = await purgarHuerfanos(almacen, ahora);
  const rateLimitsPurgados = await purgarRateLimits(ahora);

  return {
    ejecutadoEn: ahora.toISOString(),
    resumen: {
      stagingCaducado: staging.filas,
      huerfanosPublicados: huerfanos.filas,
      objetosBorrados: staging.objetos + huerfanos.objetos,
      rateLimitsPurgados,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 1 · Cargas de staging incompletas                                           */
/* -------------------------------------------------------------------------- */

/**
 * Traducción literal de `decisiones.esStagingCaducado`: estado distinto de
 * `ready`, más viejo que el límite y sin ninguna fila en `media_asset_refs`.
 *
 * La comprobación de referencias sobra en la práctica —el editor solo referencia
 * activos publicados— pero es barata y convierte un error futuro en otro sitio
 * (una referencia escrita antes de tiempo) en basura conservada en lugar de en
 * un formulario roto.
 */
async function purgarStagingCaducado(
  almacen: AlmacenObjetos,
  ahora: Date,
): Promise<{ filas: number; objetos: number }> {
  const candidatos = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        or(eq(mediaAssets.status, 'uploading'), eq(mediaAssets.status, 'failed')),
        lt(mediaAssets.createdAt, limiteStagingCaducado(ahora)),
        sinReferencias(),
      ),
    )
    .limit(LOTE_MAXIMO);

  let objetos = 0;
  const borrables: string[] = [];

  for (const activo of candidatos) {
    const ok = await borrarObjetosDe(almacen, activo, (borrados) => {
      objetos += borrados;
    });
    if (ok) borrables.push(activo.id);
  }

  if (borrables.length > 0) {
    await db.delete(mediaAssets).where(inArray(mediaAssets.id, borrables));
  }

  return { filas: borrables.length, objetos };
}

/* -------------------------------------------------------------------------- */
/* 2 · Huérfanos publicados                                                    */
/* -------------------------------------------------------------------------- */

/** Traducción literal de `decisiones.esHuerfanoCaducado`. */
async function purgarHuerfanos(
  almacen: AlmacenObjetos,
  ahora: Date,
): Promise<{ filas: number; objetos: number }> {
  const limite = limiteHuerfanos(ahora);

  const candidatos = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.status, 'ready'),
        // `ready_at` puede faltar en filas antiguas; se cae a `created_at`.
        lt(sql`coalesce(${mediaAssets.readyAt}, ${mediaAssets.createdAt})`, limite),
        sinReferencias(),
      ),
    )
    .limit(LOTE_MAXIMO);

  let objetos = 0;
  const borrables: string[] = [];

  for (const activo of candidatos) {
    const ok = await borrarObjetosDe(almacen, activo, (borrados) => {
      objetos += borrados;
    });
    if (ok) borrables.push(activo.id);
  }

  if (borrables.length > 0) {
    await db.delete(mediaAssets).where(inArray(mediaAssets.id, borrables));
  }

  return { filas: borrables.length, objetos };
}

/* -------------------------------------------------------------------------- */
/* 3 · Ventanas caducadas de rate_limits                                       */
/* -------------------------------------------------------------------------- */

async function purgarRateLimits(ahora: Date): Promise<number> {
  const borradas = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, limiteRateLimits(ahora)))
    .returning({ keyHash: rateLimits.keyHash });
  return borradas.length;
}

/* -------------------------------------------------------------------------- */
/* Auxiliares                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `NOT EXISTS` sobre `media_asset_refs`, expresado como subconsulta para que la
 * decisión de «sin referencias» viva en la propia condición y no en un `LEFT
 * JOIN` con `GROUP BY`, que obligaría a proyectar y agrupar todas las columnas.
 */
function sinReferencias() {
  return notInArray(
    mediaAssets.id,
    db.select({ id: mediaAssetRefs.assetId }).from(mediaAssetRefs),
  );
}

/**
 * Borra todo lo que un activo tiene en los buckets. Devuelve `false` si algo
 * falla, y entonces la fila **no** se elimina: el siguiente pase reintentará.
 */
async function borrarObjetosDe(
  almacen: AlmacenObjetos,
  activo: MediaAsset,
  contar: (borrados: number) => void,
): Promise<boolean> {
  const publicas = [
    ...(activo.publicKey === null ? [] : [activo.publicKey]),
    ...activo.variants.map((variante) => variante.key),
  ];

  try {
    let borrados = 0;
    if (publicas.length > 0) {
      borrados += await almacen.borrarVarios(almacen.bucketPublico, publicas);
    }
    if (activo.stagingKey !== null) {
      await almacen.borrar(almacen.bucketStaging, activo.stagingKey);
      borrados += 1;
    }
    contar(borrados);
    return true;
  } catch (error) {
    console.error('[api/internal/cleanup] no se han podido borrar los objetos', error);
    return false;
  }
}
