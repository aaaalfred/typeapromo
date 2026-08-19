/**
 * Construir un formulario sin tocar JSON.
 *
 * Es el criterio de «hecho» de la fase, así que se recorre entero: añadir un
 * bloque, escribir su contenido, ver el resultado en la previsualización,
 * estrechar el marco a móvil y hacer una ejecución de prueba que no persiste
 * nada.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuardarBorrador } from '@/lib/editor';

import { crearDefinicion, pintarEditor, reiniciarEstadoEditor } from './utiles';

type Usuario = ReturnType<typeof userEvent.setup>;

function documento() {
  return crearDefinicion({
    blocks: [{ id: 'b1', type: 'short_text', title: 'Primera' }],
  });
}

/** Rótulo de la pantalla que está pintando la previsualización. */
function tituloEnPrevisualizacion(): string {
  const region = screen.getByRole('region', { name: 'Previsualización' });
  return within(region).getByRole('heading', { level: 2 }).textContent ?? '';
}

async function anadir(usuario: Usuario, nombre: string): Promise<void> {
  await usuario.click(screen.getByRole('button', { name: /Añadir bloque/ }));
  await usuario.click(screen.getByRole('button', { name: new RegExp(`^${nombre}`) }));
}

beforeEach(() => {
  reiniciarEstadoEditor();
});

describe('construir un formulario', () => {
  it('la previsualización sigue al bloque seleccionado', async () => {
    const usuario = userEvent.setup();
    pintarEditor({
      definicionInicial: crearDefinicion({
        blocks: [
          { id: 'b1', type: 'short_text', title: 'Primera' },
          { id: 'b2', type: 'short_text', title: 'Segunda' },
        ],
      }),
    });

    await usuario.click(screen.getByRole('button', { name: /^Segunda/ }));
    expect(tituloEnPrevisualizacion()).toBe('Segunda');

    await usuario.click(screen.getByRole('button', { name: /^Primera/ }));
    expect(tituloEnPrevisualizacion()).toBe('Primera');
  });

  it('añadir un bloque lo selecciona y lo enseña', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });

    await anadir(usuario, 'Selección única');

    const lista = screen.getByRole('list', { name: 'Bloques del formulario' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    expect(tituloEnPrevisualizacion()).toBe('Elige una opción');
    // Y con dos opciones ya pintadas, listas para editar.
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('escribir el título se refleja de inmediato en la previsualización', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });

    await usuario.click(screen.getByRole('button', { name: /^Primera/ }));
    const campo = screen.getByLabelText('Título');
    await usuario.clear(campo);
    await usuario.type(campo, '¿Cómo te llamas?');

    expect(tituloEnPrevisualizacion()).toBe('¿Cómo te llamas?');
  });

  it('cambiar el tipo conserva el título y el identificador', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });

    await usuario.click(screen.getByRole('button', { name: /^Primera/ }));
    await usuario.selectOptions(screen.getByLabelText('Tipo de bloque'), 'rating');

    expect(tituloEnPrevisualizacion()).toBe('Primera');
    const lista = screen.getByRole('list', { name: 'Bloques del formulario' });
    expect(within(lista).getAllByRole('listitem')[0]).toHaveAttribute('data-bloque', 'b1');
    expect(within(lista).getByText(/Valoración visual/)).toBeInTheDocument();
  });

  it('la vista móvil estrecha el marco, no cambia de componente', async () => {
    const usuario = userEvent.setup();
    const { container } = pintarEditor({ definicionInicial: documento() });

    expect(container.querySelector('[data-dispositivo]')).toHaveAttribute(
      'data-dispositivo',
      'escritorio',
    );

    await usuario.click(screen.getByRole('button', { name: 'Móvil' }));
    const marco = container.querySelector('[data-dispositivo]');
    expect(marco).toHaveAttribute('data-dispositivo', 'movil');
    expect(marco).toHaveStyle({ maxWidth: '390px' });
    // Sigue siendo el mismo renderer: la raíz del formulario no se remonta.
    expect(container.querySelector('[data-renderizador="formulario"]')).not.toBeNull();
  });

  it('la ejecución de prueba avisa, arranca desde el principio y no guarda respuestas', async () => {
    const usuario = userEvent.setup();
    const guardar = vi
      .fn<GuardarBorrador>()
      .mockResolvedValue({ estado: 'guardado', revision: 2, guardadoEn: new Date() });

    pintarEditor({
      guardar,
      definicionInicial: crearDefinicion({
        blocks: [
          { id: 'b1', type: 'short_text', title: 'Primera' },
          { id: 'b2', type: 'short_text', title: 'Segunda' },
        ],
      }),
    });

    // Se parte de la segunda pantalla para comprobar que la prueba no la hereda.
    await usuario.click(screen.getByRole('button', { name: /^Segunda/ }));
    await usuario.click(screen.getByRole('button', { name: /Ejecución de prueba/ }));

    expect(screen.getByText(/no se guarda ninguna respuesta/i)).toBeInTheDocument();
    expect(tituloEnPrevisualizacion()).toBe('Primera');

    const region = screen.getByRole('region', { name: 'Previsualización' });
    await usuario.type(within(region).getByRole('textbox'), 'Ana');
    await usuario.click(within(region).getByRole('button', { name: /Siguiente|Continuar/ }));
    expect(tituloEnPrevisualizacion()).toBe('Segunda');

    // Ni una sola escritura en el servidor: responder no toca el documento.
    expect(guardar).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole('button', { name: /Salir de la prueba/ }));
    expect(screen.queryByText(/no se guarda ninguna respuesta/i)).not.toBeInTheDocument();
  });

  it('las pantallas finales se editan como cualquier otra pantalla', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: documento() });

    await usuario.click(screen.getByRole('button', { name: /^¡Gracias!/ }));
    const campo = screen.getByLabelText('Título');
    await usuario.clear(campo);
    await usuario.type(campo, 'Hasta pronto');

    expect(tituloEnPrevisualizacion()).toBe('Hasta pronto');
  });

  it('el conflicto de revisión se explica y ofrece recargar', async () => {
    const usuario = userEvent.setup();
    const alRecargar = vi.fn();
    const guardar = vi.fn<GuardarBorrador>().mockResolvedValue({
      estado: 'conflicto',
      revisionEnviada: 1,
      revisionServidor: 9,
      mensaje: 'El borrador ha cambiado en otra pestaña o dispositivo.',
    });

    pintarEditor({ definicionInicial: documento(), guardar, alRecargar });

    await usuario.click(screen.getByRole('button', { name: /^Primera/ }));
    await usuario.type(screen.getByLabelText('Título'), '!');
    await usuario.click(screen.getByRole('button', { name: 'Guardar ahora' }));

    expect(await screen.findByText(/ha cambiado fuera de esta pestaña/i)).toBeInTheDocument();
    expect(screen.getByText(/Revisión del servidor/i)).toHaveTextContent('9');

    await usuario.click(screen.getByRole('button', { name: /Recargar el borrador/ }));
    expect(alRecargar).toHaveBeenCalledTimes(1);
  });
});
