'use client';

/**
 * Pestaña «Media»: las imágenes del bloque.
 *
 * El contrato admite imagen en el propio bloque (`mediaAssetId`) y en cada
 * opción de una pregunta de selección (`ChoiceDefinition.assetId`). Las dos se
 * editan aquí con el selector que inyecte quien monte el editor, de modo que
 * cuando llegue la subida real (fase 6) este panel no cambia.
 */

import { isChoiceBlock } from '@/lib/forms';

import { useIntegracionMedia } from '../contexto-media';
import { CajaAviso, Seccion } from '../ui/piezas';

import type { PropsPanelBloque } from './contenido';

export function PanelMedia({ bloque, acciones }: PropsPanelBloque) {
  const { SelectorMedia } = useIntegracionMedia();
  const visual =
    isChoiceBlock(bloque) &&
    (bloque.presentation === 'image_cards' || bloque.presentation === 'grid');

  return (
    <>
      <Seccion
        titulo="Imagen del bloque"
        descripcion="Se muestra sobre el título, dentro de la misma pantalla."
      >
        <SelectorMedia
          etiqueta="Imagen"
          assetId={bloque.mediaAssetId}
          alCambiar={(assetId) => {
            acciones.reemplazarBloque({ ...bloque, mediaAssetId: assetId });
          }}
        />
      </Seccion>

      {isChoiceBlock(bloque) ? (
        <Seccion
          titulo="Imágenes de las opciones"
          descripcion="Necesarias para las presentaciones «Tarjetas con imagen» y «Cuadrícula visual»."
        >
          {visual ? null : (
            <CajaAviso tono="informacion">
              Esta pregunta se muestra como lista o botones, así que las imágenes de las opciones no
              se verán hasta que cambies la presentación en la pestaña «Apariencia».
            </CajaAviso>
          )}
          {bloque.choices.map((opcion) => (
            <SelectorMedia
              key={opcion.id}
              etiqueta={opcion.label}
              assetId={opcion.assetId}
              alCambiar={(assetId) => {
                acciones.actualizarOpcion(bloque.id, opcion.id, { assetId });
              }}
            />
          ))}
        </Seccion>
      ) : null}
    </>
  );
}
