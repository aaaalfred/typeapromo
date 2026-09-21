/**
 * Contraste WCAG del tema.
 *
 * Los valores de referencia son los de la propia especificación: negro sobre
 * blanco son exactamente 21:1, y `#767676` sobre blanco es el caso canónico que
 * la documentación de WCAG usa como «justo en 4.5:1».
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME, type ThemeDefinition } from '@/lib/forms';

import {
  advertenciasDeContraste,
  analizarContraste,
  componerSobre,
  luminancia,
  nivelDeContraste,
  parsearHex,
  relacionDeContraste,
  temaAccesible,
} from '../contraste';

function conColores(parcial: Partial<ThemeDefinition['colors']>): ThemeDefinition {
  return { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, ...parcial } };
}

const NEGRO = { r: 0, g: 0, b: 0, a: 1 };
const BLANCO = { r: 255, g: 255, b: 255, a: 1 };

describe('parsearHex', () => {
  it('acepta las tres notaciones del contrato', () => {
    expect(parsearHex('#fff')).toEqual(BLANCO);
    expect(parsearHex('#ffffff')).toEqual(BLANCO);
    expect(parsearHex('#00000080')?.a).toBeCloseTo(0.502, 2);
  });

  it('rechaza lo que no es hexadecimal', () => {
    expect(parsearHex('rgb(0,0,0)')).toBeNull();
    expect(parsearHex('#12345')).toBeNull();
  });
});

describe('relacionDeContraste', () => {
  it('da 21:1 entre negro y blanco', () => {
    expect(relacionDeContraste(NEGRO, BLANCO)).toBeCloseTo(21, 5);
  });

  it('es simétrica', () => {
    expect(relacionDeContraste(NEGRO, BLANCO)).toBeCloseTo(relacionDeContraste(BLANCO, NEGRO), 5);
  });

  it('reconoce el umbral canónico de 4.5:1', () => {
    const gris = parsearHex('#767676');
    expect(gris).not.toBeNull();
    if (gris === null) return;
    expect(relacionDeContraste(gris, BLANCO)).toBeGreaterThanOrEqual(4.5);
  });

  it('tiene en cuenta el canal alfa componiendo sobre el fondo', () => {
    const negroMedio = parsearHex('#00000080');
    expect(negroMedio).not.toBeNull();
    if (negroMedio === null) return;
    // Medido sin componer daría 21:1; compuesto sobre blanco baja mucho.
    const relacion = relacionDeContraste(negroMedio, BLANCO, BLANCO);
    expect(relacion).toBeLessThan(21);
    expect(relacion).toBeGreaterThan(1);
  });

  it('la luminancia del blanco es 1 y la del negro 0', () => {
    expect(luminancia(BLANCO)).toBeCloseTo(1, 5);
    expect(luminancia(NEGRO)).toBeCloseTo(0, 5);
  });

  it('componer un color opaco lo deja igual', () => {
    expect(componerSobre(NEGRO, BLANCO)).toEqual(NEGRO);
  });
});

describe('nivelDeContraste', () => {
  it('aplica 4.5 a texto normal y 3 a elementos no textuales', () => {
    expect(nivelDeContraste(4.6, 'texto')).toBe('AA');
    expect(nivelDeContraste(4.4, 'texto')).toBe('insuficiente');
    expect(nivelDeContraste(3.1, 'no-textual')).toBe('AAA');
    expect(nivelDeContraste(2.9, 'no-textual')).toBe('insuficiente');
    expect(nivelDeContraste(7.5, 'texto')).toBe('AAA');
  });
});

describe('analizarContraste', () => {
  it('el tema por defecto cumple AA en todas las parejas de texto', () => {
    const fallos = advertenciasDeContraste(DEFAULT_THEME);
    expect(fallos.filter((fallo) => fallo.naturaleza !== 'no-textual')).toHaveLength(0);
  });

  /**
   * Este test nació fijando un defecto: `DEFAULT_THEME` usaba `#d1d5db` para el
   * borde de los controles, ~1,4:1 sobre blanco, muy por debajo del 3:1 que
   * WCAG 2.1 §1.4.11 exige a los elementos no textuales, y el editor lo avisaba
   * desde el primer formulario. El color se oscureció a `#6b7280` (4,83:1), así
   * que ahora fija lo contrario: un formulario nuevo **no nace con avisos**.
   */
  it('el tema por defecto no produce ninguna advertencia', () => {
    const fallos = advertenciasDeContraste(DEFAULT_THEME);
    expect(fallos).toEqual([]);
    expect(temaAccesible(DEFAULT_THEME)).toBe(true);
  });

  it('un tema con el borde oscurecido cumple todo', () => {
    expect(temaAccesible(conColores({ controls: '#6b7280' }))).toBe(true);
  });

  it('detecta texto ilegible sobre el fondo', () => {
    const tema = conColores({ text: '#eeeeee', background: '#ffffff' });
    const fallos = advertenciasDeContraste(tema);
    expect(fallos.some((fallo) => fallo.id === 'texto-fondo')).toBe(true);
    const fallo = fallos.find((candidato) => candidato.id === 'texto-fondo');
    expect(fallo?.claves).toContain('text');
    expect(fallo?.mensaje).toContain('WCAG AA');
  });

  it('detecta el texto secundario aunque el principal cumpla', () => {
    // `#595959` sobre blanco cumple 4.5:1, pero atenuado al 68 % ya no.
    const tema = conColores({ text: '#595959', background: '#ffffff' });
    const resultados = analizarContraste(tema);
    const principal = resultados.find((resultado) => resultado.id === 'texto-fondo');
    const secundario = resultados.find((resultado) => resultado.id === 'texto-suave-fondo');
    expect(principal?.cumple).toBe(true);
    expect(secundario?.relacion).toBeLessThan(principal?.relacion ?? 0);
  });

  it('exige solo 3:1 al borde de los controles', () => {
    const tema = conColores({ controls: '#949494', background: '#ffffff' });
    const control = analizarContraste(tema).find((resultado) => resultado.id === 'controles-fondo');
    expect(control?.naturaleza).toBe('no-textual');
    expect(control?.minimo).toBe(3);
    expect(control?.cumple).toBe(true);
  });

  it('detecta un botón con el texto ilegible encima', () => {
    const tema = conColores({ buttons: '#ffd400', buttonText: '#ffffff' });
    const fallos = advertenciasDeContraste(tema);
    expect(fallos.some((fallo) => fallo.id === 'boton-texto-boton')).toBe(true);
  });

  it('devuelve siempre las seis parejas, en orden estable', () => {
    const ids = analizarContraste(DEFAULT_THEME).map((resultado) => resultado.id);
    expect(ids).toEqual([
      'texto-fondo',
      'texto-suave-fondo',
      'boton-texto-boton',
      'boton-fondo',
      'controles-fondo',
      'acento-fondo',
    ]);
  });
});
