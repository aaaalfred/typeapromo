import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME, THEME_FONTS, type ThemeDefinition } from '@/lib/forms';

import { CATALOGO_DE_FUENTES, PILAS_DE_FUENTE, pilaDeFuente } from '../fuentes';
import { RADIOS_DE_BORDE, atributosDeTema, estiloDeTema, urlCssSegura, variablesDeTema } from '../tokens';

describe('catálogo de fuentes', () => {
  it('cubre exactamente el catálogo del contrato', () => {
    expect(Object.keys(PILAS_DE_FUENTE).sort()).toEqual([...THEME_FONTS].sort());
    expect(CATALOGO_DE_FUENTES).toHaveLength(THEME_FONTS.length);
  });

  it('toda pila termina en una familia genérica', () => {
    for (const pila of Object.values(PILAS_DE_FUENTE)) {
      expect(pila).toMatch(/(sans-serif|serif|monospace)$/);
    }
  });

  it('una fuente desconocida cae en la del sistema en vez de romper', () => {
    expect(pilaDeFuente('helvetica-fantasma')).toBe(PILAS_DE_FUENTE.system);
  });
});

describe('variablesDeTema', () => {
  it('copia los seis colores del contrato tal cual', () => {
    const variables = variablesDeTema(DEFAULT_THEME);
    expect(variables['--tp-fondo']).toBe(DEFAULT_THEME.colors.background);
    expect(variables['--tp-texto']).toBe(DEFAULT_THEME.colors.text);
    expect(variables['--tp-controles']).toBe(DEFAULT_THEME.colors.controls);
    expect(variables['--tp-boton']).toBe(DEFAULT_THEME.colors.buttons);
    expect(variables['--tp-boton-texto']).toBe(DEFAULT_THEME.colors.buttonText);
    expect(variables['--tp-acento']).toBe(DEFAULT_THEME.colors.accent);
  });

  it('deriva el resto de colores del tema y no de constantes propias', () => {
    const variables = variablesDeTema(DEFAULT_THEME);
    for (const clave of ['--tp-texto-suave', '--tp-control-fondo', '--tp-acento-suave'] as const) {
      expect(variables[clave]).toContain('var(--tp-');
    }
  });

  it('traduce el radio de bordes del contrato', () => {
    for (const radio of ['none', 'sm', 'md', 'lg', 'full'] as const) {
      const tema: ThemeDefinition = { ...DEFAULT_THEME, borderRadius: radio };
      expect(variablesDeTema(tema)['--tp-radio']).toBe(RADIOS_DE_BORDE[radio]);
    }
  });

  it('sin imagen de fondo la variable vale `none`', () => {
    expect(variablesDeTema(DEFAULT_THEME)['--tp-imagen-fondo']).toBe('none');
  });
});

describe('urlCssSegura', () => {
  it('acepta http(s) y rutas absolutas', () => {
    expect(urlCssSegura('https://medios.test/a.webp')).toBe('url("https://medios.test/a.webp")');
    expect(urlCssSegura('/local/a.webp')).toBe('url("/local/a.webp")');
  });

  it('rechaza cualquier cosa que pudiera cerrar la declaración', () => {
    expect(urlCssSegura('https://x.test/a.webp");background:url(evil')).toBeNull();
    expect(urlCssSegura("https://x.test/a'.webp")).toBeNull();
    expect(urlCssSegura('javascript:alert(1)')).toBeNull();
    expect(urlCssSegura('')).toBeNull();
    expect(urlCssSegura(null)).toBeNull();
  });
});

describe('estiloDeTema', () => {
  it('incluye las variables y las propiedades heredables', () => {
    const estilo = estiloDeTema(DEFAULT_THEME, { urlImagenFondo: 'https://medios.test/f.webp' });
    expect(estilo['--tp-imagen-fondo']).toBe('url("https://medios.test/f.webp")');
    expect(estilo.backgroundColor).toBe('var(--tp-fondo)');
    expect(estilo.color).toBe('var(--tp-texto)');
    expect(estilo.fontFamily).toBe('var(--tp-fuente)');
    expect(estilo.textAlign).toBe(DEFAULT_THEME.contentAlignment);
  });
});

describe('atributosDeTema', () => {
  it('publica las variantes no cromáticas como `data-*`', () => {
    const tema: ThemeDefinition = {
      ...DEFAULT_THEME,
      buttonStyle: 'pill',
      contentAlignment: 'center',
      borderRadius: 'full',
    };
    expect(atributosDeTema(tema)).toMatchObject({
      'data-tema-boton': 'pill',
      'data-tema-alineacion': 'center',
      'data-tema-radio': 'full',
      'data-tema-fuente': tema.typography.fontFamily,
    });
  });
});
