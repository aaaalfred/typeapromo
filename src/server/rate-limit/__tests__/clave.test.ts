/**
 * Control de abuso: derivación de la clave y ventana.
 *
 * Lo que se comprueba aquí es sobre todo **privacidad**: que la dirección IP no
 * aparece por ninguna parte de lo que se guarda, y que sin la sal del proceso el
 * hash no vale para nada.
 *
 * Módulo puro: no hace falta PostgreSQL.
 */

import { describe, expect, it } from 'vitest';

import {
  AMBITOS_LIMITE,
  CLIENTE_DESCONOCIDO,
  claveDeLimite,
  clienteDePeticion,
  inicioDeVentana,
} from '../clave';
import { rotarSalDeProceso, salDeProceso } from '../sal';

const IP = '203.0.113.42';
const SAL = Buffer.from('sal-de-prueba-para-los-tests-0123', 'utf8');

describe('claveDeLimite', () => {
  it('devuelve un SHA-256 hexadecimal', () => {
    const clave = claveDeLimite('sesiones', IP, SAL);
    expect(clave).toMatch(/^[0-9a-f]{64}$/);
  });

  it('no contiene la dirección IP en ninguna forma reconocible', () => {
    const clave = claveDeLimite('sesiones', IP, SAL);

    expect(clave).not.toContain(IP);
    expect(clave).not.toContain(Buffer.from(IP, 'utf8').toString('hex'));
    expect(clave).not.toContain(Buffer.from(IP, 'utf8').toString('base64url'));
  });

  it('es estable para la misma terna', () => {
    expect(claveDeLimite('sesiones', IP, SAL)).toBe(claveDeLimite('sesiones', IP, SAL));
  });

  it('separa los ámbitos: la misma IP produce cubos distintos', () => {
    const claves = AMBITOS_LIMITE.map((ambito) => claveDeLimite(ambito, IP, SAL));
    expect(new Set(claves).size).toBe(AMBITOS_LIMITE.length);
  });

  it('cambia por completo al cambiar la sal', () => {
    const otra = Buffer.from('otra-sal-distinta-para-el-proceso', 'utf8');
    expect(claveDeLimite('sesiones', IP, SAL)).not.toBe(claveDeLimite('sesiones', IP, otra));
  });

  it('no es ambiguo entre ámbito y cliente', () => {
    // Sin separador, `('a', 'bc')` y `('ab', 'c')` colisionarían.
    expect(claveDeLimite('sesiones', 'x', SAL)).not.toBe(
      claveDeLimite('sesiones', ':x', SAL),
    );
  });
});

describe('salDeProceso', () => {
  it('es estable dentro del proceso y de 32 bytes', () => {
    const primera = salDeProceso();
    expect(primera).toHaveLength(32);
    expect(salDeProceso().equals(primera)).toBe(true);
  });

  it('al rotar deja de producir las claves anteriores', () => {
    const antes = claveDeLimite('sesiones', IP, salDeProceso());
    rotarSalDeProceso();
    expect(claveDeLimite('sesiones', IP, salDeProceso())).not.toBe(antes);
  });
});

describe('inicioDeVentana', () => {
  const VENTANA = 60_000;

  it('trunca al tamaño de ventana', () => {
    const momento = new Date('2026-08-17T10:00:37.500Z');
    expect(inicioDeVentana(momento, VENTANA).toISOString()).toBe('2026-08-17T10:00:00.000Z');
  });

  it('dos momentos de la misma ventana comparten inicio', () => {
    const a = inicioDeVentana(new Date('2026-08-17T10:00:01Z'), VENTANA);
    const b = inicioDeVentana(new Date('2026-08-17T10:00:59Z'), VENTANA);
    expect(a.getTime()).toBe(b.getTime());
  });

  it('el segundo siguiente cae ya en la ventana nueva', () => {
    const a = inicioDeVentana(new Date('2026-08-17T10:00:59Z'), VENTANA);
    const b = inicioDeVentana(new Date('2026-08-17T10:01:00Z'), VENTANA);
    expect(b.getTime() - a.getTime()).toBe(VENTANA);
  });
});

describe('clienteDePeticion', () => {
  it('usa la primera entrada de x-forwarded-for', () => {
    const cabeceras = new Headers({ 'x-forwarded-for': `${IP}, 198.51.100.7, 10.0.0.1` });
    expect(clienteDePeticion(cabeceras)).toBe(IP);
  });

  it('cae a x-real-ip cuando no hay cabecera de proxy', () => {
    expect(clienteDePeticion(new Headers({ 'x-real-ip': IP }))).toBe(IP);
  });

  it('devuelve el marcador anónimo cuando no hay nada que mirar', () => {
    expect(clienteDePeticion(new Headers())).toBe(CLIENTE_DESCONOCIDO);
  });

  it('ignora una cabecera vacía en lugar de usarla como cliente', () => {
    expect(clienteDePeticion(new Headers({ 'x-forwarded-for': '   ' }))).toBe(
      CLIENTE_DESCONOCIDO,
    );
  });
});
