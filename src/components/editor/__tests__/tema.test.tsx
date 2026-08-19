/**
 * Panel de tema: advertencias de contraste visibles.
 *
 * No basta con calcular bien la relación —eso ya lo cubre
 * `lib/editor/__tests__/contraste.test.ts`—: el requisito de la fase es que la
 * advertencia **se vea**, y que se vea junto al color que la provoca. Un panel
 * que calcula el contraste y no lo enseña no ha validado nada.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_THEME } from '@/lib/forms';

import { crearDefinicion, pintarEditor, reiniciarEstadoEditor } from './utiles';

const BLOQUES: Parameters<typeof crearDefinicion>[0]['blocks'] = [
  { id: 'b1', type: 'short_text', title: 'Primera' },
];

/**
 * Abre el panel de tema y lo devuelve acotado.
 *
 * Acotar importa: la previsualización pinta siempre la región de error del
 * renderer con `role="alert"`, aunque esté vacía, así que una consulta global
 * de alertas encontraría dos y no diría nada sobre el tema.
 */
async function abrirTema(usuario: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await usuario.click(screen.getByRole('button', { name: 'Tema y accesibilidad' }));
  return screen.getByRole('complementary', { name: 'Tema del formulario' });
}

function relacionDe(pareja: string): { cumple: string | null; texto: string } {
  const fila = document.querySelector(`[data-pareja="${pareja}"]`);
  return {
    cumple: fila?.getAttribute('data-cumple') ?? null,
    texto: fila?.textContent ?? '',
  };
}

beforeEach(() => {
  reiniciarEstadoEditor();
});

describe('panel de tema', () => {
  it('enumera las seis parejas con su relación de contraste', async () => {
    const usuario = userEvent.setup();
    pintarEditor({ definicionInicial: crearDefinicion({ blocks: BLOQUES }) });
    const panel = await abrirTema(usuario);

    const lista = within(panel).getByRole('list', { name: 'Relaciones de contraste' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(6);
    expect(relacionDe('texto-fondo').texto).toContain(':1');
  });

  it('un tema legible no produce ninguna advertencia', async () => {
    const usuario = userEvent.setup();
    pintarEditor({
      definicionInicial: crearDefinicion({
        blocks: BLOQUES,
        theme: { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, controls: '#6b7280' } },
      }),
    });
    const panel = await abrirTema(usuario);

    expect(within(panel).getByText(/cumplen el nivel AA de WCAG/i)).toBeInTheDocument();
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('avisa en cuanto el texto deja de contrastar con el fondo', async () => {
    const usuario = userEvent.setup();
    pintarEditor({
      definicionInicial: crearDefinicion({
        blocks: BLOQUES,
        theme: { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, controls: '#6b7280' } },
      }),
    });
    const panel = await abrirTema(usuario);

    const campo = within(panel).getByLabelText('Texto');
    await usuario.clear(campo);
    await usuario.type(campo, '#eeeeee');

    const aviso = await within(panel).findByRole('alert');
    expect(aviso).toHaveTextContent(/Texto sobre el fondo/i);
    expect(aviso).toHaveTextContent(/WCAG AA/i);
    expect(relacionDe('texto-fondo').cumple).toBe('no');
  });

  it('el aviso se pega al control del color culpable', async () => {
    const usuario = userEvent.setup();
    pintarEditor({
      definicionInicial: crearDefinicion({
        blocks: BLOQUES,
        theme: { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, controls: '#6b7280' } },
      }),
    });
    const panel = await abrirTema(usuario);

    const campo = within(panel).getByLabelText('Texto');
    await usuario.clear(campo);
    await usuario.type(campo, '#eeeeee');

    // El campo hexadecimal queda marcado como inválido y describe su aviso.
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    const idAviso = campo.getAttribute('aria-describedby');
    expect(idAviso).not.toBeNull();
    if (idAviso === null) return;
    expect(document.getElementById(idAviso)?.textContent).toMatch(/por debajo del mínimo/i);
  });

  it('corregir el color retira la advertencia', async () => {
    const usuario = userEvent.setup();
    pintarEditor({
      definicionInicial: crearDefinicion({
        blocks: BLOQUES,
        theme: {
          ...DEFAULT_THEME,
          colors: { ...DEFAULT_THEME.colors, controls: '#6b7280', text: '#eeeeee' },
        },
      }),
    });
    const panel = await abrirTema(usuario);
    expect(within(panel).getByRole('alert')).toBeInTheDocument();

    const campo = within(panel).getByLabelText('Texto');
    await usuario.clear(campo);
    await usuario.type(campo, '#111827');

    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
    expect(relacionDe('texto-fondo').cumple).toBe('si');
  });

  it('exige 3:1 y no 4.5:1 a los elementos no textuales', async () => {
    const usuario = userEvent.setup();
    pintarEditor({
      definicionInicial: crearDefinicion({
        blocks: BLOQUES,
        theme: { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, controls: '#949494' } },
      }),
    });
    await abrirTema(usuario);

    // 3.1:1 — insuficiente para texto, suficiente para un borde.
    expect(relacionDe('controles-fondo').cumple).toBe('si');
  });
});
