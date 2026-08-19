/**
 * Listado del panel: datos, búsqueda, vacío y error.
 *
 * `fetch` se sustituye entero en lugar de inyectar un cargador falso: así el
 * test recorre también `./api`, que es donde se decide qué mensaje ve el usuario
 * cuando el servidor responde mal o no responde.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { empujar } = vi.hoisted(() => ({ empujar: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujar, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { MENSAJE_ERROR_RED } from '../api';
import { ListadoFormularios } from '../listado-formularios';

import { crearPagina, crearResumen, respuestaJson, siempreJson, urlDeLlamada } from './utiles';

const peticion = vi.fn<(entrada: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  peticion.mockReset();
  empujar.mockReset();
  vi.stubGlobal('fetch', peticion);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListadoFormularios · datos', () => {
  it('pinta cada formulario con su estado, sus respuestas y su fecha de edición', async () => {
    peticion.mockImplementation(
      siempreJson(
        crearPagina([
          crearResumen(),
          crearResumen({
            id: '22222222-2222-4222-8222-222222222222',
            slug: 'nps-trimestral',
            title: 'NPS trimestral',
            status: 'published',
            activeVersionId: 'v1',
            activeVersionNumber: 2,
            responses: { sessions: 40, completed: 31 },
          }),
        ]),
      ),
    );

    render(<ListadoFormularios />);

    const filas = await screen.findAllByRole('listitem');
    expect(filas).toHaveLength(2);

    const primera = filas[0];
    if (primera === undefined) throw new Error('no hay primera fila');

    expect(within(primera).getByRole('heading', { name: 'Encuesta de verano' })).toBeVisible();
    expect(within(primera).getByText('Borrador')).toBeVisible();
    expect(within(primera).getByText('/f/encuesta-de-verano')).toBeVisible();
    // «Respuestas» es la cifra de sesiones completadas, no la de iniciadas.
    expect(within(primera).getByText('7')).toBeVisible();
    expect(within(primera).getByText('12')).toBeVisible();

    expect(screen.getByText('2 formularios')).toBeVisible();
  });

  it('enlaza a la pantalla de edición del editor', async () => {
    peticion.mockImplementation(siempreJson(crearPagina([crearResumen()])));

    render(<ListadoFormularios />);

    const enlace = await screen.findByRole('link', { name: /^Editar/ });
    expect(enlace).toHaveAttribute(
      'href',
      '/app/formularios/11111111-1111-4111-8111-111111111111/editar',
    );
  });

  it('no ofrece editar un formulario archivado', async () => {
    peticion.mockImplementation(
      siempreJson(crearPagina([crearResumen({ status: 'archived' })])),
    );

    render(<ListadoFormularios />);

    await screen.findByText('Archivado');
    expect(screen.queryByRole('link', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Desarchivar/ })).toBeVisible();
  });
});

describe('ListadoFormularios · búsqueda y filtro', () => {
  it('consulta la API con el texto escrito y muestra el resultado', async () => {
    const usuario = userEvent.setup();

    peticion.mockImplementation((entrada: string) =>
      Promise.resolve(
        entrada.includes('q=nps')
          ? respuestaJson(
              crearPagina([crearResumen({ title: 'NPS trimestral', slug: 'nps-trimestral' })]),
            )
          : respuestaJson(
              crearPagina([
                crearResumen(),
                crearResumen({
                  id: '22222222-2222-4222-8222-222222222222',
                  title: 'NPS trimestral',
                  slug: 'nps-trimestral',
                }),
              ]),
            ),
      ),
    );

    render(<ListadoFormularios />);
    await screen.findByText('2 formularios');

    await usuario.type(screen.getByLabelText('Buscar formularios'), 'nps');

    await waitFor(() => {
      expect(peticion.mock.calls.some((llamada) => urlDeLlamada(llamada).includes('q=nps'))).toBe(
        true,
      );
    });

    await waitFor(() => {
      expect(screen.getByText('1 formulario')).toBeVisible();
    });
    expect(screen.queryByText('Encuesta de verano')).not.toBeInTheDocument();
  });

  it('traduce el filtro de estado a la query de la API', async () => {
    const usuario = userEvent.setup();
    peticion.mockImplementation(siempreJson(crearPagina([crearResumen()])));

    render(<ListadoFormularios />);
    await screen.findByText('1 formulario');

    await usuario.selectOptions(screen.getByLabelText('Estado'), 'archived');

    await waitFor(() => {
      expect(
        peticion.mock.calls.some((llamada) => urlDeLlamada(llamada).includes('status=archived')),
      ).toBe(true);
    });
  });
});

describe('ListadoFormularios · estado vacío', () => {
  it('invita a crear el primero cuando no hay ninguno', async () => {
    peticion.mockImplementation(siempreJson(crearPagina([])));

    render(<ListadoFormularios />);

    expect(await screen.findByText('Todavía no hay formularios')).toBeVisible();
    expect(screen.getByRole('button', { name: /Crear el primer formulario/ })).toBeVisible();
  });

  it('distingue «no hay nada» de «la búsqueda no encuentra nada»', async () => {
    const usuario = userEvent.setup();
    peticion.mockImplementation((entrada: string) =>
      Promise.resolve(
        respuestaJson(crearPagina(entrada.includes('q=') ? [] : [crearResumen()])),
      ),
    );

    render(<ListadoFormularios />);
    await screen.findByText('Encuesta de verano');

    await usuario.type(screen.getByLabelText('Buscar formularios'), 'zzz');

    expect(await screen.findByText('Ningún formulario coincide')).toBeVisible();
    expect(screen.queryByText('Todavía no hay formularios')).not.toBeInTheDocument();

    // El botón de recuperación devuelve la lista completa.
    await usuario.click(screen.getByRole('button', { name: 'Quitar los filtros' }));
    expect(await screen.findByText('Encuesta de verano')).toBeVisible();
  });
});

describe('ListadoFormularios · errores', () => {
  it('enseña el fallo de red y permite reintentar', async () => {
    const usuario = userEvent.setup();
    peticion.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<ListadoFormularios />);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('No se han podido cargar los formularios');
    expect(aviso).toHaveTextContent(MENSAJE_ERROR_RED);

    peticion.mockImplementation(siempreJson(crearPagina([crearResumen()])));
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Encuesta de verano')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('muestra el mensaje que manda la API, sin reescribirlo', async () => {
    peticion.mockImplementation(
      siempreJson(
        { error: { code: 'NO_AUTENTICADO', message: 'Necesitas iniciar sesión para continuar.' } },
        401,
      ),
    );

    render(<ListadoFormularios />);

    expect(
      await screen.findByText('Necesitas iniciar sesión para continuar.'),
    ).toBeVisible();
  });

  it('no deja la pantalla en blanco cuando el servidor responde algo que no es JSON', async () => {
    peticion.mockImplementation(
      () =>
        Promise.resolve(
          new Response('<!doctype html><title>502</title>', {
            status: 502,
            headers: { 'content-type': 'text/html' },
          }),
        ),
    );

    render(<ListadoFormularios />);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('error inesperado (502)');
  });
});
