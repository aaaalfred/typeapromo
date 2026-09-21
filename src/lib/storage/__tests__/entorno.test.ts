// @vitest-environment node

/**
 * Configuración del almacén. Lo importante aquí es `forcePathStyle`: es el único
 * conmutador entre MinIO y R2 (PLAN.md · §2.10) y equivocarlo produce un fallo
 * confuso —firmas correctas contra un host que no existe— en vez de un error
 * claro.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  hayConfiguracionDeAlmacen,
  interpretarForcePathStyle,
  leerConfiguracion,
  normalizarBaseUrl,
  variablesDeAlmacenAusentes,
} from '../entorno';

const CLAVES = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_STAGING',
  'R2_BUCKET_PUBLIC',
  'MEDIA_PUBLIC_BASE_URL',
  'S3_FORCE_PATH_STYLE',
  'R2_REGION',
] as const;

const original = new Map<string, string | undefined>();

beforeEach(() => {
  for (const clave of CLAVES) {
    original.set(clave, process.env[clave]);
    delete process.env[clave];
  }
});

afterEach(() => {
  for (const [clave, valor] of original) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
  original.clear();
});

function configurarMinio(): void {
  process.env.R2_ENDPOINT = 'http://localhost:9000';
  process.env.R2_ACCESS_KEY_ID = 'minioadmin';
  process.env.R2_SECRET_ACCESS_KEY = 'minioadmin';
  process.env.R2_BUCKET_STAGING = 'forms-media-staging';
  process.env.R2_BUCKET_PUBLIC = 'forms-media-public';
  process.env.MEDIA_PUBLIC_BASE_URL = 'http://localhost:9000/forms-media-public/';
  process.env.S3_FORCE_PATH_STYLE = '1';
}

describe('interpretarForcePathStyle', () => {
  it('solo `1` y `true` activan el estilo de MinIO', () => {
    expect(interpretarForcePathStyle('1')).toBe(true);
    expect(interpretarForcePathStyle('true')).toBe(true);
    expect(interpretarForcePathStyle('TRUE')).toBe(true);
    expect(interpretarForcePathStyle(' 1 ')).toBe(true);
  });

  it('cualquier otra cosa deja el estilo de R2 (bucket en el host)', () => {
    expect(interpretarForcePathStyle('0')).toBe(false);
    expect(interpretarForcePathStyle('false')).toBe(false);
    expect(interpretarForcePathStyle('')).toBe(false);
    expect(interpretarForcePathStyle(undefined)).toBe(false);
    expect(interpretarForcePathStyle('sí')).toBe(false);
  });
});

describe('normalizarBaseUrl', () => {
  it('quita las barras finales para poder concatenar claves', () => {
    expect(normalizarBaseUrl('https://media.ejemplo.com/')).toBe('https://media.ejemplo.com');
    expect(normalizarBaseUrl('https://media.ejemplo.com///')).toBe(
      'https://media.ejemplo.com',
    );
    expect(normalizarBaseUrl('https://media.ejemplo.com')).toBe('https://media.ejemplo.com');
  });
});

describe('leerConfiguracion', () => {
  it('falla cerrado y dice qué falta', () => {
    expect(hayConfiguracionDeAlmacen()).toBe(false);
    expect(variablesDeAlmacenAusentes()).toContain('R2_ENDPOINT');
    expect(() => leerConfiguracion()).toThrow(/R2_ENDPOINT/);
  });

  it('enumera todas las que faltan, no solo la primera', () => {
    process.env.R2_ENDPOINT = 'http://localhost:9000';
    const ausentes = variablesDeAlmacenAusentes();
    expect(ausentes).not.toContain('R2_ENDPOINT');
    expect(ausentes).toContain('R2_ACCESS_KEY_ID');
    expect(ausentes).toContain('MEDIA_PUBLIC_BASE_URL');
  });

  it('trata una variable en blanco como ausente', () => {
    configurarMinio();
    process.env.R2_SECRET_ACCESS_KEY = '   ';
    expect(variablesDeAlmacenAusentes()).toEqual(['R2_SECRET_ACCESS_KEY']);
  });

  it('lee la configuración completa de MinIO', () => {
    configurarMinio();
    expect(hayConfiguracionDeAlmacen()).toBe(true);
    expect(leerConfiguracion()).toEqual({
      endpoint: 'http://localhost:9000',
      region: 'auto',
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin',
      bucketStaging: 'forms-media-staging',
      bucketPublico: 'forms-media-public',
      baseUrlPublica: 'http://localhost:9000/forms-media-public',
      forcePathStyle: true,
    });
  });

  it('sin S3_FORCE_PATH_STYLE queda la configuración de R2', () => {
    configurarMinio();
    delete process.env.S3_FORCE_PATH_STYLE;
    expect(leerConfiguracion().forcePathStyle).toBe(false);
  });
});
