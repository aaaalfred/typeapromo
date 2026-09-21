/**
 * Mantenimiento de `media_asset_refs`, en sus dos ámbitos.
 *
 * `src/db/README.md` lo deja explícito: la tabla hay que reconciliarla en **cada
 * guardado de borrador** (`scope='draft'`) y escribirla en **cada publicación**
 * (`scope='version'`, con el `version_id` del snapshot). Es lo que convierte
 * «¿este activo sigue en uso?» en un `COUNT` y lo que hace seguro el borrado de
 * imágenes de la fase 6. Si un guardado no la actualiza, la tabla miente y la
 * fase 6 borra activos vivos o conserva basura para siempre.
 *
 * La diferencia entre los dos ámbitos no es de forma sino de vida: el del
 * borrador se **reconcilia** (lo que ya no aparece se borra), el de la versión
 * se **inserta y no se toca nunca más**, porque el snapshot es inmutable y sus
 * activos deben quedar blindados mientras esa versión exista.
 *
 * La recolección de identificadores es pura y está separada de la escritura para
 * poder testearla sin base de datos.
 */

import { and, eq, inArray, notInArray } from 'drizzle-orm';

import { mediaAssetRefs, mediaAssets } from '@/db/schema';
import { collectAssetIds, type FormDefinition } from '@/lib/forms';

import type { DbHandle } from './db';

/**
 * Los campos de imagen del documento se declaran como `idSchema`, que admite
 * nanoid y slugs además de UUID. En base de datos son claves foráneas a
 * `media_assets.id`, que es `uuid`: cualquier valor con otra forma se descarta
 * en vez de reventar la transacción con un error de tipo.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Todos los activos referenciados por un documento: logo y fondo del tema,
 * imagen de cada bloque, de cada pantalla final y de cada opción de selección.
 *
 * Devuelve identificadores únicos en orden de aparición (determinista, para que
 * los tests no dependan del orden de un `Set`).
 */
// El recolector vive en `@/lib/forms` (ver `assets.ts`): depende solo de la
// forma del documento y lo necesita también el editor en el navegador, que no
// puede importar nada de este módulo sin arrastrar el pool de PostgreSQL.
// Se reexporta para no romper a quien ya lo importaba desde aquí.
export { collectAssetIds };

/** Identificadores del documento que además existen como activo en la base de datos. */
async function existingAssetIds(
  handle: DbHandle,
  candidates: readonly string[],
): Promise<string[]> {
  const uuids = candidates.filter(isUuid);
  if (uuids.length === 0) return [];

  const rows = await handle
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, uuids));

  return rows.map((row) => row.id);
}

/**
 * Deja `media_asset_refs` con ámbito `draft` reflejando exactamente los activos
 * del documento: borra las referencias que ya no aparecen e inserta las nuevas.
 *
 * Se ejecuta siempre dentro de la misma transacción que escribe el borrador: si
 * el borrador se guarda y las referencias no, la tabla queda mintiendo.
 */
export async function reconcileDraftAssetRefs(
  handle: DbHandle,
  formId: string,
  definition: FormDefinition,
): Promise<string[]> {
  const referenced = await existingAssetIds(handle, collectAssetIds(definition));

  const scopeIsDraft = and(
    eq(mediaAssetRefs.formId, formId),
    eq(mediaAssetRefs.scope, 'draft'),
  );

  if (referenced.length === 0) {
    await handle.delete(mediaAssetRefs).where(scopeIsDraft);
    return [];
  }

  await handle
    .delete(mediaAssetRefs)
    .where(and(scopeIsDraft, notInArray(mediaAssetRefs.assetId, referenced)));

  await handle
    .insert(mediaAssetRefs)
    .values(
      referenced.map((assetId) => ({
        assetId,
        formId,
        scope: 'draft' as const,
        versionId: null,
      })),
    )
    .onConflictDoNothing();

  return referenced;
}

/**
 * Escribe las referencias con ámbito `version` de un snapshot recién creado.
 *
 * Se ejecuta dentro de la misma transacción que inserta la fila de
 * `form_versions`: si el snapshot se crea y las referencias no, un activo suyo
 * podría borrarse y la versión publicada quedaría con imágenes rotas para
 * siempre, que es justo lo que prohíbe PR.md («un activo usado por una versión
 * publicada no puede eliminarse físicamente mientras esa versión exista»).
 *
 * A diferencia del ámbito `draft` aquí **no se reconcilia nada**: no hay filas
 * previas que borrar porque el `version_id` acaba de nacer, y una versión ya
 * publicada nunca cambia de activos. El `onConflictDoNothing` solo protege
 * frente a un reintento de la misma transacción.
 */
export async function insertVersionAssetRefs(
  handle: DbHandle,
  formId: string,
  versionId: string,
  definition: FormDefinition,
): Promise<string[]> {
  const referenced = await existingAssetIds(handle, collectAssetIds(definition));
  if (referenced.length === 0) return [];

  await handle
    .insert(mediaAssetRefs)
    .values(
      referenced.map((assetId) => ({
        assetId,
        formId,
        scope: 'version' as const,
        versionId,
      })),
    )
    .onConflictDoNothing();

  return referenced;
}
