'use client';

/**
 * El editor con el pipeline de media conectado.
 *
 * Existe por una razón de frontera: la página de `/app/formularios/:id/editar`
 * es un componente de servidor, y la integración necesita estado y efectos.
 * Este envoltorio es la costura mínima entre las dos: monta el almacén, arma
 * `{ resolverMedia, SelectorMedia }` y se lo pasa a `EditorFormulario` por la
 * prop que ya existía para esto desde la fase 5.
 *
 * El editor no se entera de nada: sigue sin importar una sola línea del cliente
 * de media, y sus tests siguen usando el selector de reserva.
 */

import { useMemo } from 'react';

import type { FormDefinition } from '@/lib/forms';

import { EditorFormulario, type PropsEditorFormulario } from '../editor-formulario';
import type { IntegracionMedia } from '../contexto-media';

import { ProveedorAlmacenMedia, useAlmacenMedia } from './almacen';
import { SelectorMediaSubida } from './selector';

type PropsSinIntegracion = Omit<PropsEditorFormulario, 'integracionMedia'>;

/** Toma `resolverMedia` del almacén y lo une al selector de subida. */
function EditorConIntegracion(props: PropsSinIntegracion) {
  const { resolverMedia } = useAlmacenMedia();

  const integracionMedia = useMemo<IntegracionMedia>(
    () => ({ resolverMedia, SelectorMedia: SelectorMediaSubida }),
    [resolverMedia],
  );

  return <EditorFormulario {...props} integracionMedia={integracionMedia} />;
}

export function EditorConMedia(props: PropsSinIntegracion) {
  // La precarga parte del documento inicial: los activos que se añadan después
  // entran en el almacén por la propia subida.
  const definicionInicial: FormDefinition = props.definicionInicial;

  return (
    <ProveedorAlmacenMedia definicionInicial={definicionInicial}>
      <EditorConIntegracion {...props} />
    </ProveedorAlmacenMedia>
  );
}
