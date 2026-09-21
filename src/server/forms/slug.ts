/**
 * Slug público de un formulario (`/f/:slug`).
 *
 * Se deriva del título, se sanea a `[a-z0-9-]` y la colisión se resuelve de
 * forma **determinista**: `titulo`, `titulo-2`, `titulo-3`… Nada de sufijos
 * aleatorios: dos ejecuciones con el mismo estado de la base de datos producen
 * el mismo slug, que es lo que hace reproducibles los tests y las semillas.
 *
 * Módulo puro: no toca la base de datos. La consulta de slugs ocupados vive en
 * `service.ts`.
 */

/** Longitud máxima del slug, sufijo de desambiguación incluido. */
export const SLUG_MAX_LENGTH = 60;

/** Slug usado cuando el título no aporta ni un solo carácter aprovechable. */
export const SLUG_FALLBACK = 'formulario';

/** Número máximo de intentos de desambiguación antes de darse por vencido. */
const MAX_SLUG_ATTEMPTS = 10_000;

/** Marcas combinantes que deja atrás la normalización NFD (tildes, diéresis, virgulilla). */
const COMBINING_MARKS = /\p{M}/gu;
const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Convierte un texto libre en un slug seguro.
 *
 * - Normaliza a NFD y elimina diacríticos: «Encuesta de satisfacción» →
 *   `encuesta-de-satisfaccion`.
 * - La `ñ` se transcribe a `n` por la misma vía; la `ß` y otros casos sin
 *   descomposición canónica simplemente desaparecen, que es lo deseable.
 * - Cualquier otro carácter (emoji, puntuación, alfabetos no latinos) se colapsa
 *   en un único guion.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_SLUG_CHARS, '-')
    .replace(EDGE_DASHES, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(EDGE_DASHES, '');

  return slug.length > 0 ? slug : SLUG_FALLBACK;
}

/** `true` si el valor ya es un slug canónico. */
export function isValidSlug(value: string): boolean {
  return value.length > 0 && value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

/**
 * Recorta el slug base para que quepa el sufijo `-n` sin superar el máximo.
 * Se recorta por la derecha y se vuelven a limpiar los guiones sobrantes.
 */
function truncateForSuffix(base: string, suffix: string): string {
  const room = SLUG_MAX_LENGTH - suffix.length;
  if (base.length <= room) return base;
  const cut = base.slice(0, Math.max(1, room)).replace(EDGE_DASHES, '');
  return cut.length > 0 ? cut : SLUG_FALLBACK.slice(0, Math.max(1, room));
}

/**
 * Devuelve el primer slug libre a partir de `base`, en orden determinista.
 *
 * @param base   Slug ya saneado (idealmente el resultado de `slugify`).
 * @param taken  Slugs ya ocupados en la base de datos.
 */
export function resolveSlugCollision(base: string, taken: Iterable<string>): string {
  const canonical = isValidSlug(base) ? base : slugify(base);
  const occupied = new Set(taken);

  if (!occupied.has(canonical)) return canonical;

  for (let attempt = 2; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const suffix = `-${String(attempt)}`;
    const candidate = `${truncateForSuffix(canonical, suffix)}${suffix}`;
    if (!occupied.has(candidate)) return candidate;
  }

  // Inalcanzable en la práctica: exigiría diez mil formularios con el mismo
  // título. Se lanza en vez de devolver un slug duplicado y romper el índice.
  throw new Error('No se ha podido generar un slug único');
}

/**
 * Prefijo por el que buscar candidatos ocupados en la base de datos: basta con
 * los slugs que empiezan por el base, no hace falta leer la tabla entera.
 */
export function slugSearchPrefix(base: string): string {
  return isValidSlug(base) ? base : slugify(base);
}
