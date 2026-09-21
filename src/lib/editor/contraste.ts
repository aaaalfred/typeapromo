/**
 * Validación de contraste WCAG del tema.
 *
 * El contrato deja elegir seis colores libres (`ThemeColors`), así que nada
 * impide construir un tema ilegible. Este módulo calcula la relación de
 * contraste real de cada pareja que el renderer pinta de verdad y devuelve
 * advertencias en español; el panel de tema las muestra junto al color que las
 * provoca.
 *
 * Detalles que importan y que suelen hacerse mal:
 *
 * - El contrato admite `#rrggbbaa`. Un color translúcido se **compone sobre el
 *   fondo** antes de medir; medirlo ignorando el alfa da un resultado optimista.
 * - `--tp-texto-suave` no es un color del contrato: lo deriva `lib/theme` con
 *   `color-mix(in srgb, texto 68%, fondo)`. Se replica aquí la misma mezcla,
 *   porque es el color de las descripciones y es donde primero se pierde la
 *   legibilidad.
 * - Los bordes de controles y el acento son **elementos no textuales**: su
 *   mínimo es 3:1 (WCAG 2.1, criterio 1.4.11), no 4.5:1. Exigirles 4.5 produce
 *   avisos falsos que enseñan al usuario a ignorar el panel.
 */

import type { ThemeColors, ThemeDefinition } from '@/lib/forms';

/* -------------------------------------------------------------------------- */
/* Color                                                                       */
/* -------------------------------------------------------------------------- */

/** Color con canal alfa, en el espacio sRGB, componentes de 0 a 255. */
export interface ColorRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** Opacidad de 0 a 1. */
  readonly a: number;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Convierte `#rgb`, `#rrggbb` o `#rrggbbaa` a componentes. `null` si no lo es. */
export function parsearHex(color: string): ColorRgb | null {
  if (!HEX.test(color)) return null;
  const cuerpo = color.slice(1);
  const expandido =
    cuerpo.length === 3
      ? cuerpo
          .split('')
          .map((caracter) => caracter + caracter)
          .join('')
      : cuerpo;

  const leer = (indice: number): number => Number.parseInt(expandido.slice(indice, indice + 2), 16);

  return {
    r: leer(0),
    g: leer(2),
    b: leer(4),
    a: expandido.length === 8 ? leer(6) / 255 : 1,
  };
}

/** Compone un color sobre otro totalmente opaco («source over»). */
export function componerSobre(color: ColorRgb, fondo: ColorRgb): ColorRgb {
  if (color.a >= 1) return color;
  const mezclar = (frente: number, detras: number): number =>
    frente * color.a + detras * (1 - color.a);
  return {
    r: mezclar(color.r, fondo.r),
    g: mezclar(color.g, fondo.g),
    b: mezclar(color.b, fondo.b),
    a: 1,
  };
}

/**
 * Mezcla lineal en sRGB, equivalente a `color-mix(in srgb, a P%, b)`.
 * Se usa para reproducir los tokens derivados de `lib/theme`.
 */
export function mezclarSrgb(a: ColorRgb, b: ColorRgb, proporcionDeA: number): ColorRgb {
  const p = Math.min(1, Math.max(0, proporcionDeA));
  return {
    r: a.r * p + b.r * (1 - p),
    g: a.g * p + b.g * (1 - p),
    b: a.b * p + b.b * (1 - p),
    a: a.a * p + b.a * (1 - p),
  };
}

function canalLineal(valor: number): number {
  const normalizado = valor / 255;
  return normalizado <= 0.04045
    ? normalizado / 12.92
    : Math.pow((normalizado + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa según WCAG 2.1. El color debe ser opaco. */
export function luminancia(color: ColorRgb): number {
  return (
    0.2126 * canalLineal(color.r) + 0.7152 * canalLineal(color.g) + 0.0722 * canalLineal(color.b)
  );
}

/**
 * Relación de contraste entre dos colores, de 1 a 21.
 * Ambos se componen antes sobre `fondoOpaco` para tener en cuenta el alfa.
 */
export function relacionDeContraste(
  primerPlano: ColorRgb,
  fondo: ColorRgb,
  fondoOpaco: ColorRgb = { r: 255, g: 255, b: 255, a: 1 },
): number {
  const base = componerSobre(fondo, fondoOpaco);
  const frente = componerSobre(primerPlano, base);
  const l1 = luminancia(frente);
  const l2 = luminancia(base);
  const claro = Math.max(l1, l2);
  const oscuro = Math.min(l1, l2);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Redondeo a una decimal, que es la precisión con la que se comunica. */
export function redondearRelacion(relacion: number): number {
  return Math.round(relacion * 10) / 10;
}

/* -------------------------------------------------------------------------- */
/* Parejas del tema                                                            */
/* -------------------------------------------------------------------------- */

/** Naturaleza de la pareja: determina el mínimo exigible. */
export type NaturalezaContraste = 'texto' | 'texto-grande' | 'no-textual';

/** Mínimo WCAG AA de cada naturaleza. */
export const MINIMOS_AA: Readonly<Record<NaturalezaContraste, number>> = {
  texto: 4.5,
  'texto-grande': 3,
  'no-textual': 3,
};

/** Mínimo WCAG AAA de cada naturaleza. `no-textual` no tiene nivel AAA. */
export const MINIMOS_AAA: Readonly<Record<NaturalezaContraste, number>> = {
  texto: 7,
  'texto-grande': 4.5,
  'no-textual': 3,
};

/** Nivel alcanzado por una pareja. */
export type NivelContraste = 'AAA' | 'AA' | 'insuficiente';

export function nivelDeContraste(relacion: number, naturaleza: NaturalezaContraste): NivelContraste {
  if (relacion >= MINIMOS_AAA[naturaleza]) return 'AAA';
  if (relacion >= MINIMOS_AA[naturaleza]) return 'AA';
  return 'insuficiente';
}

/** Claves de color del tema, para poder señalar el control culpable. */
export type ClaveColorTema = keyof ThemeColors;

/** Resultado de una pareja concreta. */
export interface ResultadoContraste {
  /** Identificador estable de la pareja, apto para `key` y para tests. */
  readonly id: string;
  /** Descripción en español de qué se está midiendo. */
  readonly etiqueta: string;
  /** Colores del tema implicados, para enlazar el aviso con su control. */
  readonly claves: readonly ClaveColorTema[];
  readonly naturaleza: NaturalezaContraste;
  readonly relacion: number;
  readonly minimo: number;
  readonly nivel: NivelContraste;
  readonly cumple: boolean;
  /** Frase lista para mostrar. */
  readonly mensaje: string;
}

interface ParejaDeclarada {
  readonly id: string;
  readonly etiqueta: string;
  readonly claves: readonly ClaveColorTema[];
  readonly naturaleza: NaturalezaContraste;
  /** Primer plano ya resuelto (puede ser un token derivado). */
  readonly primerPlano: ColorRgb;
  readonly fondo: ColorRgb;
}

const BLANCO: ColorRgb = { r: 255, g: 255, b: 255, a: 1 };

/** Color del tema ya parseado; si no es hexadecimal válido, se cae a blanco. */
function color(colores: ThemeColors, clave: ClaveColorTema): ColorRgb {
  return parsearHex(colores[clave]) ?? BLANCO;
}

/**
 * Parejas que el renderer pinta de verdad. Cada entrada corresponde a un uso
 * observable en `components/formulario`, no a una combinación teórica.
 */
function parejas(tema: ThemeDefinition): readonly ParejaDeclarada[] {
  const colores = tema.colors;
  const fondo = color(colores, 'background');
  const texto = color(colores, 'text');
  const boton = color(colores, 'buttons');
  const botonTexto = color(colores, 'buttonText');
  const controles = color(colores, 'controls');
  const acento = color(colores, 'accent');

  // Mismo cálculo que `--tp-texto-suave` en `lib/theme/tokens.ts`.
  const textoSuave = mezclarSrgb(componerSobre(texto, fondo), componerSobre(fondo, BLANCO), 0.68);

  return [
    {
      id: 'texto-fondo',
      etiqueta: 'Texto sobre el fondo',
      claves: ['text', 'background'],
      naturaleza: 'texto',
      primerPlano: texto,
      fondo,
    },
    {
      id: 'texto-suave-fondo',
      etiqueta: 'Texto secundario (descripciones y ayudas) sobre el fondo',
      claves: ['text', 'background'],
      naturaleza: 'texto',
      primerPlano: textoSuave,
      fondo,
    },
    {
      id: 'boton-texto-boton',
      etiqueta: 'Texto del botón sobre el botón',
      claves: ['buttonText', 'buttons'],
      naturaleza: 'texto-grande',
      primerPlano: botonTexto,
      fondo: boton,
    },
    {
      id: 'boton-fondo',
      etiqueta: 'Botón sobre el fondo',
      claves: ['buttons', 'background'],
      naturaleza: 'no-textual',
      primerPlano: boton,
      fondo,
    },
    {
      id: 'controles-fondo',
      etiqueta: 'Borde de los controles sobre el fondo',
      claves: ['controls', 'background'],
      naturaleza: 'no-textual',
      primerPlano: controles,
      fondo,
    },
    {
      id: 'acento-fondo',
      etiqueta: 'Acento (foco, progreso y selección) sobre el fondo',
      claves: ['accent', 'background'],
      naturaleza: 'no-textual',
      primerPlano: acento,
      fondo,
    },
  ];
}

const NOMBRE_NATURALEZA: Readonly<Record<NaturalezaContraste, string>> = {
  texto: 'texto normal',
  'texto-grande': 'texto grande',
  'no-textual': 'elemento no textual',
};

/**
 * Analiza el contraste de todas las parejas del tema.
 * El orden es estable: el panel puede pintarlo tal cual.
 */
export function analizarContraste(tema: ThemeDefinition): readonly ResultadoContraste[] {
  const fondoOpaco = componerSobre(color(tema.colors, 'background'), BLANCO);

  return parejas(tema).map((pareja) => {
    const relacion = redondearRelacion(
      relacionDeContraste(pareja.primerPlano, pareja.fondo, fondoOpaco),
    );
    const minimo = MINIMOS_AA[pareja.naturaleza];
    const nivel = nivelDeContraste(relacion, pareja.naturaleza);
    const cumple = nivel !== 'insuficiente';
    return {
      id: pareja.id,
      etiqueta: pareja.etiqueta,
      claves: pareja.claves,
      naturaleza: pareja.naturaleza,
      relacion,
      minimo,
      nivel,
      cumple,
      mensaje: cumple
        ? `${pareja.etiqueta}: ${relacion.toFixed(1)}:1 (cumple ${nivel}).`
        : `${pareja.etiqueta}: ${relacion.toFixed(1)}:1, por debajo del mínimo ${minimo.toFixed(1)}:1 que exige WCAG AA para ${NOMBRE_NATURALEZA[pareja.naturaleza]}.`,
    };
  });
}

/** Solo las parejas que no llegan al mínimo AA. */
export function advertenciasDeContraste(tema: ThemeDefinition): readonly ResultadoContraste[] {
  return analizarContraste(tema).filter((resultado) => !resultado.cumple);
}

/** `true` si todas las parejas del tema cumplen AA. */
export function temaAccesible(tema: ThemeDefinition): boolean {
  return advertenciasDeContraste(tema).length === 0;
}
