/**
 * Tokens visuales del panel.
 *
 * Los componentes de `src/components/ui` (`Boton`, `CampoTexto`, `AreaTexto`,
 * `BarraProgreso`) no llevan ningún color escrito: leen las variables `--tp-*`
 * que normalmente genera `@/lib/theme` a partir del `ThemeDefinition` de un
 * formulario. El panel no es un formulario y no tiene tema configurable, así que
 * necesita su propio juego de variables o esos componentes se pintarían
 * transparentes.
 *
 * Se declaran a mano y no reutilizando `variablesDeTema()` porque el panel es
 * cromo de la aplicación: su aspecto no debe cambiar cuando alguien retoque el
 * tema de un formulario. Los tokens derivados repiten las mismas fórmulas de
 * `color-mix()` para que la relación entre superficie, borde y acento sea la
 * misma que en el renderer.
 *
 * `light-dark()` resuelve el modo claro y oscuro sin `@media`, que es lo único
 * que permite declararlo como estilo en línea: `globals.css` ya fija
 * `color-scheme: light dark` en `<html>`.
 */

import type { CSSProperties } from 'react';

/** Estilo en línea con las variables del panel. Va en la raíz de `(app)`. */
export interface EstiloPanel extends CSSProperties {
  readonly [variable: `--tp-${string}`]: string;
}

export const ESTILO_PANEL: EstiloPanel = {
  /* --- Colores base --- */
  '--tp-fondo': 'light-dark(#f7f7f8, #0a0a0a)',
  '--tp-superficie': 'light-dark(#ffffff, #141416)',
  '--tp-texto': 'light-dark(#18181b, #ededed)',
  '--tp-controles': 'light-dark(#d4d4d8, #3f3f46)',
  '--tp-boton': 'light-dark(#1d4ed8, #3b82f6)',
  '--tp-boton-texto': '#ffffff',
  '--tp-acento': 'light-dark(#1d4ed8, #60a5fa)',

  /* --- Derivados, con las mismas fórmulas que el renderer --- */
  '--tp-texto-suave': 'color-mix(in srgb, var(--tp-texto) 62%, var(--tp-fondo))',
  '--tp-borde': 'var(--tp-controles)',
  '--tp-control-fondo': 'var(--tp-superficie)',
  '--tp-control-fondo-hover': 'color-mix(in srgb, var(--tp-acento) 8%, var(--tp-superficie))',
  '--tp-control-fondo-activo': 'color-mix(in srgb, var(--tp-acento) 16%, var(--tp-superficie))',
  '--tp-acento-suave': 'color-mix(in srgb, var(--tp-acento) 12%, var(--tp-superficie))',
  '--tp-foco': 'var(--tp-acento)',
  '--tp-error': 'light-dark(#b91c1c, #f87171)',
  '--tp-error-suave': 'color-mix(in srgb, var(--tp-error) 12%, var(--tp-superficie))',
  '--tp-exito': 'light-dark(#15803d, #4ade80)',
  '--tp-progreso-fondo': 'color-mix(in srgb, var(--tp-texto) 12%, var(--tp-fondo))',

  /* --- Forma --- */
  '--tp-radio': '0.5rem',
  '--tp-radio-superficie': '0.75rem',
};
