// @vitest-environment node

/**
 * Autenticación de la limpieza. Lo que se comprueba aquí es sobre todo lo que
 * **no** debe funcionar: la query string.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CABECERA_CLEANUP, autorizarLimpieza, comparaSecreto, leerSecretoDeCabeceras } from '../secreto';

const SECRETO = 'secreto-de-limpieza-muy-largo';
const original = process.env.CLEANUP_SECRET;

beforeEach(() => {
  process.env.CLEANUP_SECRET = SECRETO;
});

afterEach(() => {
  if (original === undefined) delete process.env.CLEANUP_SECRET;
  else process.env.CLEANUP_SECRET = original;
});

function cabeceras(entradas: Record<string, string>): Headers {
  return new Headers(entradas);
}

describe('autorizarLimpieza', () => {
  it('acepta el secreto en su cabecera', () => {
    expect(autorizarLimpieza(cabeceras({ [CABECERA_CLEANUP]: SECRETO }))).toEqual({
      autorizado: true,
    });
  });

  it('acepta también Authorization: Bearer', () => {
    expect(
      autorizarLimpieza(cabeceras({ authorization: `Bearer ${SECRETO}` })),
    ).toEqual({ autorizado: true });
  });

  it('rechaza cuando no viene ninguna cabecera', () => {
    expect(autorizarLimpieza(cabeceras({}))).toEqual({
      autorizado: false,
      motivo: 'ausente',
    });
  });

  it('rechaza un secreto incorrecto', () => {
    expect(
      autorizarLimpieza(cabeceras({ [CABECERA_CLEANUP]: 'otra-cosa' })),
    ).toEqual({ autorizado: false, motivo: 'incorrecto' });
  });

  it('falla cerrado si el servidor no tiene CLEANUP_SECRET', () => {
    delete process.env.CLEANUP_SECRET;
    expect(autorizarLimpieza(cabeceras({ [CABECERA_CLEANUP]: SECRETO }))).toEqual({
      autorizado: false,
      motivo: 'no-configurado',
    });
  });

  it('falla cerrado también con el secreto vacío o en blanco', () => {
    process.env.CLEANUP_SECRET = '   ';
    expect(autorizarLimpieza(cabeceras({ [CABECERA_CLEANUP]: '   ' })).autorizado).toBe(
      false,
    );
  });
});

describe('leerSecretoDeCabeceras · nunca la query string', () => {
  it('no hay ninguna vía por la que la URL alimente la comprobación', () => {
    // La función solo recibe `Headers`: no tiene forma de mirar la URL ni
    // aunque quisiera. Este test fija esa firma.
    const url = new URL('http://localhost/api/internal/cleanup?secret=' + SECRETO);
    expect(url.searchParams.get('secret')).toBe(SECRETO);
    expect(leerSecretoDeCabeceras(cabeceras({}))).toBeNull();
    expect(autorizarLimpieza(cabeceras({})).autorizado).toBe(false);
  });

  it('recorta espacios alrededor del valor', () => {
    expect(leerSecretoDeCabeceras(cabeceras({ [CABECERA_CLEANUP]: `  ${SECRETO}  ` }))).toBe(
      SECRETO,
    );
  });

  it('la cabecera propia gana sobre Authorization', () => {
    const headers = cabeceras({
      [CABECERA_CLEANUP]: SECRETO,
      authorization: 'Bearer otro',
    });
    expect(leerSecretoDeCabeceras(headers)).toBe(SECRETO);
  });
});

describe('comparaSecreto', () => {
  it('no lanza con longitudes distintas (timingSafeEqual sí lo haría)', () => {
    expect(() => comparaSecreto('a', 'secreto-muy-largo')).not.toThrow();
    expect(comparaSecreto('a', 'secreto-muy-largo')).toBe(false);
  });

  it('es exacta, sin normalizar mayúsculas', () => {
    expect(comparaSecreto(SECRETO, SECRETO)).toBe(true);
    expect(comparaSecreto(SECRETO.toUpperCase(), SECRETO)).toBe(false);
  });
});
