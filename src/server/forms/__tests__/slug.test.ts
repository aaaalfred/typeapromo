import { describe, expect, it } from 'vitest';

import {
  SLUG_FALLBACK,
  SLUG_MAX_LENGTH,
  isValidSlug,
  resolveSlugCollision,
  slugSearchPrefix,
  slugify,
} from '../slug';

describe('slugify', () => {
  it('pasa un título normal a minúsculas con guiones', () => {
    expect(slugify('Encuesta de satisfacción')).toBe('encuesta-de-satisfaccion');
  });

  it('elimina los diacríticos del español', () => {
    expect(slugify('Año nuevo, ¿qué tal?')).toBe('ano-nuevo-que-tal');
    expect(slugify('Cañón · Málaga · Ürümqi')).toBe('canon-malaga-urumqi');
  });

  it('colapsa cualquier separador en un solo guion', () => {
    expect(slugify('  hola   ---   mundo  ')).toBe('hola-mundo');
    expect(slugify('a/b\\c_d.e')).toBe('a-b-c-d-e');
  });

  it('no deja guiones en los extremos', () => {
    expect(slugify('---hola---')).toBe('hola');
    expect(slugify('¡¿Hola?!')).toBe('hola');
  });

  it('descarta emoji y alfabetos no latinos sin dejar el slug vacío', () => {
    expect(slugify('Encuesta 🎉 2026')).toBe('encuesta-2026');
    expect(slugify('日本語')).toBe(SLUG_FALLBACK);
    expect(slugify('   ')).toBe(SLUG_FALLBACK);
    expect(slugify('')).toBe(SLUG_FALLBACK);
  });

  it('respeta la longitud máxima y no termina en guion al recortar', () => {
    const largo = slugify('a'.repeat(200));
    expect(largo).toHaveLength(SLUG_MAX_LENGTH);

    const cortado = slugify(`${'a'.repeat(SLUG_MAX_LENGTH - 1)} palabra`);
    expect(cortado.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(cortado.endsWith('-')).toBe(false);
  });

  it('es idempotente sobre un slug ya canónico', () => {
    const slug = slugify('Encuesta de satisfacción');
    expect(slugify(slug)).toBe(slug);
  });
});

describe('isValidSlug', () => {
  it('acepta solo la forma canónica entre 3 y 60 caracteres no reservada', () => {
    expect(isValidSlug('encuesta-2026')).toBe(true);
    expect(isValidSlug('encuesta')).toBe(true);
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('ab')).toBe(false); // Demasiado corto (<3)
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('Encuesta')).toBe(false);
    expect(isValidSlug('-encuesta')).toBe(false);
    expect(isValidSlug('encuesta-')).toBe(false);
    expect(isValidSlug('encuesta--2026')).toBe(false);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a'.repeat(SLUG_MAX_LENGTH + 1))).toBe(false);
  });

  it('rechaza slugs reservados del sistema', () => {
    expect(isValidSlug('app')).toBe(false);
    expect(isValidSlug('api')).toBe(false);
    expect(isValidSlug('f')).toBe(false);
    expect(isValidSlug('iniciar-sesion')).toBe(false);
    expect(isValidSlug('crear-cuenta')).toBe(false);
    expect(isValidSlug('verificar-correo')).toBe(false);
  });
});

describe('resolveSlugCollision', () => {
  it('devuelve el base cuando está libre', () => {
    expect(resolveSlugCollision('encuesta', [])).toBe('encuesta');
    expect(resolveSlugCollision('encuesta', ['otra', 'encuesta-2'])).toBe('encuesta');
  });

  it('resuelve la colisión con sufijos correlativos y deterministas', () => {
    expect(resolveSlugCollision('encuesta', ['encuesta'])).toBe('encuesta-2');
    expect(resolveSlugCollision('encuesta', ['encuesta', 'encuesta-2'])).toBe('encuesta-3');
    expect(
      resolveSlugCollision('encuesta', ['encuesta', 'encuesta-2', 'encuesta-4']),
    ).toBe('encuesta-3');
  });

  it('produce el mismo resultado ante el mismo estado, sin azar', () => {
    const ocupados = ['encuesta', 'encuesta-2', 'encuesta-3'];
    const primero = resolveSlugCollision('encuesta', ocupados);
    const segundo = resolveSlugCollision('encuesta', [...ocupados].reverse());
    expect(primero).toBe(segundo);
    expect(primero).toBe('encuesta-4');
  });

  it('sanea el base si no viene canónico', () => {
    expect(resolveSlugCollision('Encuesta Anual', [])).toBe('encuesta-anual');
  });

  it('recorta el base para que quepa el sufijo sin pasarse del máximo', () => {
    const base = 'a'.repeat(SLUG_MAX_LENGTH);
    const resultado = resolveSlugCollision(base, [base]);
    expect(resultado.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(resultado.endsWith('-2')).toBe(true);
  });
});

describe('slugSearchPrefix', () => {
  it('devuelve el slug canónico por el que buscar candidatos ocupados', () => {
    expect(slugSearchPrefix('Encuesta Anual')).toBe('encuesta-anual');
    expect(slugSearchPrefix('encuesta-anual')).toBe('encuesta-anual');
  });
});
