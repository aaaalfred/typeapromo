/**
 * Interfaz de reglas y validación en vivo.
 *
 * Lo que se comprueba es la costura entre el editor y el validador de
 * publicación: que el panel solo ofrezca combinaciones legales y que, cuando
 * aun así el documento deja de ser publicable (porque se reordena, o porque dos
 * reglas se contradicen), el aviso aparezca **en el sitio del problema** y sin
 * esperar a pulsar «publicar».
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { crearDefinicion, pintarEditor, reiniciarEstadoEditor } from './utiles';

type Usuario = ReturnType<typeof userEvent.setup>;

function documento() {
  return crearDefinicion({
    blocks: [
      { id: 'b1', type: 'short_text', title: 'Primera' },
      { id: 'b2', type: 'rating', title: 'Segunda', scale: 5 },
      { id: 'b3', type: 'short_text', title: 'Tercera' },
    ],
  });
}

/** Selecciona un bloque de la lista y abre su pestaña de lógica. */
async function abrirLogica(usuario: Usuario, titulo: string): Promise<HTMLElement> {
  await usuario.click(screen.getByRole('button', { name: new RegExp(`^${titulo}`) }));
  await usuario.click(screen.getByRole('tab', { name: 'Lógica' }));
  return screen.getByRole('tabpanel');
}

function estadoDePublicacion(): string {
  return document.querySelector('[data-publicable]')?.getAttribute('data-publicable') ?? '';
}

beforeEach(() => {
  reiniciarEstadoEditor();
});

describe('panel de lógica', () => {
  it('un bloque sin reglas explica el comportamiento por defecto', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });
    const panel = await abrirLogica(usuario, 'Primera');

    expect(within(panel).getByText(/al siguiente bloque del recorrido/i)).toBeInTheDocument();
  });

  it('solo ofrece operadores aplicables al tipo de la pregunta', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });

    let panel = await abrirLogica(usuario, 'Primera');
    await usuario.click(within(panel).getByRole('button', { name: /Añadir regla/ }));
    const operadoresDeTexto = within(screen.getByRole('tabpanel'))
      .getAllByRole('option')
      .map((opcion) => opcion.textContent);
    expect(operadoresDeTexto).toContain('contiene');
    expect(operadoresDeTexto).not.toContain('es mayor que');

    panel = await abrirLogica(usuario, 'Segunda');
    await usuario.click(within(panel).getByRole('button', { name: /Añadir regla/ }));
    const operadoresDeValoracion = within(screen.getByRole('tabpanel'))
      .getAllByRole('option')
      .map((opcion) => opcion.textContent);
    expect(operadoresDeValoracion).toContain('es mayor que');
    expect(operadoresDeValoracion).not.toContain('contiene');
  });

  it('solo ofrece destinos hacia adelante y pantallas finales', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });
    const panel = await abrirLogica(usuario, 'Segunda');
    await usuario.click(within(panel).getByRole('button', { name: /Añadir regla/ }));

    const destino = within(screen.getByRole('tabpanel')).getByLabelText('Entonces ir a…');
    const opciones = within(destino).getAllByRole('option').map((opcion) => opcion.textContent);
    expect(opciones).toEqual(['Tercera', 'Pantalla final · ¡Gracias!']);
  });

  it('cambiar de operador reinicia el valor y esconde el control cuando sobra', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });
    const panel = await abrirLogica(usuario, 'Segunda');
    await usuario.click(within(panel).getByRole('button', { name: /Añadir regla/ }));

    const actual = () => screen.getByRole('tabpanel');
    expect(within(actual()).getByLabelText('Valor')).toBeInTheDocument();

    await usuario.selectOptions(within(actual()).getByLabelText('Si la respuesta…'), 'is_empty');
    expect(within(actual()).queryByLabelText('Valor')).not.toBeInTheDocument();

    await usuario.selectOptions(
      within(actual()).getByLabelText('Si la respuesta…'),
      'greater_than',
    );
    // Vuelve con un valor dentro del rango de la valoración, no con `null`.
    expect(within(actual()).getByLabelText('Valor')).toHaveValue(1);
    expect(estadoDePublicacion()).toBe('si');
  });

  it('avisa en vivo de dos reglas contradictorias, en las dos reglas', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });
    const panel = await abrirLogica(usuario, 'Segunda');

    await usuario.click(within(panel).getByRole('button', { name: /Añadir regla/ }));
    await usuario.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: /Añadir regla/ }));
    expect(estadoDePublicacion()).toBe('si');

    // Misma condición, destinos distintos: el motor no podría decidir.
    const reglas = [
      ...screen.getByRole('tabpanel').querySelectorAll<HTMLElement>('[data-regla]'),
    ];
    expect(reglas).toHaveLength(2);
    const segunda = reglas[1];
    if (segunda === undefined) return;
    await usuario.selectOptions(
      within(segunda).getByLabelText('Entonces ir a…'),
      'end_screen:fin',
    );

    const avisos = within(screen.getByRole('tabpanel')).getAllByText(/evalúan la misma condición/i);
    expect(avisos).toHaveLength(2);
    expect(estadoDePublicacion()).toBe('no');
  });

  it('avisa en vivo cuando reordenar convierte un salto en salto hacia atrás', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });

    const panel = await abrirLogica(usuario, 'Segunda');
    await usuario.click(within(panel).getByRole('button', { name: /Añadir regla/ }));
    expect(estadoDePublicacion()).toBe('si');

    // «Segunda» pasa detrás de «Tercera»: su regla apunta ahora hacia atrás.
    await usuario.click(screen.getByRole('button', { name: 'Bajar Segunda' }));

    expect(estadoDePublicacion()).toBe('no');
    expect(
      within(screen.getByRole('tabpanel')).getByText(/salta hacia atrás/i),
    ).toBeInTheDocument();
  });

  it('eliminar la regla devuelve el documento a estado publicable', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });

    const panel = await abrirLogica(usuario, 'Segunda');
    await usuario.click(within(panel).getByRole('button', { name: /Añadir regla/ }));
    await usuario.click(screen.getByRole('button', { name: 'Bajar Segunda' }));
    expect(estadoDePublicacion()).toBe('no');

    await usuario.click(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: /Eliminar la regla/ }),
    );
    expect(estadoDePublicacion()).toBe('si');
  });

  it('un bloque sin respuesta no puede condicionar nada', async () => {
    const usuario = userEvent.setup();
    pintarEditor({
      definicionInicial: crearDefinicion({
        blocks: [
          { id: 'b1', type: 'statement', title: 'Aviso' },
          { id: 'b2', type: 'short_text', title: 'Pregunta' },
        ],
      }),
    });

    await usuario.click(screen.getByRole('button', { name: /^Aviso/ }));
    expect(screen.queryByRole('tab', { name: 'Lógica' })).not.toBeInTheDocument();
  });
});
