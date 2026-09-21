import { describe, expect, it } from 'vitest';

import { RATING_SCALES } from '../definition';
import {
  denormalize,
  isRatingScale,
  isValidRatingValue,
  normalize,
  normalizeRating,
  safeNormalize,
  summarizeRating,
} from '../rating';

describe('normalize', () => {
  it('aplica exactamente (valor - 1) / (escala - 1)', () => {
    expect(normalize(3, 5)).toBeCloseTo((3 - 1) / (5 - 1), 12);
    expect(normalize(7, 10)).toBeCloseTo((7 - 1) / (10 - 1), 12);
  });

  it('el mínimo vale 0 y el máximo vale 1 en todas las escalas', () => {
    for (const scale of RATING_SCALES) {
      expect(normalize(1, scale)).toBe(0);
      expect(normalize(scale, scale)).toBe(1);
    }
  });

  it('hace comparables escalas distintas', () => {
    // El punto medio de cada escala normaliza al mismo 0,5.
    expect(normalize(2, 3)).toBeCloseTo(0.5, 12);
    expect(normalize(3, 5)).toBeCloseTo(0.5, 12);
    expect(normalize(4, 7)).toBeCloseTo(0.5, 12);
  });

  it('es monótona creciente dentro de cada escala', () => {
    for (const scale of RATING_SCALES) {
      for (let value = 1; value < scale; value += 1) {
        expect(normalize(value + 1, scale)).toBeGreaterThan(normalize(value, scale));
      }
    }
  });

  it('rechaza escalas fuera del catálogo', () => {
    for (const scale of [0, 1, 2, 4, 6, 8, 9, 11, 100]) {
      expect(() => normalize(1, scale)).toThrow(RangeError);
    }
  });

  it('rechaza valores fuera de rango o no enteros', () => {
    expect(() => normalize(0, 5)).toThrow(RangeError);
    expect(() => normalize(6, 5)).toThrow(RangeError);
    expect(() => normalize(-1, 5)).toThrow(RangeError);
    expect(() => normalize(2.5, 5)).toThrow(RangeError);
    expect(() => normalize(Number.NaN, 5)).toThrow(RangeError);
  });

  it('normalizeRating es el mismo cálculo', () => {
    expect(normalizeRating).toBe(normalize);
    expect(normalizeRating(4, 7)).toBe(normalize(4, 7));
  });
});

describe('safeNormalize', () => {
  it('devuelve null en lugar de lanzar cuando el dato no encaja', () => {
    expect(safeNormalize(3, 5)).toBeCloseTo(0.5, 12);
    expect(safeNormalize(9, 5)).toBeNull();
    expect(safeNormalize(3, 4)).toBeNull();
    expect(safeNormalize('3', 5)).toBeNull();
    expect(safeNormalize(null, 5)).toBeNull();
    expect(safeNormalize(undefined, undefined)).toBeNull();
  });
});

describe('denormalize', () => {
  it('recupera el entero de la escala', () => {
    for (const scale of RATING_SCALES) {
      for (let value = 1; value <= scale; value += 1) {
        expect(denormalize(normalize(value, scale), scale)).toBe(value);
      }
    }
  });

  it('redondea al entero más cercano', () => {
    expect(denormalize(0.51, 5)).toBe(3);
    expect(denormalize(0, 10)).toBe(1);
    expect(denormalize(1, 10)).toBe(10);
  });

  it('rechaza valores fuera de [0, 1] y escalas inválidas', () => {
    expect(() => denormalize(1.2, 5)).toThrow(RangeError);
    expect(() => denormalize(-0.1, 5)).toThrow(RangeError);
    expect(() => denormalize(0.5, 6)).toThrow(RangeError);
  });
});

describe('guardas de tipo', () => {
  it('isRatingScale solo acepta 3, 5, 7 y 10', () => {
    expect(RATING_SCALES.every((scale) => isRatingScale(scale))).toBe(true);
    expect(isRatingScale(4)).toBe(false);
    expect(isRatingScale(0)).toBe(false);
  });

  it('isValidRatingValue exige entero dentro de la escala', () => {
    expect(isValidRatingValue(1, 5)).toBe(true);
    expect(isValidRatingValue(5, 5)).toBe(true);
    expect(isValidRatingValue(0, 5)).toBe(false);
    expect(isValidRatingValue(6, 5)).toBe(false);
    expect(isValidRatingValue(3.5, 5)).toBe(false);
  });
});

describe('summarizeRating', () => {
  it('calcula recuento, promedio y distribución completa', () => {
    const summary = summarizeRating([5, 4, 4, 1], 5);
    expect(summary.count).toBe(4);
    expect(summary.average).toBeCloseTo(3.5, 12);
    expect(summary.averageNormalized).toBeCloseTo((3.5 - 1) / 4, 12);
    expect(summary.distribution).toEqual([
      { value: 1, count: 1 },
      { value: 2, count: 0 },
      { value: 3, count: 0 },
      { value: 4, count: 2 },
      { value: 5, count: 1 },
    ]);
    expect(summary.invalid).toBe(0);
  });

  it('sin respuestas devuelve promedios nulos y ceros explícitos', () => {
    const summary = summarizeRating([], 3);
    expect(summary.count).toBe(0);
    expect(summary.average).toBeNull();
    expect(summary.averageNormalized).toBeNull();
    expect(summary.distribution).toEqual([
      { value: 1, count: 0 },
      { value: 2, count: 0 },
      { value: 3, count: 0 },
    ]);
  });

  it('cuenta aparte los valores que no encajan en la escala', () => {
    const summary = summarizeRating([3, 'tres', null, 99, 2.5], 5);
    expect(summary.count).toBe(1);
    expect(summary.invalid).toBe(4);
    expect(summary.average).toBe(3);
  });

  it('rechaza una escala inválida', () => {
    expect(() => summarizeRating([1], 4)).toThrow(RangeError);
  });
});
