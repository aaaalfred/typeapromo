import { createDefaultFormDefinition, type FormDefinition } from '@/lib/forms';
import { describe, expect, it } from 'vitest';

import { collectAssetIds, isUuid } from '../media-refs';

const LOGO = '11111111-1111-4111-8111-111111111111';
const FONDO = '22222222-2222-4222-8222-222222222222';
const PREGUNTA = '33333333-3333-4333-8333-333333333333';
const OPCION_A = '44444444-4444-4444-8444-444444444444';
const OPCION_B = '55555555-5555-4555-8555-555555555555';
const FINAL = '66666666-6666-4666-8666-666666666666';

function definicionConMedia(): FormDefinition {
  const base = createDefaultFormDefinition('Con imágenes');
  return {
    ...base,
    theme: { ...base.theme, logoAssetId: LOGO, backgroundImageAssetId: FONDO },
    blocks: [
      ...base.blocks,
      {
        id: 'color',
        type: 'single_choice',
        title: '¿Qué color prefieres?',
        required: false,
        mediaAssetId: PREGUNTA,
        presentation: 'image_cards',
        randomizeChoices: false,
        choices: [
          { id: 'a', label: 'Azul', value: 'azul', assetId: OPCION_A },
          { id: 'b', label: 'Rojo', value: 'rojo', assetId: OPCION_B },
          { id: 'c', label: 'Sin imagen', value: 'ninguno' },
        ],
      },
    ],
    endScreens: [{ ...base.endScreens[0]!, mediaAssetId: FINAL }],
  };
}

describe('collectAssetIds', () => {
  it('recoge logo, fondo, imagen de bloque, de opción y de pantalla final', () => {
    expect(collectAssetIds(definicionConMedia())).toEqual([
      LOGO,
      FONDO,
      PREGUNTA,
      OPCION_A,
      OPCION_B,
      FINAL,
    ]);
  });

  it('devuelve una lista vacía para un documento sin imágenes', () => {
    expect(collectAssetIds(createDefaultFormDefinition('Sin imágenes'))).toEqual([]);
  });

  it('no repite un activo usado en varios sitios y conserva el orden de aparición', () => {
    const base = definicionConMedia();
    const definicion: FormDefinition = {
      ...base,
      theme: { ...base.theme, backgroundImageAssetId: LOGO },
    };
    const ids = collectAssetIds(definicion);
    expect(ids.filter((id) => id === LOGO)).toHaveLength(1);
    expect(ids[0]).toBe(LOGO);
  });
});

describe('isUuid', () => {
  it('separa los UUID de los identificadores libres que admite el documento', () => {
    // `idSchema` acepta nanoid y slugs; `media_assets.id` es `uuid`. Los que no
    // lo son se descartan antes de tocar la clave foránea.
    expect(isUuid(LOGO)).toBe(true);
    expect(isUuid('V1StGXR8_Z5jdHi6B-myT')).toBe(false);
    expect(isUuid('logo')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
