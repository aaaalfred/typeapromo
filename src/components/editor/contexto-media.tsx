'use client';

/**
 * Punto de extensión para el pipeline de media (fase 6).
 *
 * El editor necesita dos cosas de los activos: **resolverlos** para pintarlos
 * en la previsualización y **elegirlos** desde el panel de propiedades. Las dos
 * entran por aquí, no por dentro:
 *
 * - `resolverMedia` es exactamente la costura que ya define el renderer
 *   (`components/formulario/medios.ts`); el editor se limita a reenviarla.
 * - `SelectorMedia` es el componente de subida. Mientras la fase 6 no exista,
 *   se usa el de reserva de abajo, que permite pegar el identificador de un
 *   activo ya creado y quitarlo. No es la experiencia final, pero mantiene el
 *   documento coherente y —sobre todo— permite que la fase 6 se enchufe
 *   pasando un componente, sin tocar ni un fichero del editor.
 */

import { createContext, useContext, type ComponentType } from 'react';

import { SIN_MEDIA, type ResolverMedia } from '@/components/formulario';

import { CampoTexto } from './ui/campos';
import { BotonEditor } from './ui/piezas';

/** Props que recibe cualquier selector de activos. */
export interface PropsSelectorMedia {
  readonly etiqueta: string;
  /** Activo actualmente asociado, o `undefined` si no hay ninguno. */
  readonly assetId: string | undefined;
  readonly alCambiar: (assetId: string | undefined) => void;
  readonly ayuda?: string;
}

export type ComponenteSelectorMedia = ComponentType<PropsSelectorMedia>;

/** Selector de reserva: identificador a mano. Se sustituye en la fase 6. */
export function SelectorMediaBasico({
  etiqueta,
  assetId,
  alCambiar,
  ayuda,
}: PropsSelectorMedia) {
  return (
    <div className="flex flex-col gap-1">
      <CampoTexto
        etiqueta={etiqueta}
        valor={assetId ?? ''}
        marcador="Identificador del activo"
        ayuda={
          ayuda ??
          'La subida de imágenes llega con el pipeline de media; por ahora se referencia un activo ya existente.'
        }
        alCambiar={(texto) => {
          const limpio = texto.trim();
          alCambiar(limpio === '' ? undefined : limpio);
        }}
      />
      {assetId === undefined ? null : (
        <div>
          <BotonEditor
            variante="peligro"
            tamano="sm"
            onClick={() => {
              alCambiar(undefined);
            }}
          >
            Quitar imagen
          </BotonEditor>
        </div>
      )}
    </div>
  );
}

export interface IntegracionMedia {
  readonly resolverMedia: ResolverMedia;
  readonly SelectorMedia: ComponenteSelectorMedia;
}

const POR_DEFECTO: IntegracionMedia = {
  resolverMedia: SIN_MEDIA,
  SelectorMedia: SelectorMediaBasico,
};

const ContextoMedia = createContext<IntegracionMedia>(POR_DEFECTO);

export const ProveedorMedia = ContextoMedia.Provider;

export function useIntegracionMedia(): IntegracionMedia {
  return useContext(ContextoMedia);
}

export { POR_DEFECTO as INTEGRACION_MEDIA_POR_DEFECTO };
