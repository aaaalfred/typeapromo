/**
 * Los cuatro estilos de selección del contrato.
 *
 * La comprobación importante no es la forma sino que la **semántica no cambia**:
 * lista, botones, tarjetas y cuadrícula exponen exactamente los mismos roles y
 * el mismo comportamiento de teclado.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CHOICE_PRESENTATIONS, type ChoicePresentation } from '@/lib/forms';

import type { ResolverMedia } from '../medios';

import { conBloque, opciones, pintar } from './utiles';

const RESOLUTOR: ResolverMedia = (assetId) => ({
  url: `https://medios.test/${assetId}.webp`,
  alt: '',
});

function bloqueUnico(presentacion: ChoicePresentation) {
  return conBloque({
    id: 'b1',
    type: 'single_choice',
    title: 'Elige uno',
    presentation: presentacion,
    choices: [
      { id: 'op-a', label: 'Alfa', value: 'alfa', assetId: 'img-a' },
      { id: 'op-b', label: 'Beta', value: 'beta', assetId: 'img-b' },
      { id: 'op-c', label: 'Gamma', value: 'gamma', assetId: 'img-c' },
    ],
  });
}

describe('estilos de selección', () => {
  it('el contrato declara exactamente cuatro', () => {
    expect([...CHOICE_PRESENTATIONS]).toEqual(['list', 'buttons', 'image_cards', 'grid']);
  });

  for (const presentacion of CHOICE_PRESENTATIONS) {
    it(`«${presentacion}» conserva la semántica de radiogroup y permite elegir`, async () => {
      const usuario = userEvent.setup();
      pintar(bloqueUnico(presentacion), { resolverMedia: RESOLUTOR });

      const grupo = screen.getByRole('radiogroup');
      expect(grupo).toHaveAttribute('data-presentacion', presentacion);
      expect(within(grupo).getAllByRole('radio')).toHaveLength(3);

      await usuario.click(screen.getByRole('radio', { name: 'Beta' }));
      expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Alfa' })).not.toBeChecked();
    });
  }

  it('solo las presentaciones visuales pintan la imagen de cada opción', () => {
    const conImagenes = ['image_cards', 'grid'] as const;
    for (const presentacion of CHOICE_PRESENTATIONS) {
      const { container, unmount } = pintar(bloqueUnico(presentacion), {
        resolverMedia: RESOLUTOR,
      });
      const imagenes = container.querySelectorAll('img');
      if (conImagenes.includes(presentacion as (typeof conImagenes)[number])) {
        expect(imagenes).toHaveLength(3);
        expect(imagenes[0]).toHaveAttribute('src', 'https://medios.test/img-a.webp');
      } else {
        expect(imagenes).toHaveLength(0);
      }
      unmount();
    }
  });

  it('las tarjetas sin imagen resuelta siguen siendo elegibles', async () => {
    const usuario = userEvent.setup();
    pintar(bloqueUnico('image_cards'));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('radio', { name: 'Gamma' }));
    expect(screen.getByRole('radio', { name: 'Gamma' })).toBeChecked();
  });
});

describe('selección múltiple', () => {
  it('mantiene la semántica de casillas en las cuatro presentaciones', async () => {
    for (const presentacion of CHOICE_PRESENTATIONS) {
      const usuario = userEvent.setup();
      const { unmount } = pintar(
        conBloque({
          id: 'b1',
          type: 'multi_choice',
          title: 'Elige varias',
          presentation: presentacion,
          choices: opciones('Uno', 'Dos', 'Tres'),
        }),
      );

      const grupo = screen.getByRole('group');
      expect(grupo).toHaveAttribute('data-presentacion', presentacion);
      const casillas = within(grupo).getAllByRole('checkbox');
      expect(casillas).toHaveLength(3);

      await usuario.click(casillas[0] as HTMLElement);
      await usuario.click(casillas[2] as HTMLElement);
      expect(casillas[0]).toBeChecked();
      expect(casillas[1]).not.toBeChecked();
      expect(casillas[2]).toBeChecked();

      unmount();
    }
  });

  it('respeta el mínimo y el máximo de selecciones al avanzar', async () => {
    const usuario = userEvent.setup();
    pintar(
      conBloque({
        id: 'b1',
        type: 'multi_choice',
        title: 'Elige dos',
        minSelections: 2,
        choices: opciones('Uno', 'Dos', 'Tres'),
      }),
    );

    await usuario.click(screen.getByRole('checkbox', { name: 'Uno' }));
    await usuario.click(screen.getByRole('button', { name: /enviar/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona al menos 2 opciones.');
  });
});

describe('atajos por letra', () => {
  it('la tecla de la posición activa esa opción', async () => {
    const usuario = userEvent.setup();
    pintar(bloqueUnico('list'));

    // Al entrar en la pantalla el foco ya está en el grupo.
    expect(screen.getByRole('radio', { name: 'Alfa' })).toHaveFocus();
    await usuario.keyboard('c');
    expect(screen.getByRole('radio', { name: 'Gamma' })).toBeChecked();

    await usuario.keyboard('a');
    expect(screen.getByRole('radio', { name: 'Alfa' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Gamma' })).not.toBeChecked();
  });

  it('en selección múltiple la letra alterna sin desmarcar el resto', async () => {
    const usuario = userEvent.setup();
    pintar(
      conBloque({
        id: 'b1',
        type: 'multi_choice',
        title: 'Elige varias',
        choices: opciones('Uno', 'Dos', 'Tres'),
      }),
    );

    await usuario.keyboard('a');
    await usuario.keyboard('b');
    expect(screen.getByRole('checkbox', { name: 'Uno' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Dos' })).toBeChecked();

    await usuario.keyboard('a');
    expect(screen.getByRole('checkbox', { name: 'Uno' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Dos' })).toBeChecked();
  });
});
