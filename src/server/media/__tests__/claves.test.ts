// @vitest-environment node

/**
 * Construcción de claves: impredecibles en staging, inmutables en el bucket
 * público, y nunca derivadas del nombre del archivo.
 */

import { describe, expect, it } from 'vitest';

import {
  ANCHOS_VARIANTE,
  claveDeStaging,
  claveDeVariante,
  claveOriginalPublica,
  clavesPublicas,
  etiquetaDeVariante,
  prefijoPublico,
} from '../claves';

const ID = '3f2b7c1a-9d84-4f6e-8a21-6b0c5d4e7f90';
const HASH = 'a'.repeat(48) + 'b'.repeat(16);

describe('claves de staging', () => {
  it('cuelgan del prefijo privado y llevan el identificador del activo', () => {
    const clave = claveDeStaging(ID, 'deadbeef');
    expect(clave).toBe(`staging/${ID}/deadbeef`);
  });

  it('el sufijo aleatorio cambia en cada llamada', () => {
    const primera = claveDeStaging(ID);
    const segunda = claveDeStaging(ID);
    expect(primera).not.toBe(segunda);
    expect(primera.startsWith(`staging/${ID}/`)).toBe(true);
  });
});

describe('claves públicas', () => {
  it('combinan UUID y prefijo del hash', () => {
    expect(prefijoPublico(ID, HASH)).toBe(`media/${ID}/${HASH.slice(0, 16)}`);
  });

  it('el original y las variantes cuelgan del mismo prefijo', () => {
    const original = claveOriginalPublica(ID, HASH);
    expect(original).toBe(`media/${ID}/${HASH.slice(0, 16)}/original.webp`);
    for (const ancho of ANCHOS_VARIANTE) {
      expect(claveDeVariante(ID, HASH, ancho)).toBe(
        `media/${ID}/${HASH.slice(0, 16)}/w${ancho}.webp`,
      );
    }
  });

  it('las variantes son las dos que exige PR.md', () => {
    expect([...ANCHOS_VARIANTE]).toEqual([640, 1920]);
    expect(etiquetaDeVariante(640)).toBe('w640');
    expect(etiquetaDeVariante(1920)).toBe('w1920');
  });

  it('otro contenido produce otra clave: por eso se pueden servir inmutables', () => {
    const otroHash = 'c'.repeat(64);
    expect(claveOriginalPublica(ID, HASH)).not.toBe(claveOriginalPublica(ID, otroHash));
  });

  it('el mismo contenido en otro activo tampoco comparte clave', () => {
    const otroId = '11111111-2222-4333-8444-555555555555';
    expect(claveOriginalPublica(ID, HASH)).not.toBe(claveOriginalPublica(otroId, HASH));
  });

  it('clavesPublicas devuelve todo lo que hay que borrar', () => {
    const claves = clavesPublicas(ID, HASH);
    expect(claves).toHaveLength(1 + ANCHOS_VARIANTE.length);
    expect(new Set(claves).size).toBe(claves.length);
    expect(claves).toContain(claveOriginalPublica(ID, HASH));
  });

  it('ninguna clave contiene el nombre original ni caracteres de ruta peligrosos', () => {
    for (const clave of clavesPublicas(ID, HASH)) {
      expect(clave).not.toContain('..');
      expect(clave).toMatch(/^[a-z0-9/.-]+$/);
    }
  });
});
