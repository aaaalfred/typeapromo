/**
 * Aplicación de los tokens del tema.
 *
 * Lo que se comprueba es que **todo el aspecto entra por el mismo sitio**: el
 * elemento raíz. Si un componente empezara a decidir colores por su cuenta,
 * estos tests seguirían pasando pero el tema dejaría de mandar, así que se
 * comprueba también que ningún color literal se escapa al DOM.
 */

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME, type ThemeDefinition } from '@/lib/forms';
import { PILAS_DE_FUENTE, RADIOS_DE_BORDE } from '@/lib/theme';

import type { ResolverMedia } from '../medios';

import { conBloque, pintar } from './utiles';

const TEMA: ThemeDefinition = {
  colors: {
    background: '#0b1020',
    text: '#f5f7ff',
    controls: '#3a4468',
    buttons: '#ffd166',
    buttonText: '#101425',
    accent: '#4cc9f0',
  },
  typography: { fontFamily: 'lora', baseSize: 20, headingScale: 1.5 },
  borderRadius: 'full',
  buttonStyle: 'pill',
  contentAlignment: 'center',
  backgroundOverlayOpacity: 0.4,
  logoAssetId: 'logo-1',
  backgroundImageAssetId: 'fondo-1',
};

const RESOLUTOR: ResolverMedia = (assetId) => ({
  url: `https://medios.test/${assetId}.webp`,
  alt: assetId === 'logo-1' ? 'Marca' : '',
});

function raiz(container: HTMLElement): HTMLElement {
  const elemento = container.querySelector<HTMLElement>('[data-renderizador="formulario"]');
  if (elemento === null) throw new Error('No se ha pintado el renderer');
  return elemento;
}

describe('tokens de color', () => {
  it('los seis colores del tema llegan al elemento raíz como variables CSS', () => {
    const { container } = pintar(
      conBloque({ id: 'b1', type: 'short_text', title: 'Hola' }, { theme: TEMA }),
    );
    const estilo = raiz(container).style;

    expect(estilo.getPropertyValue('--tp-fondo')).toBe('#0b1020');
    expect(estilo.getPropertyValue('--tp-texto')).toBe('#f5f7ff');
    expect(estilo.getPropertyValue('--tp-controles')).toBe('#3a4468');
    expect(estilo.getPropertyValue('--tp-boton')).toBe('#ffd166');
    expect(estilo.getPropertyValue('--tp-boton-texto')).toBe('#101425');
    expect(estilo.getPropertyValue('--tp-acento')).toBe('#4cc9f0');
  });

  it('cambiar los colores cambia las variables sin tocar el marcado', () => {
    // Mismo tema salvo la paleta y la tipografía: si el color se aplicara con
    // clases condicionales en vez de con variables, el marcado cambiaría.
    const repintado: ThemeDefinition = {
      ...DEFAULT_THEME,
      colors: TEMA.colors,
      typography: TEMA.typography,
    };
    const bloque = { id: 'b1', type: 'short_text', title: 'Hola' } as const;

    const claro = pintar(conBloque(bloque, { theme: DEFAULT_THEME }));
    const marcadoClaro = raiz(claro.container).querySelector('form')?.innerHTML;
    claro.unmount();

    const oscuro = pintar(conBloque(bloque, { theme: repintado }));
    const marcadoOscuro = raiz(oscuro.container).querySelector('form')?.innerHTML;

    expect(marcadoOscuro).toBe(marcadoClaro);
    expect(raiz(oscuro.container).style.getPropertyValue('--tp-fondo')).toBe('#0b1020');
  });
});

describe('tipografía, forma y alineación', () => {
  it('aplica la pila del catálogo local y el tamaño base', () => {
    const { container } = pintar(
      conBloque({ id: 'b1', type: 'short_text', title: 'Hola' }, { theme: TEMA }),
    );
    const estilo = raiz(container).style;

    expect(estilo.getPropertyValue('--tp-fuente')).toBe(PILAS_DE_FUENTE.lora);
    expect(estilo.getPropertyValue('--tp-tamano-base')).toBe('20px');
    expect(estilo.getPropertyValue('--tp-escala-titulos')).toBe('1.5');
  });

  it('aplica el radio de bordes y la alineación del contenido', () => {
    const { container } = pintar(
      conBloque({ id: 'b1', type: 'short_text', title: 'Hola' }, { theme: TEMA }),
    );
    const elemento = raiz(container);

    expect(elemento.style.getPropertyValue('--tp-radio')).toBe(RADIOS_DE_BORDE.full);
    expect(elemento.style.getPropertyValue('--tp-alineacion')).toBe('center');
    expect(elemento.style.getPropertyValue('--tp-alineacion-flex')).toBe('center');
    expect(elemento.style.textAlign).toBe('center');
  });

  it('publica el estilo de botón y la alineación como `data-*`', () => {
    const { container } = pintar(
      conBloque({ id: 'b1', type: 'short_text', title: 'Hola' }, { theme: TEMA }),
    );
    const elemento = raiz(container);

    expect(elemento).toHaveAttribute('data-tema-boton', 'pill');
    expect(elemento).toHaveAttribute('data-tema-alineacion', 'center');
    expect(elemento).toHaveAttribute('data-tema-radio', 'full');
    expect(elemento).toHaveAttribute('data-tema-fuente', 'lora');
  });

  it('el estilo de botón del tema decide la forma del botón principal', () => {
    pintar(conBloque({ id: 'b1', type: 'short_text', title: 'Hola' }, { theme: TEMA }));
    expect(screen.getByRole('button', { name: /enviar/i }).className).toContain('rounded-full');
  });
});

describe('logo e imagen de fondo', () => {
  it('se resuelven por el mismo resolutor que el resto de activos', () => {
    const { container } = pintar(
      conBloque({ id: 'b1', type: 'short_text', title: 'Hola' }, { theme: TEMA }),
      { resolverMedia: RESOLUTOR },
    );

    expect(screen.getByRole('img', { name: 'Marca' })).toHaveAttribute(
      'src',
      'https://medios.test/logo-1.webp',
    );
    expect(raiz(container).style.getPropertyValue('--tp-imagen-fondo')).toBe(
      'url("https://medios.test/fondo-1.webp")',
    );
    expect(raiz(container).style.getPropertyValue('--tp-superposicion')).toBe('0.4');
  });

  it('sin resolutor no se pinta ninguna imagen y el formulario sigue usable', () => {
    const { container } = pintar(
      conBloque({ id: 'b1', type: 'short_text', title: 'Hola' }, { theme: TEMA }),
    );

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(raiz(container).style.getPropertyValue('--tp-imagen-fondo')).toBe('none');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});

describe('ausencia de color literal en el árbol', () => {
  it('ningún elemento interno declara un color fijo en su estilo en línea', () => {
    const { container } = pintar(
      conBloque(
        {
          id: 'b1',
          type: 'single_choice',
          title: 'Elige',
          choices: [
            { id: 'op-a', label: 'A', value: 'a' },
            { id: 'op-b', label: 'B', value: 'b' },
          ],
        },
        { theme: TEMA },
      ),
    );

    const elemento = raiz(container);
    for (const nodo of elemento.querySelectorAll<HTMLElement>('*')) {
      const estilo = nodo.getAttribute('style') ?? '';
      expect(estilo).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(estilo).not.toMatch(/\brgba?\(/i);
    }
  });
});
