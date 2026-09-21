/**
 * Recorrido, progreso y numeración: lo que el renderer delega en el motor de
 * `lib/forms` y solo pinta.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { crearDefinicion, opciones, pintar } from './utiles';

const TRES_PREGUNTAS = {
  blocks: [
    { id: 'b1', type: 'short_text' as const, title: 'Uno' },
    { id: 'b2', type: 'short_text' as const, title: 'Dos' },
    { id: 'b3', type: 'short_text' as const, title: 'Tres' },
  ],
};

describe('barra de progreso', () => {
  it('avanza según el recorrido efectivo y puede ocultarse', async () => {
    const usuario = userEvent.setup();
    pintar(crearDefinicion(TRES_PREGUNTAS));

    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '0');

    await usuario.keyboard('a{Enter}');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');

    await usuario.keyboard('b{Enter}');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
  });

  it('no se pinta si el documento la desactiva', () => {
    pintar(
      crearDefinicion({
        ...TRES_PREGUNTAS,
        settings: { showProgressBar: false, allowResume: true, showQuestionNumbers: false },
      }),
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('se anuncia como estimación mientras queden bifurcaciones abiertas', () => {
    pintar(
      crearDefinicion({
        blocks: [
          { id: 'b1', type: 'single_choice', title: '¿Sigues?', choices: opciones('Si', 'No') },
          { id: 'b2', type: 'short_text', title: 'Dos' },
        ],
        rules: [
          {
            id: 'r1',
            sourceQuestionId: 'b1',
            operator: 'equals',
            value: 'no',
            priority: 1,
            target: { kind: 'end_screen', id: 'fin' },
          },
        ],
      }),
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining('aproximadamente'),
    );
  });
});

describe('numeración de preguntas', () => {
  it('cuenta solo las preguntas y solo si el documento lo pide', async () => {
    const usuario = userEvent.setup();
    pintar(
      crearDefinicion({
        blocks: [
          { id: 'b0', type: 'welcome', title: 'Hola' },
          ...TRES_PREGUNTAS.blocks,
        ],
        settings: { showProgressBar: true, allowResume: true, showQuestionNumbers: true },
      }),
    );

    // La bienvenida no es una pregunta y no lleva número.
    expect(screen.queryByText(/^Pregunta/)).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: /empezar/i }));
    expect(screen.getByText(/1/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Uno' })).toBeInTheDocument();
  });
});

describe('pregunta no obligatoria', () => {
  it('se puede pasar en blanco y queda registrada como respondida', async () => {
    const usuario = userEvent.setup();
    const respuestas: Record<string, unknown>[] = [];

    pintar(crearDefinicion(TRES_PREGUNTAS), {
      onRespuestasChange: (nuevas) => {
        respuestas.push({ ...nuevas });
      },
    });

    await usuario.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(screen.getByRole('heading', { name: 'Dos' })).toBeInTheDocument();
    expect(respuestas.at(-1)).toEqual({ b1: null });
  });
});
