// @vitest-environment node

/** Utilidades del cliente S3 que no necesitan red. */

import { describe, expect, it } from 'vitest';

import { crearAlmacenS3, lotesDeClaves } from '../s3';

describe('lotesDeClaves', () => {
  it('no genera ningún lote sin claves', () => {
    expect(lotesDeClaves([])).toEqual([]);
  });

  it('respeta el máximo de DeleteObjects', () => {
    const claves = Array.from({ length: 2501 }, (_, i) => `k/${i}`);
    const lotes = lotesDeClaves(claves);
    expect(lotes).toHaveLength(3);
    expect(lotes[0]).toHaveLength(1000);
    expect(lotes[2]).toHaveLength(501);
    expect(lotes.flat()).toEqual(claves);
  });
});

describe('urlPublica', () => {
  const almacen = crearAlmacenS3({
    endpoint: 'https://cuenta.r2.cloudflarestorage.com',
    region: 'auto',
    accessKeyId: 'x',
    secretAccessKey: 'y',
    bucketStaging: 'staging',
    bucketPublico: 'publico',
    baseUrlPublica: 'https://media.ejemplo.com',
    forcePathStyle: false,
  });

  it('usa el dominio público y no el endpoint S3', () => {
    // PR.md: «Las URLs temporales usarán el dominio S3 de R2; el dominio
    // personalizado se utilizará solo para lectura pública».
    const url = almacen.urlPublica('media/abc/def/original.webp');
    expect(url).toBe('https://media.ejemplo.com/media/abc/def/original.webp');
    expect(url).not.toContain('r2.cloudflarestorage.com');
  });

  it('no duplica la barra si la clave viene con una delante', () => {
    expect(almacen.urlPublica('/media/abc')).toBe('https://media.ejemplo.com/media/abc');
  });
});
