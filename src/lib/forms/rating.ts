/**
 * Normalización de valoraciones.
 *
 * Se **almacena siempre el entero elegido** por el participante (1..escala) y
 * la normalización se calcula al leer. Guardar el valor normalizado haría
 * imposible cambiar la escala de una pregunta sin reescribir respuestas
 * históricas, que es justo lo que el versionado del formulario evita.
 */

import { RATING_SCALES, type RatingScale } from './definition';

const VALID_SCALES: ReadonlySet<number> = new Set<number>(RATING_SCALES);

/** `true` si `scale` es una de las escalas admitidas (3, 5, 7 o 10). */
export function isRatingScale(scale: number): scale is RatingScale {
  return VALID_SCALES.has(scale);
}

/** `true` si `value` es un entero dentro de `[1, scale]`. */
export function isValidRatingValue(value: number, scale: RatingScale): boolean {
  return Number.isInteger(value) && value >= 1 && value <= scale;
}

/**
 * Normaliza un valor de rating al intervalo `[0, 1]`:
 *
 * ```text
 * normalize(value, scale) = (value - 1) / (scale - 1)
 * ```
 *
 * Así, el mínimo de cualquier escala vale `0` y el máximo vale `1`, que es lo
 * que permite comparar una pregunta de 3 estrellas con otra de 10 corazones.
 *
 * @throws {RangeError} si la escala no es válida o el valor cae fuera de ella.
 */
export function normalize(value: number, scale: number): number {
  if (!isRatingScale(scale)) {
    throw new RangeError(
      `Escala de rating no admitida: ${String(scale)}. Válidas: ${RATING_SCALES.join(', ')}`,
    );
  }
  if (!isValidRatingValue(value, scale)) {
    throw new RangeError(
      `Valor de rating fuera de rango: ${String(value)} no es un entero de 1 a ${String(scale)}`,
    );
  }
  return (value - 1) / (scale - 1);
}

/** Alias explícito de {@link normalize} para llamadas desde otros módulos. */
export const normalizeRating = normalize;

/** Igual que {@link normalize} pero devuelve `null` en vez de lanzar. */
export function safeNormalize(value: unknown, scale: unknown): number | null {
  if (typeof value !== 'number' || typeof scale !== 'number') return null;
  if (!isRatingScale(scale) || !isValidRatingValue(value, scale)) return null;
  return (value - 1) / (scale - 1);
}

/**
 * Operación inversa: lleva un valor normalizado de vuelta al entero más cercano
 * de la escala. Se usa para pintar promedios sobre el control visual.
 *
 * @throws {RangeError} si la escala no es válida o el valor sale de `[0, 1]`.
 */
export function denormalize(normalized: number, scale: number): number {
  if (!isRatingScale(scale)) {
    throw new RangeError(`Escala de rating no admitida: ${String(scale)}`);
  }
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    throw new RangeError(`Valor normalizado fuera de [0, 1]: ${String(normalized)}`);
  }
  return Math.round(normalized * (scale - 1)) + 1;
}

/** Resumen analítico de una pregunta de rating. */
export interface RatingSummary {
  /** Respuestas válidas contabilizadas. */
  readonly count: number;
  /** Promedio en la escala original, o `null` si no hay respuestas. */
  readonly average: number | null;
  /** Promedio normalizado a `[0, 1]`, comparable entre escalas distintas. */
  readonly averageNormalized: number | null;
  /** Recuento por valor, de `1` a `scale`, con ceros explícitos. */
  readonly distribution: readonly { readonly value: number; readonly count: number }[];
  /** Valores descartados por no ser enteros dentro de la escala. */
  readonly invalid: number;
}

/**
 * Calcula promedio y distribución de una pregunta de rating. Los valores que no
 * encajan en la escala se cuentan aparte en lugar de silenciarse: si aparecen,
 * hay respuestas de una versión con otra escala mezcladas en la consulta.
 */
export function summarizeRating(values: readonly unknown[], scale: number): RatingSummary {
  if (!isRatingScale(scale)) {
    throw new RangeError(`Escala de rating no admitida: ${String(scale)}`);
  }

  const counts = new Map<number, number>();
  for (let value = 1; value <= scale; value += 1) counts.set(value, 0);

  let total = 0;
  let count = 0;
  let invalid = 0;

  for (const raw of values) {
    if (typeof raw !== 'number' || !isValidRatingValue(raw, scale)) {
      invalid += 1;
      continue;
    }
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    total += raw;
    count += 1;
  }

  const average = count === 0 ? null : total / count;

  return {
    count,
    average,
    averageNormalized: average === null ? null : (average - 1) / (scale - 1),
    distribution: Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([value, occurrences]) => ({ value, count: occurrences })),
    invalid,
  };
}
