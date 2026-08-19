/**
 * Pantalla de resultados: datos, filtros, paginación y los tres estados que no
 * son «aquí están los datos».
 *
 * `fetch` se sustituye entero en lugar de inyectar un cargador falso: así el
 * test recorre también `../api`, que es donde se decide qué URL se pide y qué
 * mensaje ve quien mira la pantalla cuando el servidor responde mal o no
 * responde.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MENSAJE_ERROR_RED } from '../api';
import { PanelResultados } from '../panel-resultados';

import {
  ID_FORMULARIO,
  ID_VERSION_1,
  crearResultados,
  respuestaError,
  siempreJson,
  urlDeLlamada,
} from './utiles';

const peticion = vi.fn<(entrada: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  peticion.mockReset();
  vi.stubGlobal('fetch', peticion);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Última URL pedida al servidor. */
function ultimaUrl(): string {
  const llamadas = peticion.mock.calls;
  const ultima = llamadas[llamadas.length - 1];
  return ultima === undefined ? '' : urlDeLlamada(ultima);
}

describe('PanelResultados · datos', () => {
  it('pinta el resumen, las distribuciones y la tabla', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);

    expect(await screen.findByText('Sesiones iniciadas')).toBeVisible();
    expect(screen.getByText('Tasa de finalización')).toBeVisible();
    // «Abandonadas» aparece dos veces —como cifra y como opción del filtro—, así
    // que se busca dentro de la tarjeta del resumen.
    const resumen = screen.getByRole('region', { name: 'Resumen' });
    expect(within(resumen).getByText('Abandonadas')).toBeVisible();

    // La distribución trae las etiquetas de las opciones y sus recuentos. Se
    // busca dentro de su tarjeta: «Soy cliente» también es el valor de una celda
    // de la tabla de abajo.
    const perfil = screen.getByRole('heading', { name: '¿Quién eres?' }).closest('article');
    expect(perfil).not.toBeNull();
    expect(within(perfil as HTMLElement).getByText('Soy cliente')).toBeVisible();
    expect(within(perfil as HTMLElement).getByText(/^2 ·/u)).toBeVisible();

    // Los promedios de la valoración: el original y el normalizado.
    const satisfaccion = screen.getByRole('heading', { name: 'Satisfacción' }).closest('article');
    expect(satisfaccion).not.toBeNull();
    expect(within(satisfaccion as HTMLElement).getByText(/Promedio:/u)).toBeVisible();
    expect(within(satisfaccion as HTMLElement).getByText('0,75')).toBeVisible();

    // La tabla trae una fila por sesión y una columna por pregunta.
    const tabla = screen.getByRole('table');
    expect(within(tabla).getAllByRole('row')).toHaveLength(3);
    expect(
      within(tabla).getByRole('columnheader', { name: '¿Algo que añadir?' }),
    ).toBeVisible();
  });

  it('el texto libre se muestra completo, sin recortar', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);

    const celda = await screen.findByText(/Rápido, claro y "barato"/u);
    expect(celda.textContent).toBe('Rápido, claro y "barato".\nRepetiré.');
  });

  it('las preguntas de texto dicen que no se agregan, en lugar de fingir un cero', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);

    expect(
      await screen.findByText('Las respuestas de este tipo se leen completas en la tabla de respuestas.'),
    ).toBeVisible();
  });

  it('pide la primera página con el tamaño por defecto', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);
    await screen.findByText('Sesiones iniciadas');

    expect(ultimaUrl()).toContain(`/api/forms/${ID_FORMULARIO}/results?`);
    expect(ultimaUrl()).toContain('page=1');
    expect(ultimaUrl()).toContain('perPage=25');
    // Sin filtros no se manda ninguna clave vacía.
    expect(ultimaUrl()).not.toContain('estado=');
    expect(ultimaUrl()).not.toContain('versionId=');
  });
});

describe('PanelResultados · estados', () => {
  it('anuncia la carga antes de tener datos', async () => {
    peticion.mockImplementation(() => new Promise<Response>(() => undefined));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);

    // Un único anuncio, y dice lo que está pasando: el esqueleto que lo
    // acompaña es decorativo para no repetirlo en el lector de pantalla.
    expect(screen.getByRole('status')).toHaveTextContent('Cargando resultados…');
    await waitFor(() => {
      expect(screen.getAllByRole('status')).toHaveLength(1);
    });
  });

  it('enseña el fallo de red y deja reintentar', async () => {
    peticion.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('No se han podido cargar los resultados');
    expect(aviso).toHaveTextContent(MENSAJE_ERROR_RED);

    peticion.mockImplementation(siempreJson(crearResultados()));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Sesiones iniciadas')).toBeVisible();
  });

  it('muestra el mensaje del servidor tal cual cuando la API responde con error', async () => {
    peticion.mockResolvedValue(
      respuestaError(404, 'NO_ENCONTRADO', 'El formulario no existe.'),
    );

    render(<PanelResultados formularioId={ID_FORMULARIO} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('El formulario no existe.');
  });

  it('sin versiones publicadas explica que no hay nada que medir', async () => {
    peticion.mockImplementation(
      siempreJson(
        crearResultados({
          versiones: [],
          resumen: {
            iniciadas: 0,
            completadas: 0,
            abandonadas: 0,
            enCurso: 0,
            tasaFinalizacion: 0,
          },
        }),
      ),
    );

    render(<PanelResultados formularioId={ID_FORMULARIO} />);

    expect(await screen.findByText('Todavía no hay nada que medir')).toBeVisible();
    // Sin versiones no hay nada que filtrar ni que descargar.
    expect(screen.queryByRole('link', { name: /Descargar CSV/u })).toBeNull();
  });

  it('con versiones pero sin respuestas la tabla lo dice en lugar de quedarse vacía', async () => {
    const resultados = crearResultados();
    peticion.mockImplementation(
      siempreJson({
        ...resultados,
        tabla: { items: [], total: 0, page: 1, perPage: 25, pageCount: 1 },
      }),
    );

    render(<PanelResultados formularioId={ID_FORMULARIO} />);

    expect(await screen.findByText(/No hay respuestas que mostrar/u)).toBeVisible();
    expect(screen.getByText('Ninguna sesión con estos filtros.')).toBeVisible();
  });

  it('sin sesiones abandonadas el desglose no queda en blanco', async () => {
    peticion.mockImplementation(siempreJson(crearResultados({ abandonoPorPregunta: [] })));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);

    expect(await screen.findByText('Ninguna sesión abandonada con estos filtros.')).toBeVisible();
  });
});

describe('PanelResultados · filtros', () => {
  it('filtra por estado y vuelve a la primera página', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);
    await screen.findByText('Sesiones iniciadas');

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'abandonadas');

    await waitFor(() => {
      expect(ultimaUrl()).toContain('estado=abandonadas');
    });
    expect(ultimaUrl()).toContain('page=1');
  });

  it('filtra por versión con el identificador de la versión elegida', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);
    await screen.findByText('Sesiones iniciadas');

    const selector = screen.getByLabelText('Versión');
    // La activa se distingue en la propia etiqueta.
    expect(within(selector).getByRole('option', { name: 'Versión 2 (activa)' })).toBeInTheDocument();

    await userEvent.selectOptions(selector, ID_VERSION_1);

    await waitFor(() => {
      expect(ultimaUrl()).toContain(`versionId=${ID_VERSION_1}`);
    });
  });

  it('filtra por rango de fechas con fechas civiles', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);
    await screen.findByText('Sesiones iniciadas');

    await userEvent.type(screen.getByLabelText('Desde'), '2026-08-01');

    await waitFor(() => {
      expect(ultimaUrl()).toContain('desde=2026-08-01');
    });
  });

  it('la descarga del CSV lleva los filtros de la pantalla y no la paginación', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);
    await screen.findByText('Sesiones iniciadas');

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'completadas');

    const enlace = await screen.findByRole('link', { name: /Descargar CSV/u });
    const href = enlace.getAttribute('href') ?? '';

    expect(href).toContain(`/api/forms/${ID_FORMULARIO}/results.csv`);
    expect(href).toContain('estado=completadas');
    // El CSV exporta el filtro entero, no la página que se está viendo.
    expect(href).not.toContain('page=');
    expect(href).not.toContain('perPage=');
    expect(enlace).toHaveAttribute('download');
  });
});

describe('PanelResultados · paginación', () => {
  const conDosPaginas = crearResultados({
    tabla: {
      items: crearResultados().tabla.items,
      total: 30,
      page: 1,
      perPage: 25,
      pageCount: 2,
    },
  });

  it('avanza de página y pide la siguiente al servidor', async () => {
    peticion.mockImplementation(siempreJson(conDosPaginas));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);
    await screen.findByText('Sesiones iniciadas');

    expect(screen.getByText('Página 1 de 2')).toBeVisible();
    // En la primera página no hay hacia dónde retroceder.
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      expect(ultimaUrl()).toContain('page=2');
    });
  });

  it('sin más de una página no se pinta la navegación', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);
    await screen.findByText('Sesiones iniciadas');

    expect(screen.queryByRole('navigation', { name: 'Paginación de respuestas' })).toBeNull();
  });
});

describe('PanelResultados · accesibilidad', () => {
  it('los cuatro filtros son controles etiquetados y alcanzables con el tabulador', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);
    await screen.findByText('Sesiones iniciadas');

    for (const etiqueta of ['Versión', 'Estado', 'Desde', 'Hasta']) {
      const control = screen.getByLabelText(etiqueta);
      control.focus();
      expect(control).toHaveFocus();
    }
  });

  it('la tabla ancha vive en una región enfocable para poder desplazarla con teclado', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);
    await screen.findByText('Sesiones iniciadas');

    const region = screen.getByRole('region', { name: 'Tabla de respuestas' });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('cada fila se identifica por su sesión y cada columna por su encabezado', async () => {
    peticion.mockImplementation(siempreJson(crearResultados()));

    render(<PanelResultados formularioId={ID_FORMULARIO} />);
    const tabla = await screen.findByRole('table');

    expect(within(tabla).getByRole('columnheader', { name: 'Estado' })).toBeVisible();
    expect(within(tabla).getAllByRole('rowheader')).toHaveLength(2);
    expect(within(tabla).getAllByText('Completada')).not.toHaveLength(0);
  });
});
