import { describe, expect, it } from 'vitest';
import {
  CADUCIDAD_RESTABLECIMIENTO_MS,
  CADUCIDAD_VERIFICACION_MS,
  generarTokenAleatorio,
  hashearToken,
} from '../tokens';

describe('tokens (puro)', () => {
  it('las duraciones de caducidad son 24h y 1h respectivamente', () => {
    expect(CADUCIDAD_VERIFICACION_MS).toBe(24 * 60 * 60 * 1000);
    expect(CADUCIDAD_RESTABLECIMIENTO_MS).toBe(60 * 60 * 1000);
  });

  it('generarTokenAleatorio produce cadenas de 64 caracteres hexadecimales distintas', () => {
    const t1 = generarTokenAleatorio();
    const t2 = generarTokenAleatorio();

    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(t2).toMatch(/^[0-9a-f]{64}$/);
    expect(t1).not.toBe(t2);
  });

  it('hashearToken es determinista y produce sha256', () => {
    const token = 'tokenDePrueba123456';
    const hash1 = hashearToken(token);
    const hash2 = hashearToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash1).not.toBe(token);
  });
});
