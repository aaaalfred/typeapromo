/**
 * Traducción de `ThemeDefinition` a variables CSS.
 *
 * Todo el aspecto del renderer se dirige desde **un único punto**: el elemento
 * raíz recibe el objeto que devuelve `estiloDeTema()` y el resto del árbol lee
 * `var(--tp-…)`. Ningún componente decide colores con clases condicionales, así
 * que cambiar un token del tema no puede afectar a unos bloques y a otros no.
 *
 * Los tokens derivados (texto atenuado, superficie de control, acento suave) se
 * calculan con `color-mix()` en el navegador en lugar de en JavaScript: así
 * siguen siendo correctos aunque el color base llegue con canal alfa.
 */

import type { CSSProperties } from 'react';

import type { BorderRadius, ContentAlignment, ThemeDefinition } from '@/lib/forms';

import { pilaDeFuente } from './fuentes';

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

/** Mapa de variables CSS del tema. */
export type VariablesDeTema = Readonly<Record<`--tp-${string}`, string>>;

/**
 * Estilo en línea del elemento raíz del renderer: las variables del tema más
 * las propiedades base que el resto del árbol hereda.
 */
export interface EstiloDeTema extends CSSProperties {
  readonly [variable: `--tp-${string}`]: string | undefined;
}

/** Opciones de resolución de activos, ya convertidos a URL por quien renderiza. */
export interface OpcionesDeTema {
  /** URL pública de la imagen de fondo, si el tema declara una y está resuelta. */
  readonly urlImagenFondo?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Escalas discretas                                                           */
/* -------------------------------------------------------------------------- */

/** Radio de bordes de cada valor del contrato. */
export const RADIOS_DE_BORDE: Readonly<Record<BorderRadius, string>> = {
  none: '0px',
  sm: '0.25rem',
  md: '0.625rem',
  lg: '1.125rem',
  full: '9999px',
};

/** Alineación del texto de cada valor del contrato. */
export const ALINEACIONES_DE_TEXTO: Readonly<Record<ContentAlignment, string>> = {
  left: 'left',
  center: 'center',
  right: 'right',
};

/** Equivalente de la alineación en el eje transversal de un contenedor flex. */
export const ALINEACIONES_FLEX: Readonly<Record<ContentAlignment, string>> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};

/* -------------------------------------------------------------------------- */
/* URL segura para CSS                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Patrón conservador para URLs que van a acabar dentro de `url(...)`.
 *
 * Se rechaza cualquier cosa con comillas, paréntesis, barra invertida o espacios
 * para que un activo con nombre hostil no pueda cerrar la declaración e inyectar
 * CSS. Solo se admiten rutas absolutas del propio dominio y http(s).
 */
const URL_ADMISIBLE = /^(?:https?:\/\/|\/)[^"'()\s\\<>]+$/;

/**
 * Devuelve `url("…")` si la URL es admisible, o `null` si no lo es.
 * Se exporta porque el editor la necesita para previsualizar fondos.
 */
export function urlCssSegura(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !URL_ADMISIBLE.test(url)) return null;
  return `url("${url}")`;
}

/* -------------------------------------------------------------------------- */
/* Variables                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Convierte el tema en el conjunto completo de variables CSS.
 *
 * Los tokens del contrato (`background`, `text`, `controls`, `buttons`,
 * `buttonText`, `accent`) se copian tal cual; el resto se deriva de ellos para
 * que un tema con seis colores produzca una interfaz coherente.
 */
export function variablesDeTema(
  tema: ThemeDefinition,
  opciones: OpcionesDeTema = {},
): VariablesDeTema {
  const imagenFondo = urlCssSegura(opciones.urlImagenFondo);

  return {
    /* --- Colores del contrato --- */
    '--tp-fondo': tema.colors.background,
    '--tp-texto': tema.colors.text,
    '--tp-controles': tema.colors.controls,
    '--tp-boton': tema.colors.buttons,
    '--tp-boton-texto': tema.colors.buttonText,
    '--tp-acento': tema.colors.accent,

    /* --- Colores derivados --- */
    /** Texto secundario: descripciones, ayudas y contadores. */
    '--tp-texto-suave': 'color-mix(in srgb, var(--tp-texto) 68%, var(--tp-fondo))',
    /** Borde de los controles en reposo. */
    '--tp-borde': 'var(--tp-controles)',
    /** Relleno de un control no seleccionado. */
    '--tp-control-fondo': 'color-mix(in srgb, var(--tp-controles) 14%, var(--tp-fondo))',
    /** Relleno de un control bajo el puntero. */
    '--tp-control-fondo-hover': 'color-mix(in srgb, var(--tp-acento) 8%, var(--tp-fondo))',
    /** Relleno de un control seleccionado. */
    '--tp-control-fondo-activo': 'color-mix(in srgb, var(--tp-acento) 16%, var(--tp-fondo))',
    /** Acento atenuado, para superficies grandes. */
    '--tp-acento-suave': 'color-mix(in srgb, var(--tp-acento) 14%, var(--tp-fondo))',
    /** Color del anillo de foco. */
    '--tp-foco': 'var(--tp-acento)',
    /** Color de los mensajes de validación. */
    '--tp-error': 'color-mix(in srgb, #dc2626 78%, var(--tp-texto))',
    /** Pista de la barra de progreso. */
    '--tp-progreso-fondo': 'color-mix(in srgb, var(--tp-texto) 14%, var(--tp-fondo))',

    /* --- Tipografía --- */
    '--tp-fuente': pilaDeFuente(tema.typography.fontFamily),
    '--tp-tamano-base': `${String(tema.typography.baseSize)}px`,
    '--tp-escala-titulos': String(tema.typography.headingScale),
    '--tp-tamano-titulo':
      'calc(var(--tp-tamano-base) * var(--tp-escala-titulos) * var(--tp-escala-titulos))',
    '--tp-tamano-subtitulo': 'calc(var(--tp-tamano-base) * var(--tp-escala-titulos))',
    '--tp-tamano-menudo': 'calc(var(--tp-tamano-base) * 0.8125)',

    /* --- Forma --- */
    '--tp-radio': RADIOS_DE_BORDE[tema.borderRadius],
    /** Radio acotado para superficies grandes: `full` no debe redondear tarjetas. */
    '--tp-radio-superficie': `min(${RADIOS_DE_BORDE[tema.borderRadius]}, 1.125rem)`,
    '--tp-alineacion': ALINEACIONES_DE_TEXTO[tema.contentAlignment],
    '--tp-alineacion-flex': ALINEACIONES_FLEX[tema.contentAlignment],

    /* --- Fondo --- */
    '--tp-imagen-fondo': imagenFondo ?? 'none',
    '--tp-superposicion': String(tema.backgroundOverlayOpacity),
  };
}

/**
 * Estilo completo del elemento raíz: las variables del tema más las propiedades
 * heredables. Todo lo que hay debajo lee `var(--tp-…)` o hereda de aquí.
 */
export function estiloDeTema(tema: ThemeDefinition, opciones: OpcionesDeTema = {}): EstiloDeTema {
  return {
    ...variablesDeTema(tema, opciones),
    backgroundColor: 'var(--tp-fondo)',
    color: 'var(--tp-texto)',
    fontFamily: 'var(--tp-fuente)',
    fontSize: 'var(--tp-tamano-base)',
    textAlign: tema.contentAlignment,
  };
}

/**
 * Atributos `data-*` del elemento raíz.
 *
 * Existen por dos motivos: dan un gancho de CSS para las variantes que no son
 * un color (estilo de botón, alineación) y hacen el tema **observable** desde
 * los tests sin depender de clases de Tailwind.
 */
export function atributosDeTema(tema: ThemeDefinition): Readonly<Record<string, string>> {
  return {
    'data-tema-fuente': tema.typography.fontFamily,
    'data-tema-radio': tema.borderRadius,
    'data-tema-boton': tema.buttonStyle,
    'data-tema-alineacion': tema.contentAlignment,
  };
}
