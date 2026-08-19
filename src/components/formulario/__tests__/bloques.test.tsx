/**
 * Un test por cada uno de los once tipos de bloque de `PR.md`.
 *
 * El objetivo no es cubrir cada opción de cada bloque —eso lo hacen los tests
 * específicos de selección y valoración— sino comprobar que los once se pintan,
 * exponen la semántica accesible correcta y participan en el recorrido.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { conBloque, crearDefinicion, opciones, pintar } from './utiles';

describe('bloque de bienvenida', () => {
  it('muestra el cuerpo, usa su etiqueta de botón y no ofrece retroceso', async () => {
    const usuario = userEvent.setup();
    pintar(
      crearDefinicion({
        blocks: [
          { id: 'b1', type: 'welcome', title: 'Hola', body: 'Tardarás dos minutos', buttonLabel: 'Vamos' },
          { id: 'b2', type: 'short_text', title: '¿Cómo te llamas?' },
        ],
      }),
    );

    expect(screen.getByRole('heading', { name: 'Hola' })).toBeInTheDocument();
    expect(screen.getByText('Tardarás dos minutos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /atrás/i })).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: /vamos/i }));
    expect(screen.getByRole('heading', { name: '¿Cómo te llamas?' })).toBeInTheDocument();
  });
});

describe('bloque de declaración informativa', () => {
  it('no recoge respuesta y avanza con su botón', async () => {
    const usuario = userEvent.setup();
    pintar(
      crearDefinicion({
        blocks: [
          { id: 'b1', type: 'statement', title: 'Aviso', body: 'Esto es informativo' },
          { id: 'b2', type: 'short_text', title: 'Siguiente pregunta' },
        ],
      }),
    );

    expect(screen.getByText('Esto es informativo')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: /continuar/i }));
    expect(screen.getByRole('heading', { name: 'Siguiente pregunta' })).toBeInTheDocument();
  });
});

describe('bloque de texto corto', () => {
  it('guarda lo escrito y bloquea el avance si es obligatorio y está vacío', async () => {
    const usuario = userEvent.setup();
    pintar(
      crearDefinicion({
        blocks: [
          { id: 'b1', type: 'short_text', title: 'Tu nombre', required: true, placeholder: 'Nombre' },
          { id: 'b2', type: 'short_text', title: 'Tu ciudad' },
        ],
      }),
    );

    const campo = screen.getByRole('textbox');
    expect(campo).toHaveAttribute('aria-required', 'true');
    expect(campo).toHaveAttribute('placeholder', 'Nombre');

    await usuario.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Esta pregunta es obligatoria.');
    expect(campo).toHaveAttribute('aria-invalid', 'true');

    await usuario.type(campo, 'Ada');
    expect(campo).toHaveValue('Ada');
    await usuario.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(screen.getByRole('heading', { name: 'Tu ciudad' })).toBeInTheDocument();
  });
});

describe('bloque de texto largo', () => {
  it('pinta un área de texto con las filas configuradas', async () => {
    const usuario = userEvent.setup();
    pintar(conBloque({ id: 'b1', type: 'long_text', title: 'Cuéntanos', rows: 6 }));

    const area = screen.getByRole('textbox');
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveAttribute('rows', '6');

    await usuario.type(area, 'Una línea{Enter}otra línea');
    expect(area).toHaveValue('Una línea\notra línea');
  });
});

describe('bloque de email', () => {
  it('rechaza una dirección mal formada con un mensaje en español', async () => {
    const usuario = userEvent.setup();
    pintar(conBloque({ id: 'b1', type: 'email', title: 'Tu correo' }));

    const campo = screen.getByRole('textbox');
    expect(campo).toHaveAttribute('type', 'email');

    await usuario.type(campo, 'no-es-un-correo');
    await usuario.click(screen.getByRole('button', { name: /enviar/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Introduce un correo electrónico válido.');
  });
});

describe('bloque de fecha', () => {
  it('usa el control nativo y respeta los límites del documento', () => {
    const { container } = pintar(
      conBloque({
        id: 'b1',
        type: 'date',
        title: '¿Qué día?',
        validation: { min: '2026-01-01', max: '2026-12-31' },
      }),
    );

    const campo = container.querySelector('input[type="date"]');
    expect(campo).not.toBeNull();
    expect(campo).toHaveAttribute('min', '2026-01-01');
    expect(campo).toHaveAttribute('max', '2026-12-31');
  });
});

describe('bloque de selección única', () => {
  it('expone un radiogroup y guarda una sola opción', async () => {
    const usuario = userEvent.setup();
    pintar(
      conBloque({
        id: 'b1',
        type: 'single_choice',
        title: 'Color favorito',
        choices: opciones('Rojo', 'Verde', 'Azul'),
      }),
    );

    const grupo = screen.getByRole('radiogroup');
    expect(grupo).toHaveAttribute('aria-labelledby', 'tp-titulo-b1');
    expect(screen.getAllByRole('radio')).toHaveLength(3);

    await usuario.click(screen.getByRole('radio', { name: 'Verde' }));
    expect(screen.getByRole('radio', { name: 'Verde' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Rojo' })).not.toBeChecked();
  });
});

describe('bloque de selección múltiple', () => {
  it('expone casillas que se activan y desactivan de forma independiente', async () => {
    const usuario = userEvent.setup();
    pintar(
      conBloque({
        id: 'b1',
        type: 'multi_choice',
        title: 'Idiomas',
        choices: opciones('Español', 'Inglés', 'Euskera'),
      }),
    );

    const español = screen.getByRole('checkbox', { name: 'Español' });
    const ingles = screen.getByRole('checkbox', { name: 'Inglés' });

    await usuario.click(español);
    await usuario.click(ingles);
    expect(español).toBeChecked();
    expect(ingles).toBeChecked();

    await usuario.click(español);
    expect(español).not.toBeChecked();
    expect(ingles).toBeChecked();
  });
});

describe('bloque de escala numérica', () => {
  it('pinta un valor por paso con las etiquetas de los extremos', async () => {
    const usuario = userEvent.setup();
    pintar(
      conBloque({
        id: 'b1',
        type: 'scale',
        title: '¿Nos recomendarías?',
        min: 1,
        max: 5,
        labels: { min: 'Nada', max: 'Muchísimo' },
      }),
    );

    const valores = screen.getAllByRole('radio');
    expect(valores).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '1: Nada' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '5: Muchísimo' })).toBeInTheDocument();

    await usuario.click(screen.getByRole('radio', { name: '4' }));
    expect(screen.getByRole('radio', { name: '4' })).toBeChecked();
  });
});

describe('bloque de valoración visual', () => {
  it('guarda el entero elegido y publica su normalizado', async () => {
    const usuario = userEvent.setup();
    const { container } = pintar(
      conBloque({ id: 'b1', type: 'rating', title: '¿Qué tal?', appearance: 'stars', scale: 5 }),
    );

    await usuario.click(screen.getByRole('radio', { name: '4 de 5' }));

    const grupo = container.querySelector('[role="radiogroup"]');
    expect(grupo).toHaveAttribute('data-valor', '4');
    // (4 - 1) / (5 - 1)
    expect(grupo).toHaveAttribute('data-valor-normalizado', '0.75');
  });
});

describe('pantalla final', () => {
  it('es terminal: sin botón de avance y con la llamada a la acción como enlace', () => {
    pintar(
      crearDefinicion({
        blocks: [{ id: 'b1', type: 'short_text', title: 'Algo' }],
        endScreens: [
          {
            id: 'fin',
            type: 'ending',
            title: 'Hemos terminado',
            body: 'Gracias por tu tiempo',
            ctaLabel: 'Ir a la web',
            ctaUrl: 'https://ejemplo.test/gracias',
          },
        ],
      }),
      { pantallaInicial: { kind: 'end_screen', id: 'fin' } },
    );

    expect(screen.getByRole('heading', { name: 'Hemos terminado' })).toBeInTheDocument();
    expect(screen.getByText('Gracias por tu tiempo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /siguiente|enviar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir a la web/i })).toHaveAttribute(
      'href',
      'https://ejemplo.test/gracias',
    );
  });
});
