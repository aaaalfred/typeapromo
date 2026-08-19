/**
 * Acciones del listado: confirmación, llamada a la API y alta de formularios.
 *
 * Lo que se comprueba aquí no es que el botón exista, sino que **no pasa nada**
 * hasta que alguien confirma: una acción que se ejecuta al primer clic y luego
 * se explica es exactamente el fallo que la confirmación evita.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { empujar } = vi.hoisted(() => ({ empujar: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujar, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { ListadoFormularios } from '../listado-formularios';

import {
  crearPagina,
  crearResumen,
  metodoDeLlamada,
  respuestaError,
  respuestaHtml,
  respuestaJson,
  urlDeLlamada,
} from './utiles';

const ID = '11111111-1111-4111-8111-111111111111';

const peticion = vi.fn<(entrada: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  peticion.mockReset();
  empujar.mockReset();
  vi.stubGlobal('fetch', peticion);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Doble de servidor: lista siempre, y delega el resto en `mutacion`. */
function montarServidor(
  estado: 'draft' | 'published' | 'archived',
  mutacion: (entrada: string) => Response,
): void {
  const formulario = crearResumen({
    status: estado,
    ...(estado === 'published' ? { activeVersionId: 'v1', activeVersionNumber: 1 } : {}),
  });

  peticion.mockImplementation((entrada: string) =>
    Promise.resolve(
      entrada.startsWith('/api/forms?')
        ? respuestaJson(crearPagina([formulario]))
        : mutacion(entrada),
    ),
  );
}

/** Llamadas cuya URL termina en el sufijo dado. */
function llamadasA(sufijo: string): readonly unknown[][] {
  return peticion.mock.calls.filter((llamada) => urlDeLlamada(llamada).endsWith(sufijo));
}

describe('acciones que confirman antes de ejecutarse', () => {
  it('no cierra el formulario hasta que se confirma, y no lo cierra si se cancela', async () => {
    const usuario = userEvent.setup();
    montarServidor('published', () => respuestaJson({ form: crearResumen({ status: 'closed' }) }));

    render(<ListadoFormularios />);
    await screen.findByText('Encuesta de verano');

    await usuario.click(screen.getByRole('button', { name: /^Cerrar «/ }));

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('Cerrar el formulario');
    expect(dialogo).toHaveTextContent('dejará de admitir respuestas nuevas');
    expect(llamadasA('/close')).toHaveLength(0);

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(llamadasA('/close')).toHaveLength(0);

    await usuario.click(screen.getByRole('button', { name: /^Cerrar «/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar el formulario' }));

    await waitFor(() => {
      expect(llamadasA('/close')).toHaveLength(1);
    });
    const llamada = llamadasA('/close')[0];
    if (llamada === undefined) throw new Error('no se ha registrado la llamada');
    expect(urlDeLlamada(llamada)).toBe(`/api/forms/${ID}/close`);
    expect(metodoDeLlamada(llamada)).toBe('POST');

    expect(await screen.findByText(/Se ha cerrado «Encuesta de verano»/)).toBeVisible();
  });

  it('archiva con PATCH { archived: true } tras confirmar', async () => {
    const usuario = userEvent.setup();
    montarServidor('draft', () => respuestaJson({ form: crearResumen({ status: 'archived' }) }));

    render(<ListadoFormularios />);
    await screen.findByText('Encuesta de verano');

    await usuario.click(screen.getByRole('button', { name: /^Archivar «/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Archivar' }));

    await waitFor(() => {
      expect(llamadasA(`/api/forms/${ID}`)).toHaveLength(1);
    });
    const llamada = llamadasA(`/api/forms/${ID}`)[0];
    if (llamada === undefined) throw new Error('no se ha registrado la llamada');
    expect(metodoDeLlamada(llamada)).toBe('PATCH');
    expect(String((llamada[1] as { body?: unknown }).body)).toBe('{"archived":true}');
  });

  it('mantiene abierto el diálogo y muestra el motivo cuando el servidor rechaza', async () => {
    const usuario = userEvent.setup();
    montarServidor('draft', () =>
      respuestaError(
        409,
        'TRANSICION_INVALIDA',
        'No se puede archivar un formulario con respuestas en curso.',
      ),
    );

    render(<ListadoFormularios />);
    await screen.findByText('Encuesta de verano');

    await usuario.click(screen.getByRole('button', { name: /^Archivar «/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Archivar' }));

    expect(
      await screen.findByText('No se puede archivar un formulario con respuestas en curso.'),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('acciones sin confirmación', () => {
  it('duplica en el primer clic, porque no destruye nada', async () => {
    const usuario = userEvent.setup();
    montarServidor('draft', () =>
      respuestaJson({ form: crearResumen({ id: 'otro', title: 'Encuesta de verano (copia)' }) }, 201),
    );

    render(<ListadoFormularios />);
    await screen.findByText('Encuesta de verano');

    await usuario.click(screen.getByRole('button', { name: /^Duplicar «/ }));

    await waitFor(() => {
      expect(llamadasA('/duplicate')).toHaveLength(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText(/Se ha duplicado «Encuesta de verano»/)).toBeVisible();
  });
});

describe('publicar', () => {
  it('llama al contrato de la fase 7 y enseña el fallo mientras la ruta no exista', async () => {
    const usuario = userEvent.setup();
    // `POST /api/forms/:id/publish` todavía no existe: Next responde su 404 en
    // HTML, que no sigue el sobre de error de la API.
    montarServidor('draft', () => respuestaHtml(404));

    render(<ListadoFormularios />);
    await screen.findByText('Encuesta de verano');

    await usuario.click(screen.getByRole('button', { name: /^Publicar «/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Publicar' }));

    await waitFor(() => {
      expect(llamadasA('/publish')).toHaveLength(1);
    });
    const llamada = llamadasA('/publish')[0];
    if (llamada === undefined) throw new Error('no se ha registrado la llamada');
    expect(urlDeLlamada(llamada)).toBe(`/api/forms/${ID}/publish`);
    expect(metodoDeLlamada(llamada)).toBe('POST');

    expect(await screen.findByText(/El servidor no reconoce esta operación/)).toBeVisible();
  });
});

describe('crear formulario', () => {
  it('exige un título y luego navega al editor recién creado', async () => {
    const usuario = userEvent.setup();
    peticion.mockImplementation((entrada: string) =>
      Promise.resolve(
        entrada.startsWith('/api/forms?')
          ? respuestaJson(crearPagina([]))
          : respuestaJson({ form: crearResumen({ id: 'nuevo-id', title: 'Encuesta de otoño' }) }, 201),
      ),
    );

    render(<ListadoFormularios />);
    await screen.findByText('Todavía no hay formularios');

    await usuario.click(screen.getByRole('button', { name: /Nuevo formulario/ }));

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('Nuevo formulario');

    // Sin título no se llama a la API.
    await usuario.click(screen.getByRole('button', { name: 'Crear y abrir el editor' }));
    expect(await screen.findByText('Escribe un título para el formulario.')).toBeVisible();
    expect(peticion.mock.calls.filter((llamada) => metodoDeLlamada(llamada) === 'POST')).toHaveLength(
      0,
    );

    await usuario.type(screen.getByLabelText('Título del formulario'), 'Encuesta de otoño');
    await usuario.click(screen.getByRole('button', { name: 'Crear y abrir el editor' }));

    await waitFor(() => {
      expect(empujar).toHaveBeenCalledWith('/app/formularios/nuevo-id/editar');
    });

    const alta = peticion.mock.calls.find((llamada) => metodoDeLlamada(llamada) === 'POST');
    if (alta === undefined) throw new Error('no se ha registrado el alta');
    expect(urlDeLlamada(alta)).toBe('/api/forms');
    expect(String((alta[1] as { body?: unknown }).body)).toBe('{"title":"Encuesta de otoño"}');
  });

  it('muestra el error de la API sin cerrar el diálogo', async () => {
    const usuario = userEvent.setup();
    peticion.mockImplementation((entrada: string) =>
      Promise.resolve(
        entrada.startsWith('/api/forms?')
          ? respuestaJson(crearPagina([]))
          : respuestaError(400, 'DATOS_INVALIDOS', 'Los datos enviados no son válidos.'),
      ),
    );

    render(<ListadoFormularios />);
    await screen.findByText('Todavía no hay formularios');

    await usuario.click(screen.getByRole('button', { name: /Nuevo formulario/ }));
    await usuario.type(await screen.findByLabelText('Título del formulario'), 'Prueba');
    await usuario.click(screen.getByRole('button', { name: 'Crear y abrir el editor' }));

    expect(await screen.findByText('Los datos enviados no son válidos.')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(empujar).not.toHaveBeenCalled();
  });
});
