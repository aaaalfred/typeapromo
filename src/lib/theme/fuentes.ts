/**
 * Catálogo local de tipografías.
 *
 * El producto no carga fuentes de terceros (ni Google Fonts ni CDNs): cada
 * entrada del catálogo es una **pila de familias** que se resuelve contra las
 * fuentes instaladas en el dispositivo y termina siempre en una familia
 * genérica, de modo que ningún tema puede quedarse sin texto legible.
 *
 * El catálogo es el mismo `THEME_FONTS` del contrato Zod: si allí se añade una
 * fuente, TypeScript obliga a añadirla aquí.
 */

import { THEME_FONTS, type ThemeFont } from '@/lib/forms';

/** Pila de familias CSS de cada fuente del catálogo. */
export const PILAS_DE_FUENTE: Readonly<Record<ThemeFont, string>> = {
  system:
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', sans-serif",
  inter: "Inter, 'Inter var', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  'dm-sans': "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  'space-grotesk': "'Space Grotesk', 'Trebuchet MS', system-ui, sans-serif",
  'ibm-plex-sans': "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  lora: "Lora, Georgia, 'Times New Roman', serif",
  georgia: "Georgia, Cambria, 'Times New Roman', Times, serif",
};

/** Nombre legible de cada fuente, para el selector del editor. */
export const NOMBRES_DE_FUENTE: Readonly<Record<ThemeFont, string>> = {
  system: 'Del sistema',
  inter: 'Inter',
  'dm-sans': 'DM Sans',
  'space-grotesk': 'Space Grotesk',
  'ibm-plex-sans': 'IBM Plex Sans',
  lora: 'Lora',
  georgia: 'Georgia',
};

/** Catálogo listo para pintar un desplegable. */
export const CATALOGO_DE_FUENTES: readonly { valor: ThemeFont; nombre: string; pila: string }[] =
  THEME_FONTS.map((valor) => ({
    valor,
    nombre: NOMBRES_DE_FUENTE[valor],
    pila: PILAS_DE_FUENTE[valor],
  }));

/**
 * Pila CSS de una fuente del catálogo. Acepta cualquier cadena para tolerar
 * documentos antiguos: si el valor no está en el catálogo, cae en `system`.
 */
export function pilaDeFuente(fuente: string): string {
  return Object.prototype.hasOwnProperty.call(PILAS_DE_FUENTE, fuente)
    ? PILAS_DE_FUENTE[fuente as ThemeFont]
    : PILAS_DE_FUENTE.system;
}
