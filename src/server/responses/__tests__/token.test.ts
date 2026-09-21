/**
 * Token de reanudación. Módulo puro: no hace falta PostgreSQL.
 *
 * El test que importa de verdad —que el token en claro no aparece en la base de
 * datos— vive en `sesiones.integration.test.ts`. Aquí se fija lo que hace
 * posible aquello: que el hash no se puede revertir por inspección y que una
 * cookie manipulada se descarta antes de llegar a una consulta.
 */

import { describe, expect, it } from 'vitest';

import {
  LONGITUD_TOKEN,
  crearToken,
  hashDeToken,
  hashesIguales,
  pareceToken,
} from '../token';

describe('crearToken', () => {
  it('devuelve un valor base64url de longitud fija', () => {
    const token = crearToken();
    expect(token).toHaveLength(LONGITUD_TOKEN);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('no repite valores', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => crearToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('hashDeToken', () => {
  it('es un SHA-256 hexadecimal', () => {
    expect(hashDeToken(crearToken())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('no contiene el token ni ninguna codificación evidente suya', () => {
    const token = crearToken();
    const hash = hashDeToken(token);

    expect(hash).not.toContain(token);
    expect(hash).not.toContain(Buffer.from(token, 'utf8').toString('hex'));
    expect(hash).not.toContain(Buffer.from(token, 'base64url').toString('hex'));
  });

  it('es determinista y distinto para tokens distintos', () => {
    const token = crearToken();
    expect(hashDeToken(token)).toBe(hashDeToken(token));
    expect(hashDeToken(token)).not.toBe(hashDeToken(crearToken()));
  });
});

describe('pareceToken', () => {
  it('acepta un token recién creado', () => {
    expect(pareceToken(crearToken())).toBe(true);
  });

  it('rechaza basura sin llegar a hashearla', () => {
    for (const valor of [
      undefined,
      null,
      '',
      42,
      'corto',
      `${'a'.repeat(LONGITUD_TOKEN - 1)}=`,
      `${'a'.repeat(LONGITUD_TOKEN - 1)}/`,
      'a'.repeat(LONGITUD_TOKEN + 1),
      "'; drop table response_sessions; --",
    ]) {
      expect(pareceToken(valor)).toBe(false);
    }
  });
});

describe('hashesIguales', () => {
  it('reconoce dos hashes del mismo token', () => {
    const token = crearToken();
    expect(hashesIguales(hashDeToken(token), hashDeToken(token))).toBe(true);
  });

  it('distingue hashes distintos y longitudes distintas', () => {
    expect(hashesIguales(hashDeToken(crearToken()), hashDeToken(crearToken()))).toBe(false);
    expect(hashesIguales('abc', 'abcd')).toBe(false);
  });
});
