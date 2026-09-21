/**
 * Reordenado del recorrido.
 *
 * Se prueban los dos caminos, porque los dos son el camino principal para
 * alguien: el sensor de teclado de `dnd-kit` (`Espacio`, flechas, `Espacio`) y
 * los botones de subir y bajar.
 *
 * jsdom no hace layout, así que las matemáticas de colisión de dnd-kit no
 * podrían distinguir una fila de otra: `simularGeometriaDeLista()` les da una
 * geometría deducida del índice que la propia lista ya pinta. Es la única
 * concesión del test al entorno; la interacción es real.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pintarEditor, reiniciarEstadoEditor, simularGeometriaDeLista } from './utiles';

let restaurarGeometria: () => void = () => undefined;

beforeEach(() => {
  reiniciarEstadoEditor();
  restaurarGeometria = simularGeometriaDeLista();
});

afterEach(() => {
  restaurarGeometria();
});

/** Títulos del recorrido, en el orden en el que se pintan. */
function ordenActual(): string[] {
  const lista = screen.getByRole('list', { name: 'Bloques del formulario' });
  return within(lista)
    .getAllByRole('listitem')
    .map((elemento) => elemento.getAttribute('data-bloque') ?? '');
}

describe('reordenar el recorrido', () => {
  it('parte del orden del documento', () => {
    pintarEditor();
    expect(ordenActual()).toEqual(['b1', 'b2', 'b3']);
  });

  it('se reordena solo con el teclado usando el asa de arrastre', async () => {
    const usuario = userEvent.setup();
    pintarEditor();

    const asa = screen.getByRole('button', { name: 'Reordenar Primera' });
    asa.focus();
    expect(asa).toHaveFocus();

    // Espacio levanta el bloque, la flecha lo mueve y Espacio lo suelta.
    await usuario.keyboard(' ');
    await usuario.keyboard('{ArrowDown}');
    await usuario.keyboard(' ');

    expect(ordenActual()).toEqual(['b2', 'b1', 'b3']);
  });

  it('Escape cancela el movimiento y deja el orden como estaba', async () => {
    const usuario = userEvent.setup();
    pintarEditor();

    screen.getByRole('button', { name: 'Reordenar Primera' }).focus();
    await usuario.keyboard(' ');
    await usuario.keyboard('{ArrowDown}');
    await usuario.keyboard('{Escape}');

    expect(ordenActual()).toEqual(['b1', 'b2', 'b3']);
  });

  it('los botones de subir y bajar hacen lo mismo', async () => {
    const usuario = userEvent.setup();
    pintarEditor();

    await usuario.click(screen.getByRole('button', { name: 'Bajar Primera' }));
    expect(ordenActual()).toEqual(['b2', 'b1', 'b3']);

    await usuario.click(screen.getByRole('button', { name: 'Subir Tercera' }));
    expect(ordenActual()).toEqual(['b2', 'b3', 'b1']);
  });

  it('los extremos no se pueden desbordar', () => {
    pintarEditor();
    expect(screen.getByRole('button', { name: 'Subir Primera' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar Tercera' })).toBeDisabled();
  });

  it('reordenar marca el borrador como pendiente de guardar', async () => {
    const usuario = userEvent.setup();
    const { container } = pintarEditor();

    expect(container.querySelector('[data-estado]')).toHaveAttribute('data-estado', 'guardado');
    await usuario.click(screen.getByRole('button', { name: 'Bajar Primera' }));
    expect(container.querySelector('[data-estado]')).toHaveAttribute('data-estado', 'pendiente');
  });
});
