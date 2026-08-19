/**
 * Abandono derivado (PLAN.md · §2.9).
 *
 * Módulo puro: no hace falta PostgreSQL. Lo que se fija aquí es que el abandono
 * es una **consulta y no un estado**, con la consecuencia que eso tiene: una
 * sesión puede dejar de estar abandonada si su autor vuelve.
 */

import { describe, expect, it } from 'vitest';

import { MINUTOS_PARA_ABANDONO, estaAbandonada, limiteDeAbandono } from '../abandono';

const AHORA = new Date('2026-08-17T12:00:00.000Z');
const MINUTO = 60_000;

function haceMinutos(minutos: number): Date {
  return new Date(AHORA.getTime() - minutos * MINUTO);
}

describe('limiteDeAbandono', () => {
  it('son 30 minutos antes del momento dado', () => {
    expect(MINUTOS_PARA_ABANDONO).toBe(30);
    expect(limiteDeAbandono(AHORA).toISOString()).toBe('2026-08-17T11:30:00.000Z');
  });
});

describe('estaAbandonada', () => {
  it('una sesión completada nunca lo está, por vieja que sea', () => {
    expect(
      estaAbandonada(
        { completedAt: haceMinutos(600), lastActivityAt: haceMinutos(600) },
        AHORA,
      ),
    ).toBe(false);
  });

  it('sin completar y con más de 30 minutos de inactividad, sí', () => {
    expect(
      estaAbandonada({ completedAt: null, lastActivityAt: haceMinutos(31) }, AHORA),
    ).toBe(true);
  });

  it('sin completar pero activa hace menos de 30 minutos, no', () => {
    expect(
      estaAbandonada({ completedAt: null, lastActivityAt: haceMinutos(29) }, AHORA),
    ).toBe(false);
  });

  it('justo en el límite todavía no cuenta como abandono', () => {
    expect(
      estaAbandonada({ completedAt: null, lastActivityAt: haceMinutos(30) }, AHORA),
    ).toBe(false);
  });

  it('deja de estarlo si su autor vuelve: es una consulta, no un estado', () => {
    const abandonada = { completedAt: null, lastActivityAt: haceMinutos(120) };
    expect(estaAbandonada(abandonada, AHORA)).toBe(true);

    const retomada = { completedAt: null, lastActivityAt: AHORA };
    expect(estaAbandonada(retomada, AHORA)).toBe(false);
  });
});
