import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  credencialesSlack,
  esBypassActivo,
  esSlackConfigurado,
  modoAuth,
  teamIdAutorizado,
} from '../entorno';

const VARIABLES = [
  'AUTH_DEV_BYPASS',
  'DATABASE_URL',
  'SLACK_TEAM_ID',
  'SLACK_CLIENT_ID',
  'SLACK_CLIENT_SECRET',
] as const;

let copia: Record<string, string | undefined> = {};

beforeEach(() => {
  copia = {};
  for (const nombre of VARIABLES) {
    copia[nombre] = process.env[nombre];
    delete process.env[nombre];
  }
});

afterEach(() => {
  for (const nombre of VARIABLES) {
    const valor = copia[nombre];
    if (valor === undefined) {
      delete process.env[nombre];
    } else {
      process.env[nombre] = valor;
    }
  }
});

describe('esBypassActivo', () => {
  it('solo se activa con el valor exacto "1"', () => {
    expect(esBypassActivo()).toBe(false);

    for (const valor of ['0', 'true', 'sí', 'yes', '', ' 1 ', '11']) {
      process.env.AUTH_DEV_BYPASS = valor;
      expect(esBypassActivo()).toBe(false);
    }

    process.env.AUTH_DEV_BYPASS = '1';
    expect(esBypassActivo()).toBe(true);
  });
});

describe('modoAuth', () => {
  it('refleja el modo email si hay base de datos, dev-bypass si está activo o no-configurado si falta todo', () => {
    expect(modoAuth()).toBe('no-configurado');

    process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
    expect(modoAuth()).toBe('email');

    process.env.AUTH_DEV_BYPASS = '1';
    expect(modoAuth()).toBe('dev-bypass');
  });
});

describe('teamIdAutorizado', () => {
  it('es null si falta o está en blanco', () => {
    expect(teamIdAutorizado()).toBeNull();
    process.env.SLACK_TEAM_ID = '   ';
    expect(teamIdAutorizado()).toBeNull();
  });

  it('recorta los espacios del valor configurado', () => {
    process.env.SLACK_TEAM_ID = '  T0123ABCDEF  ';
    expect(teamIdAutorizado()).toBe('T0123ABCDEF');
  });
});

describe('credencialesSlack', () => {
  it('exige las dos variables para registrar el provider', () => {
    expect(credencialesSlack()).toBeNull();
    expect(esSlackConfigurado()).toBe(false);

    process.env.SLACK_CLIENT_ID = 'id';
    expect(credencialesSlack()).toBeNull();

    process.env.SLACK_CLIENT_SECRET = '   ';
    expect(credencialesSlack()).toBeNull();

    process.env.SLACK_CLIENT_SECRET = 'secreto';
    expect(credencialesSlack()).toEqual({ clientId: 'id', clientSecret: 'secreto' });
    expect(esSlackConfigurado()).toBe(true);
  });
});
