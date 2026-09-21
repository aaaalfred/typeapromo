/**
 * Navegación por teclado y foco.
 *
 * Criterio de aceptación de `PR.md`: el recorrido completo debe poder hacerse
 * sin ratón, con estados de foco visibles y etiquetas correctas.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { conBloque, crearDefinicion, opciones, pintar } from './utiles';

describe('avance con el teclado', () => {
  it('Intro en un campo de una línea avanza a la pantalla siguiente', async () => {
    const usuario = userEvent.setup();
    pintar(
      crearDefinicion({
        blocks: [
          { id: 'b1', type: 'short_text', title: 'Tu nombre' },
          { id: 'b2', type: 'short_text', title: 'Tu ciudad' },
        ],
      }),
    );

    await usuario.keyboard('Ada{Enter}');
    expect(screen.getByRole('heading', { name: 'Tu ciudad' })).toBeInTheDocument();
  });

  it('en un área de texto Intro escribe y Ctrl+Intro avanza', async () => {
    const usuario = userEvent.setup();
    pintar(
      crearDefinicion({
        blocks: [
          { id: 'b1', type: 'long_text', title: 'Cuéntanos' },
          { id: 'b2', type: 'short_text', title: 'Y ahora esto' },
        ],
      }),
    );

    await usuario.keyboard('línea uno{Enter}línea dos');
    expect(screen.getByRole('heading', { name: 'Cuéntanos' })).toBeInTheDocument();

    await usuario.keyboard('{Control>}{Enter}{/Control}');
    expect(screen.getByRole('heading', { name: 'Y ahora esto' })).toBeInTheDocument();
  });

  it('el orden de tabulación va del control a los botones de navegación', async () => {
    const usuario = userEvent.setup();
    pintar(
      crearDefinicion({
        blocks: [
          { id: 'b1', type: 'short_text', title: 'Uno' },
          { id: 'b2', type: 'short_text', title: 'Dos' },
        ],
      }),
    );

    expect(screen.getByRole('textbox')).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole('button', { name: /siguiente/i })).toHaveFocus();

    await usuario.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'Dos' })).toBeInTheDocument();

    // Ya hay historial: aparece «Atrás» y precede al botón principal.
    await usuario.tab();
    expect(screen.getByRole('button', { name: /atrás/i })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole('button', { name: /enviar/i })).toHaveFocus();
  });
});

describe('retroceso', () => {
  it('vuelve a la pantalla anterior conservando la respuesta', async () => {
    const usuario = userEvent.setup();
    pintar(
      crearDefinicion({
        blocks: [
          { id: 'b1', type: 'short_text', title: 'Uno' },
          { id: 'b2', type: 'short_text', title: 'Dos' },
        ],
      }),
    );

    await usuario.keyboard('Ada{Enter}');
    await usuario.click(screen.getByRole('button', { name: /atrás/i }));

    expect(screen.getByRole('heading', { name: 'Uno' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Ada');
    expect(screen.queryByRole('button', { name: /atrás/i })).not.toBeInTheDocument();
  });
});

describe('foco al cambiar de pantalla', () => {
  it('lo recibe el primer control de la pantalla nueva', async () => {
    const usuario = userEvent.setup();
    pintar(
      crearDefinicion({
        blocks: [
          { id: 'b1', type: 'statement', title: 'Aviso' },
          {
            id: 'b2',
            type: 'single_choice',
            title: 'Elige',
            choices: opciones('Uno', 'Dos'),
          },
        ],
      }),
    );

    await usuario.click(screen.getByRole('button', { name: /continuar/i }));
    expect(screen.getByRole('radio', { name: 'Uno' })).toHaveFocus();
  });

  it('puede desactivarse para que el editor no robe el foco al escribir', () => {
    pintar(conBloque({ id: 'b1', type: 'short_text', title: 'Uno' }), {
      enfocarAlCambiar: false,
    });
    expect(screen.getByRole('textbox')).not.toHaveFocus();
  });
});

describe('escala numérica con teclado', () => {
  it('las flechas recorren los valores y Inicio/Fin saltan a los extremos', async () => {
    const usuario = userEvent.setup();
    const { container } = pintar(
      conBloque({ id: 'b1', type: 'scale', title: 'Del 1 al 5', min: 1, max: 5 }),
    );
    const grupo = container.querySelector('[role="radiogroup"]');

    expect(screen.getByRole('radio', { name: '1' })).toHaveFocus();
    await usuario.keyboard('{ArrowRight}');
    expect(grupo).toHaveAttribute('data-valor', '1');
    await usuario.keyboard('{ArrowRight}');
    expect(grupo).toHaveAttribute('data-valor', '2');
    await usuario.keyboard('{End}');
    expect(grupo).toHaveAttribute('data-valor', '5');
    await usuario.keyboard('{Home}');
    expect(grupo).toHaveAttribute('data-valor', '1');
  });

  it('con más de once valores se usa el deslizador nativo', () => {
    const { container } = pintar(
      conBloque({ id: 'b1', type: 'scale', title: 'Del 0 al 100', min: 0, max: 100, step: 5 }),
    );
    const deslizador = screen.getByRole('slider');
    expect(deslizador).toHaveAttribute('type', 'range');
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
  });
});

describe('errores accesibles', () => {
  it('el mensaje vive en una región de alerta enlazada con el control', async () => {
    const usuario = userEvent.setup();
    pintar(
      conBloque({ id: 'b1', type: 'short_text', title: 'Obligatoria', required: true }),
    );

    const campo = screen.getByRole('textbox');
    await usuario.click(screen.getByRole('button', { name: /enviar/i }));

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveAttribute('id', 'tp-error-b1');
    expect(campo).toHaveAttribute('aria-describedby', expect.stringContaining('tp-error-b1'));
    expect(campo).toHaveFocus();

    // Corregir limpia el error sin esperar a un nuevo intento.
    await usuario.type(campo, 'x');
    expect(screen.getByRole('alert')).toHaveTextContent('');
    expect(campo).toHaveAttribute('aria-invalid', 'false');
  });
});
