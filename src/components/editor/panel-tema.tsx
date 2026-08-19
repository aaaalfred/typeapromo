'use client';

/**
 * Panel de tema, con validación de contraste WCAG.
 *
 * El contraste no se calcula «al publicar»: se recalcula en cada cambio de
 * color y se muestra en dos sitios a la vez — un resumen con la relación exacta
 * de cada pareja y un aviso pegado al control del color que la provoca. Un tema
 * ilegible no impide guardar (es un borrador), pero no se puede construir sin
 * enterarse.
 *
 * Los mínimos no son uniformes: 4.5:1 para texto normal y 3:1 para elementos no
 * textuales (WCAG 2.1 §1.4.11). Exigir 4.5 al borde de un control produciría
 * avisos falsos, y un panel que avisa de más se aprende a ignorar.
 */

import { CheckCircle2 } from 'lucide-react';

import { analizarContraste, type ClaveColorTema } from '@/lib/editor';
import {
  BORDER_RADII,
  BUTTON_STYLES,
  CONTENT_ALIGNMENTS,
  THEME_FONTS,
  type BorderRadius,
  type ButtonStyle,
  type ContentAlignment,
  type FormDefinition,
  type ThemeFont,
} from '@/lib/forms';
import { NOMBRES_DE_FUENTE } from '@/lib/theme';

import type { AccionesDocumento } from './acciones';
import { useIntegracionMedia } from './contexto-media';
import { CampoColor, Deslizador, Selector } from './ui/campos';
import { CajaAviso, Seccion } from './ui/piezas';

/* -------------------------------------------------------------------------- */
/* Vocabulario                                                                 */
/* -------------------------------------------------------------------------- */

const NOMBRES_DE_COLOR: Readonly<Record<ClaveColorTema, string>> = {
  background: 'Fondo',
  text: 'Texto',
  controls: 'Controles y bordes',
  buttons: 'Botón',
  buttonText: 'Texto del botón',
  accent: 'Acento',
};

const ORDEN_DE_COLORES: readonly ClaveColorTema[] = [
  'background',
  'text',
  'controls',
  'buttons',
  'buttonText',
  'accent',
];

const NOMBRES_DE_RADIO: Readonly<Record<BorderRadius, string>> = {
  none: 'Sin redondear',
  sm: 'Ligero',
  md: 'Medio',
  lg: 'Amplio',
  full: 'Completo',
};

const NOMBRES_DE_BOTON: Readonly<Record<ButtonStyle, string>> = {
  solid: 'Sólido',
  outline: 'Contorno',
  ghost: 'Fantasma',
  pill: 'Píldora',
};

const NOMBRES_DE_ALINEACION: Readonly<Record<ContentAlignment, string>> = {
  left: 'Izquierda',
  center: 'Centro',
  right: 'Derecha',
};

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export interface PropsPanelTema {
  readonly definicion: FormDefinition;
  readonly acciones: AccionesDocumento;
}

export function PanelTema({ definicion, acciones }: PropsPanelTema) {
  const tema = definicion.theme;
  const { SelectorMedia } = useIntegracionMedia();
  const contraste = analizarContraste(tema);
  const fallos = contraste.filter((resultado) => !resultado.cumple);

  /** Primer aviso que implica a un color concreto, para pegarlo a su control. */
  const avisoDe = (clave: ClaveColorTema): string | undefined =>
    fallos.find((fallo) => fallo.claves.includes(clave))?.mensaje;

  return (
    <>
      <Seccion titulo="Colores" descripcion="Se aplican al formulario, no al editor.">
        {ORDEN_DE_COLORES.map((clave) => (
          <CampoColor
            key={clave}
            etiqueta={NOMBRES_DE_COLOR[clave]}
            valor={tema.colors[clave]}
            advertencia={avisoDe(clave)}
            alCambiar={(valor) => {
              acciones.actualizarColores({ [clave]: valor });
            }}
          />
        ))}
      </Seccion>

      <Seccion
        titulo="Contraste y accesibilidad"
        descripcion="Relación de contraste de cada pareja que el formulario pinta de verdad."
      >
        {fallos.length === 0 ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Todas las combinaciones cumplen el nivel AA de WCAG.
          </p>
        ) : (
          <div role="alert" className="flex flex-col gap-1.5">
            {fallos.map((fallo) => (
              <CajaAviso key={fallo.id} tono="advertencia">
                {fallo.mensaje}
              </CajaAviso>
            ))}
          </div>
        )}

        <ul className="flex list-none flex-col gap-1" aria-label="Relaciones de contraste">
          {contraste.map((resultado) => (
            <li
              key={resultado.id}
              data-pareja={resultado.id}
              data-cumple={resultado.cumple ? 'si' : 'no'}
              className="flex items-baseline justify-between gap-2 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-neutral-300">
                {resultado.etiqueta}
              </span>
              <span
                className={
                  resultado.cumple
                    ? 'shrink-0 tabular-nums text-neutral-500 dark:text-neutral-400'
                    : 'shrink-0 font-semibold tabular-nums text-amber-700 dark:text-amber-400'
                }
              >
                {resultado.relacion.toFixed(1)}:1 ·{' '}
                {resultado.cumple ? resultado.nivel : `mínimo ${resultado.minimo.toFixed(1)}:1`}
              </span>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Tipografía">
        <Selector<ThemeFont>
          etiqueta="Fuente"
          valor={tema.typography.fontFamily}
          opciones={THEME_FONTS.map((fuente) => ({
            valor: fuente,
            etiqueta: NOMBRES_DE_FUENTE[fuente],
          }))}
          ayuda="Catálogo local: no se cargan fuentes de terceros."
          alCambiar={(fontFamily) => {
            acciones.actualizarTipografia({ fontFamily });
          }}
        />
        <Deslizador
          etiqueta="Tamaño base"
          valor={tema.typography.baseSize}
          min={12}
          max={28}
          sufijo=" px"
          alCambiar={(baseSize) => {
            acciones.actualizarTipografia({ baseSize });
          }}
        />
        <Deslizador
          etiqueta="Escala de títulos"
          valor={tema.typography.headingScale}
          min={1}
          max={2.5}
          step={0.05}
          alCambiar={(headingScale) => {
            acciones.actualizarTipografia({ headingScale });
          }}
        />
      </Seccion>

      <Seccion titulo="Forma">
        <Selector<BorderRadius>
          etiqueta="Radio de los bordes"
          valor={tema.borderRadius}
          opciones={BORDER_RADII.map((radio) => ({
            valor: radio,
            etiqueta: NOMBRES_DE_RADIO[radio],
          }))}
          alCambiar={(borderRadius) => {
            acciones.actualizarTema({ borderRadius });
          }}
        />
        <Selector<ButtonStyle>
          etiqueta="Estilo de los botones"
          valor={tema.buttonStyle}
          opciones={BUTTON_STYLES.map((estilo) => ({
            valor: estilo,
            etiqueta: NOMBRES_DE_BOTON[estilo],
          }))}
          alCambiar={(buttonStyle) => {
            acciones.actualizarTema({ buttonStyle });
          }}
        />
        <Selector<ContentAlignment>
          etiqueta="Alineación del contenido"
          valor={tema.contentAlignment}
          opciones={CONTENT_ALIGNMENTS.map((alineacion) => ({
            valor: alineacion,
            etiqueta: NOMBRES_DE_ALINEACION[alineacion],
          }))}
          alCambiar={(contentAlignment) => {
            acciones.actualizarTema({ contentAlignment });
          }}
        />
      </Seccion>

      <Seccion titulo="Imágenes del tema">
        <SelectorMedia
          etiqueta="Logo"
          assetId={tema.logoAssetId}
          alCambiar={(logoAssetId) => {
            acciones.actualizarTema({ logoAssetId });
          }}
        />
        <SelectorMedia
          etiqueta="Imagen de fondo"
          assetId={tema.backgroundImageAssetId}
          alCambiar={(backgroundImageAssetId) => {
            acciones.actualizarTema({ backgroundImageAssetId });
          }}
        />
        <Deslizador
          etiqueta="Opacidad del velo sobre el fondo"
          valor={tema.backgroundOverlayOpacity}
          min={0}
          max={1}
          step={0.05}
          alCambiar={(backgroundOverlayOpacity) => {
            acciones.actualizarTema({ backgroundOverlayOpacity });
          }}
        />
      </Seccion>
    </>
  );
}
