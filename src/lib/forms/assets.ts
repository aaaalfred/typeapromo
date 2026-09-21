/**
 * Qué activos de media referencia un documento.
 *
 * Vive en el contrato y no en la capa de datos porque la respuesta depende solo
 * de la forma de `FormDefinition`: si mañana un bloque nuevo admite imagen, este
 * fichero es el único sitio donde hay que acordarse.
 *
 * Tiene dos consumidores que no pueden compartir código de otra manera:
 * `src/server/forms/media-refs.ts`, que mantiene `media_asset_refs` en cada
 * guardado y publicación, y el editor en el navegador, que necesita saber qué
 * imágenes precargar. Duplicarlo garantizaría que un día divergen y que el
 * borrado seguro empieza a mentir.
 */

import { isChoiceBlock } from './definition';
import type { FormDefinition } from './definition';

/**
 * Identificadores de activo referenciados por el documento, sin repetir y en
 * orden de aparición.
 */
export function collectAssetIds(definition: FormDefinition): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | undefined): void => {
    if (value === undefined || seen.has(value)) return;
    seen.add(value);
    found.push(value);
  };

  push(definition.theme.logoAssetId);
  push(definition.theme.backgroundImageAssetId);

  for (const block of definition.blocks) {
    push(block.mediaAssetId);
    if (isChoiceBlock(block)) {
      for (const choice of block.choices) {
        push(choice.assetId);
      }
    }
  }

  for (const screen of definition.endScreens) {
    push(screen.mediaAssetId);
  }

  return found;
}
