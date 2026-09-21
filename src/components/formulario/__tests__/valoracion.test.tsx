/**
 * Valoración visual: las tres apariencias por las cuatro escalas.
 *
 * Es criterio de aceptación explícito de `PR.md`: «estrellas, caras y corazones
 * funcionan visualmente, se navegan con teclado y producen valores analizables».
 * Los tres verbos se comprueban aquí.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { RATING_APPEARANCES, RATING_SCALES, normalize } from '@/lib/forms';

import { conBloque, pintar } from './utiles';

function bloqueValoracion(
  appearance: (typeof RATING_APPEARANCES)[number],
  scale: (typeof RATING_SCALES)[number],
) {
  return conBloque({
    id: 'v1',
    type: 'rating',
    title: '¿Qué tal ha ido?',
    appearance,
    scale,
  });
}

describe('rating configurable', () => {
  it('el contrato declara tres apariencias y cuatro escalas', () => {
    expect([...RATING_APPEARANCES]).toEqual(['stars', 'faces', 'hearts']);
    expect([...RATING_SCALES]).toEqual([3, 5, 7, 10]);
  });

  for (const appearance of RATING_APPEARANCES) {
    for (const scale of RATING_SCALES) {
      it(`«${appearance}» con escala ${String(scale)}: pinta, elige y normaliza`, async () => {
        const usuario = userEvent.setup();
        const { container } = pintar(bloqueValoracion(appearance, scale));

        const grupo = container.querySelector('[role="radiogroup"]');
        expect(grupo).toHaveAttribute('data-apariencia', appearance);
        expect(grupo).toHaveAttribute('data-escala', String(scale));

        const valores = screen.getAllByRole('radio');
        expect(valores).toHaveLength(scale);
        // Cada elemento se anuncia con su posición dentro de la escala.
        expect(valores[0]).toHaveAccessibleName(`1 de ${String(scale)}`);
        expect(valores[scale - 1]).toHaveAccessibleName(`${String(scale)} de ${String(scale)}`);

        const elegido = Math.min(2, scale);
        await usuario.click(screen.getByRole('radio', { name: `${String(elegido)} de ${String(scale)}` }));

        expect(grupo).toHaveAttribute('data-valor', String(elegido));
        expect(grupo).toHaveAttribute(
          'data-valor-normalizado',
          String(normalize(elegido, scale)),
        );
      });
    }
  }
});

describe('teclado de la valoración', () => {
  it('las flechas recorren la escala y se detienen en los extremos', async () => {
    const usuario = userEvent.setup();
    const { container } = pintar(bloqueValoracion('stars', 5));
    const grupo = container.querySelector('[role="radiogroup"]');

    // El foco entra en el control al abrirse la pantalla.
    expect(screen.getByRole('radio', { name: '1 de 5' })).toHaveFocus();

    await usuario.keyboard('{ArrowRight}');
    expect(grupo).toHaveAttribute('data-valor', '1');
    await usuario.keyboard('{ArrowRight}{ArrowRight}');
    expect(grupo).toHaveAttribute('data-valor', '3');
    expect(screen.getByRole('radio', { name: '3 de 5' })).toHaveFocus();

    await usuario.keyboard('{ArrowLeft}');
    expect(grupo).toHaveAttribute('data-valor', '2');

    await usuario.keyboard('{Home}');
    expect(grupo).toHaveAttribute('data-valor', '1');
    await usuario.keyboard('{ArrowLeft}');
    expect(grupo).toHaveAttribute('data-valor', '1');

    await usuario.keyboard('{End}');
    expect(grupo).toHaveAttribute('data-valor', '5');
    await usuario.keyboard('{ArrowRight}');
    expect(grupo).toHaveAttribute('data-valor', '5');
  });

  it('los dígitos eligen directamente y el 0 vale 10 en la escala larga', async () => {
    const usuario = userEvent.setup();
    const { container } = pintar(bloqueValoracion('hearts', 10));
    const grupo = container.querySelector('[role="radiogroup"]');

    await usuario.keyboard('7');
    expect(grupo).toHaveAttribute('data-valor', '7');

    await usuario.keyboard('0');
    expect(grupo).toHaveAttribute('data-valor', '10');
  });

  it('Supr borra la respuesta cuando la pregunta no es obligatoria', async () => {
    const usuario = userEvent.setup();
    const { container } = pintar(bloqueValoracion('faces', 5));
    const grupo = container.querySelector('[role="radiogroup"]');

    await usuario.keyboard('4');
    expect(grupo).toHaveAttribute('data-valor', '4');

    await usuario.keyboard('{Delete}');
    expect(grupo).not.toHaveAttribute('data-valor');
  });

  it('una valoración obligatoria vacía no deja avanzar', async () => {
    const usuario = userEvent.setup();
    pintar(
      conBloque({ id: 'v1', type: 'rating', title: 'Obligatoria', scale: 5, required: true }),
    );

    await usuario.click(screen.getByRole('button', { name: /enviar/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Esta pregunta es obligatoria.');
  });
});

describe('etiquetas de los extremos', () => {
  it('se anuncian junto al valor y se pintan bajo el control', () => {
    pintar(
      conBloque({
        id: 'v1',
        type: 'rating',
        title: 'Con etiquetas',
        appearance: 'hearts',
        scale: 7,
        labels: { min: 'Fatal', max: 'Genial' },
      }),
    );

    expect(screen.getByRole('radio', { name: '1 de 7: Fatal' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '7 de 7: Genial' })).toBeInTheDocument();
    expect(screen.getByText('Fatal')).toBeInTheDocument();
    expect(screen.getByText('Genial')).toBeInTheDocument();
  });
});

describe('relleno visual', () => {
  it('estrellas y corazones se rellenan de forma acumulativa', async () => {
    const usuario = userEvent.setup();
    const { container } = pintar(bloqueValoracion('stars', 5));

    await usuario.click(screen.getByRole('radio', { name: '3 de 5' }));
    const encendidos = container.querySelectorAll('[data-encendido="true"]');
    expect(encendidos).toHaveLength(3);
  });

  it('las caras marcan solo la elegida, porque cada una es un gesto distinto', async () => {
    const usuario = userEvent.setup();
    const { container } = pintar(bloqueValoracion('faces', 5));

    await usuario.click(screen.getByRole('radio', { name: '3 de 5' }));
    const encendidos = container.querySelectorAll('[data-encendido="true"]');
    expect(encendidos).toHaveLength(1);
  });
});
