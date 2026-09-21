'use client';

/**
 * Propiedades de una pantalla final.
 *
 * Las pantallas finales no están en `blocks`: viven en `endScreens` y solo se
 * alcanzan por caída natural del recorrido o como destino explícito de una
 * regla. Por eso tienen panel propio y no pasan por las pestañas de validación
 * o lógica, que no les aplican.
 */

import type { EndingBlock, FormDefinition } from '@/lib/forms';

import type { AccionesDocumento } from '../acciones';
import { useIntegracionMedia } from '../contexto-media';
import { CampoArea, CampoTexto, Interruptor } from '../ui/campos';
import { Seccion } from '../ui/piezas';

export interface PropsPanelPantallaFinal {
  readonly definicion: FormDefinition;
  readonly pantalla: EndingBlock;
  readonly acciones: AccionesDocumento;
}

export function PanelPantallaFinal({ definicion, pantalla, acciones }: PropsPanelPantallaFinal) {
  const { SelectorMedia } = useIntegracionMedia();
  const porDefecto =
    (definicion.defaultEndScreenId ?? definicion.endScreens[0]?.id) === pantalla.id;

  return (
    <>
      <Seccion titulo="Pantalla final">
        <CampoTexto
          etiqueta="Título"
          valor={pantalla.title}
          maxLength={500}
          alCambiar={(title) => {
            acciones.reemplazarPantallaFinal({ ...pantalla, title });
          }}
        />
        <CampoArea
          etiqueta="Cuerpo"
          filas={4}
          valor={pantalla.body ?? ''}
          maxLength={5000}
          alCambiar={(texto) => {
            acciones.reemplazarPantallaFinal({
              ...pantalla,
              body: texto === '' ? undefined : texto,
            });
          }}
        />
        <Interruptor
          etiqueta="Es la pantalla final por defecto"
          activo={porDefecto}
          ayuda="Es la que se muestra al terminar el recorrido sin que ninguna regla mande a otra parte."
          alCambiar={(activo) => {
            if (!activo) return;
            acciones.marcarPantallaPorDefecto(pantalla.id);
          }}
        />
      </Seccion>

      <Seccion titulo="Llamada a la acción" descripcion="Un enlace opcional tras la respuesta.">
        <CampoTexto
          etiqueta="Etiqueta del enlace"
          valor={pantalla.ctaLabel ?? ''}
          maxLength={120}
          marcador="Volver a la web"
          alCambiar={(texto) => {
            acciones.reemplazarPantallaFinal({
              ...pantalla,
              ctaLabel: texto === '' ? undefined : texto,
            });
          }}
        />
        <CampoTexto
          etiqueta="URL del enlace"
          valor={pantalla.ctaUrl ?? ''}
          maxLength={2000}
          marcador="https://…"
          alCambiar={(texto) => {
            acciones.reemplazarPantallaFinal({
              ...pantalla,
              ctaUrl: texto === '' ? undefined : texto,
            });
          }}
        />
      </Seccion>

      <Seccion titulo="Redirección" descripcion="Redirigir automáticamente a otra dirección al terminar.">
        <CampoTexto
          etiqueta="URL de redirección"
          valor={pantalla.redirectUrl ?? ''}
          maxLength={2000}
          marcador="https://tuweb.com/gracias"
          ayuda="Si se indica, el encuestado será redirigido a esta dirección tras guardar sus respuestas."
          alCambiar={(texto) => {
            acciones.reemplazarPantallaFinal({
              ...pantalla,
              redirectUrl: texto.trim() === '' ? undefined : texto.trim(),
            });
          }}
        />
      </Seccion>

      <Seccion titulo="Imagen">
        <SelectorMedia
          etiqueta="Imagen de la pantalla"
          assetId={pantalla.mediaAssetId}
          alCambiar={(mediaAssetId) => {
            acciones.reemplazarPantallaFinal({ ...pantalla, mediaAssetId });
          }}
        />
      </Seccion>
    </>
  );
}
