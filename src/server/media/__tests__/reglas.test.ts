// @vitest-environment node

/**
 * Validación de entrada: firma binaria, tamaño y dimensiones.
 *
 * Es la parte del pipeline que decide si unos bytes entran, y toda ella es pura,
 * así que se puede probar sin MinIO, sin PostgreSQL y sin Sharp.
 */

import { describe, expect, it } from 'vitest';

import {
  DIMENSION_MAXIMA,
  PIXELES_MAXIMOS,
  TAMANO_MAXIMO_BYTES,
  detectarFormato,
  esMimeAdmitido,
  leerDimensiones,
  motivoDeRechazo,
  validarDimensiones,
  validarTamano,
} from '../reglas';

import {
  avifFalso,
  gifFalso,
  jpegFalso,
  pdfFalso,
  pngFalso,
  svgConPreambuloFalso,
  svgFalso,
  webpExtendidoFalso,
  webpLosslessFalso,
  webpLossyFalso,
} from './fixtures';

describe('detectarFormato · el MIME lo deciden los bytes', () => {
  it('reconoce los tres formatos admitidos', () => {
    expect(detectarFormato(jpegFalso(100, 50))).toBe('image/jpeg');
    expect(detectarFormato(pngFalso(100, 50))).toBe('image/png');
    expect(detectarFormato(webpLossyFalso(100, 50))).toBe('image/webp');
    expect(detectarFormato(webpLosslessFalso(100, 50))).toBe('image/webp');
    expect(detectarFormato(webpExtendidoFalso(100, 50))).toBe('image/webp');
  });

  it('rechaza SVG, incluso con BOM, declaración XML y comentario delante', () => {
    expect(detectarFormato(svgFalso())).toBe('image/svg+xml');
    expect(detectarFormato(svgConPreambuloFalso())).toBe('image/svg+xml');
    expect(esMimeAdmitido('image/svg+xml')).toBe(false);
    expect(motivoDeRechazo('image/svg+xml')).toMatch(/SVG/);
    expect(motivoDeRechazo('image/svg+xml')).toMatch(/scripts/);
  });

  it('rechaza GIF', () => {
    expect(detectarFormato(gifFalso())).toBe('image/gif');
    expect(esMimeAdmitido('image/gif')).toBe(false);
    expect(motivoDeRechazo('image/gif')).toMatch(/GIF/);
  });

  it('reconoce otros formatos no admitidos en vez de darlos por desconocidos', () => {
    expect(detectarFormato(avifFalso())).toBe('image/avif');
    expect(detectarFormato(pdfFalso())).toBe('application/pdf');
    expect(esMimeAdmitido('image/avif')).toBe(false);
    expect(esMimeAdmitido('application/pdf')).toBe(false);
  });

  it('no confunde con SVG unos bytes binarios cualesquiera', () => {
    const ruido = Buffer.from([0x00, 0x3c, 0x73, 0x76, 0x67, 0x00, 0xff, 0xfe]);
    expect(detectarFormato(ruido)).toBe('desconocido');
  });

  it('ignora el MIME declarado: un PNG que dice ser JPEG se detecta como PNG', () => {
    // Es el caso que hace inútil confiar en `Content-Type`: quien sube el
    // archivo controla esa cabecera por completo.
    const declarado = 'image/jpeg';
    const real = detectarFormato(pngFalso(10, 10));
    expect(real).toBe('image/png');
    expect(real).not.toBe(declarado);
  });

  it('un búfer vacío o truncado es desconocido, no una excepción', () => {
    expect(detectarFormato(Buffer.alloc(0))).toBe('desconocido');
    expect(detectarFormato(Buffer.from([0xff]))).toBe('desconocido');
    expect(detectarFormato(Buffer.from([0xff, 0xd8]))).toBe('desconocido');
  });
});

describe('leerDimensiones · cabecera, sin decodificar', () => {
  it('lee el SOF0 de un JPEG', () => {
    expect(leerDimensiones(jpegFalso(1920, 1080), 'image/jpeg')).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('lee el IHDR de un PNG', () => {
    expect(leerDimensiones(pngFalso(640, 480), 'image/png')).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('lee las tres variantes de contenedor WebP', () => {
    expect(leerDimensiones(webpLossyFalso(800, 600), 'image/webp')).toEqual({
      width: 800,
      height: 600,
    });
    expect(leerDimensiones(webpLosslessFalso(800, 600), 'image/webp')).toEqual({
      width: 800,
      height: 600,
    });
    expect(leerDimensiones(webpExtendidoFalso(800, 600), 'image/webp')).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('devuelve null cuando la cabecera no está completa', () => {
    expect(leerDimensiones(pngFalso(10, 10).subarray(0, 20), 'image/png')).toBeNull();
    expect(leerDimensiones(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg')).toBeNull();
  });

  it('no se queda colgado con basura que empieza como un JPEG', () => {
    const basura = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.alloc(4096, 0xff),
    ]);
    expect(leerDimensiones(basura, 'image/jpeg')).toBeNull();
  });
});

describe('validarDimensiones · defensa contra decompression bombs', () => {
  it('acepta una imagen normal', () => {
    const resultado = validarDimensiones({ width: 4000, height: 3000 });
    expect(resultado).toEqual({ valido: true, dimensiones: { width: 4000, height: 3000 } });
  });

  it('rechaza por lado máximo antes de decodificar', () => {
    // 60 000 × 100 px: caben en pocos KB comprimidos y en 24 GB descomprimidos.
    const bomba = leerDimensiones(pngFalso(60_000, 100), 'image/png');
    const resultado = validarDimensiones(bomba);
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.motivo).toContain(String(DIMENSION_MAXIMA));
    }
  });

  it('rechaza por total de píxeles aunque ningún lado pase del máximo', () => {
    const resultado = validarDimensiones({ width: 11_000, height: 11_000 });
    expect(11_000).toBeLessThanOrEqual(DIMENSION_MAXIMA);
    expect(11_000 * 11_000).toBeGreaterThan(PIXELES_MAXIMOS);
    expect(resultado.valido).toBe(false);
  });

  it('rechaza dimensiones ausentes o imposibles', () => {
    expect(validarDimensiones(null).valido).toBe(false);
    expect(validarDimensiones({ width: 0, height: 10 }).valido).toBe(false);
    expect(validarDimensiones({ width: 10, height: -1 }).valido).toBe(false);
    expect(validarDimensiones({ width: 10.5, height: 10 }).valido).toBe(false);
  });
});

describe('validarTamano · máximo de 8 MB', () => {
  it('el máximo es exactamente 8 MiB', () => {
    expect(TAMANO_MAXIMO_BYTES).toBe(8 * 1024 * 1024);
  });

  it('acepta justo el límite y rechaza un byte más', () => {
    expect(validarTamano(TAMANO_MAXIMO_BYTES).valido).toBe(true);
    expect(validarTamano(TAMANO_MAXIMO_BYTES + 1).valido).toBe(false);
  });

  it('rechaza el archivo vacío', () => {
    expect(validarTamano(0).valido).toBe(false);
    expect(validarTamano(-1).valido).toBe(false);
  });

  it('el mensaje de rechazo dice el tamaño en MB', () => {
    const resultado = validarTamano(12 * 1024 * 1024);
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.motivo).toContain('12.0 MB');
      expect(resultado.motivo).toContain('8.0 MB');
    }
  });
});
