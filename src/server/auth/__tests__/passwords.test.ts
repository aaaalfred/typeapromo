import { describe, expect, it } from 'vitest';
import { hashearPassword, LONGITUD_MINIMA_PASSWORD, verificarPassword } from '../passwords';

describe('passwords (Argon2id)', () => {
  it('la longitud mínima es al menos 10 caracteres', () => {
    expect(LONGITUD_MINIMA_PASSWORD).toBe(10);
  });

  it('genera un hash Argon2id válido y lo verifica correctamente', async () => {
    const password = 'passwordSegura123!';
    const hashGenerado = await hashearPassword(password);

    expect(hashGenerado).toMatch(/^\$argon2id\$/);

    const valida = await verificarPassword(hashGenerado, password);
    expect(valida).toBe(true);

    const invalida = await verificarPassword(hashGenerado, 'otraPasswordDistinta');
    expect(invalida).toBe(false);
  });

  it('dos hashes de la misma contraseña tienen sales distintas y ambos verifican', async () => {
    const password = 'mismaPassword123';
    const hash1 = await hashearPassword(password);
    const hash2 = await hashearPassword(password);

    expect(hash1).not.toBe(hash2);
    expect(await verificarPassword(hash1, password)).toBe(true);
    expect(await verificarPassword(hash2, password)).toBe(true);
  });

  it('verificarPassword devuelve false si el hash está corrupto', async () => {
    const resultado = await verificarPassword('hash_totalmente_invalido', 'password');
    expect(resultado).toBe(false);
  });
});
