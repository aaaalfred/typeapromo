/**
 * Costura de la experiencia pública.
 *
 * Aquí no se prueba el renderer —eso es la fase 4, y tiene su propia batería—
 * sino lo único que aporta esta capa: cuándo se abre la sesión, qué se guarda al
 * avanzar, qué pasa si el servidor falla y cómo se reanuda.
 *
 * El cliente HTTP se sustituye por dobles: lo que se comprueba es el contrato
 * entre el componente y la API, no la API.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_THEME,
  SCHEMA_VERSION,
  formDefinitionSchema,
  type FormDefinition,
} from '@/lib/forms';

import { ExperienciaPublica, type SesionInicial } from '../experiencia';

const crearSesionPublica = vi.hoisted(() => vi.fn());
const guardarRespuestaPublica = vi.hoisted(() => vi.fn());
const completarSesionPublica = vi.hoisted(() => vi.fn());

vi.mock('../api', () => ({
  crearSesionPublica,
  guardarRespuestaPublica,
  completarSesionPublica,
}));

const FORM_ID = '11111111-1111-4111-8111-111111111111';
const SLUG = 'encuesta-de-prueba';

const definicion: FormDefinition = formDefinitionSchema.parse({
  schemaVersion: SCHEMA_VERSION,
  meta: { title: 'Encuesta de prueba' },
  theme: DEFAULT_THEME,
  blocks: [
    { id: 'nombre', type: 'short_text', title: '¿Cómo te llamas?', required: true },
    { id: 'empresa', type: 'short_text', title: '¿Dónde trabajas?' },
  ],
  rules: [],
  endScreens: [{ id: 'gracias', type: 'ending', title: '¡Gracias!' }],
});

function pintar(sesionInicial: SesionInicial | null = null) {
  return render(
    <ExperienciaPublica
      formId={FORM_ID}
      slug={SLUG}
      definicion={definicion}
      medios={{}}
      sesionInicial={sesionInicial}
    />,
  );
}

beforeEach(() => {
  crearSesionPublica.mockReset().mockResolvedValue({ reanudada: false });
  guardarRespuestaPublica.mockReset().mockResolvedValue({ terminado: false });
  completarSesionPublica.mockReset().mockResolvedValue({});
});

describe('apertura de la sesión', () => {
  it('no abre sesión solo por mirar la primera pantalla', async () => {
    pintar();

    await screen.findByRole('heading', { name: /¿Cómo te llamas\?/ });
    expect(crearSesionPublica).not.toHaveBeenCalled();
  });

  it('la abre en el primer avance, una sola vez', async () => {
    const usuario = userEvent.setup();
    pintar();

    await usuario.type(screen.getByRole('textbox'), 'Ada');
    await usuario.click(screen.getByRole('button', { name: /siguiente|continuar|enviar/i }));

    await waitFor(() => {
      expect(crearSesionPublica).toHaveBeenCalledWith(SLUG);
    });

    await usuario.click(screen.getByRole('button', { name: /siguiente|continuar|enviar/i }));

    await waitFor(() => {
      expect(guardarRespuestaPublica).toHaveBeenCalledTimes(2);
    });
    expect(crearSesionPublica).toHaveBeenCalledTimes(1);
  });

  it('no vuelve a abrirla al reanudar: la sesión ya existe', async () => {
    const usuario = userEvent.setup();
    pintar({
      respuestas: { nombre: 'Ada' },
      pantalla: { kind: 'block', id: 'empresa' },
      completada: false,
    });

    await usuario.click(screen.getByRole('button', { name: /siguiente|continuar|enviar/i }));

    await waitFor(() => {
      expect(guardarRespuestaPublica).toHaveBeenCalled();
    });
    expect(crearSesionPublica).not.toHaveBeenCalled();
  });

  it('un fallo al abrir la sesión no la deja rota para siempre', async () => {
    const usuario = userEvent.setup();
    crearSesionPublica
      .mockRejectedValueOnce(new Error('No se ha podido conectar.'))
      .mockResolvedValue({ reanudada: false });

    pintar();

    await usuario.type(screen.getByRole('textbox'), 'Ada');
    const avanzar = screen.getByRole('button', { name: /siguiente|continuar|enviar/i });

    await usuario.click(avanzar);
    expect(await screen.findByText('No se ha podido conectar.')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: /siguiente|continuar|enviar/i }));

    await waitFor(() => {
      expect(crearSesionPublica).toHaveBeenCalledTimes(2);
      expect(guardarRespuestaPublica).toHaveBeenCalledTimes(1);
    });
  });
});

describe('autosave al avanzar', () => {
  it('guarda la respuesta del bloque que se abandona', async () => {
    const usuario = userEvent.setup();
    pintar();

    await usuario.type(screen.getByRole('textbox'), 'Ada Lovelace');
    await usuario.click(screen.getByRole('button', { name: /siguiente|continuar|enviar/i }));

    await waitFor(() => {
      expect(guardarRespuestaPublica).toHaveBeenCalledWith(FORM_ID, 'nombre', 'Ada Lovelace');
    });
  });

  it('si el servidor falla, la pantalla no cambia y no se pierde lo escrito', async () => {
    const usuario = userEvent.setup();
    guardarRespuestaPublica.mockRejectedValue(
      new Error('No se ha podido guardar tu respuesta.'),
    );

    pintar();

    const campo = screen.getByRole('textbox');
    await usuario.type(campo, 'Ada Lovelace');
    await usuario.click(screen.getByRole('button', { name: /siguiente|continuar|enviar/i }));

    expect(
      await screen.findByText('No se ha podido guardar tu respuesta.'),
    ).toBeInTheDocument();

    // Seguimos en la misma pregunta y con el valor introducido.
    expect(screen.getByRole('heading', { name: /¿Cómo te llamas\?/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Ada Lovelace');
  });

  it('la validación inmediata no llega a llamar al servidor', async () => {
    const usuario = userEvent.setup();
    pintar();

    // `nombre` es obligatorio y está vacío.
    await usuario.click(screen.getByRole('button', { name: /siguiente|continuar|enviar/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).not.toBe('');
    });
    expect(guardarRespuestaPublica).not.toHaveBeenCalled();
    expect(crearSesionPublica).not.toHaveBeenCalled();
  });
});

describe('finalización', () => {
  it('cierra la sesión al llegar a la pantalla final', async () => {
    const usuario = userEvent.setup();
    pintar({
      respuestas: { nombre: 'Ada' },
      pantalla: { kind: 'block', id: 'empresa' },
      completada: false,
    });

    await usuario.click(screen.getByRole('button', { name: /siguiente|continuar|enviar/i }));

    await waitFor(() => {
      expect(completarSesionPublica).toHaveBeenCalledWith(FORM_ID);
    });
    expect(await screen.findByRole('heading', { name: /¡Gracias!/ })).toBeInTheDocument();
  });
});

describe('reanudación', () => {
  it('arranca en la pantalla guardada y avisa de que se han recuperado las respuestas', async () => {
    pintar({
      respuestas: { nombre: 'Ada' },
      pantalla: { kind: 'block', id: 'empresa' },
      completada: false,
    });

    expect(
      await screen.findByRole('heading', { name: /¿Dónde trabajas\?/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/recuperado tus respuestas/i);
  });

  it('una sesión sin respuestas no presume de haber recuperado nada', async () => {
    pintar({
      respuestas: {},
      pantalla: { kind: 'block', id: 'nombre' },
      completada: false,
    });

    await screen.findByRole('heading', { name: /¿Cómo te llamas\?/ });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('una sesión ya completada vuelve a su pantalla final', async () => {
    pintar({
      respuestas: { nombre: 'Ada', empresa: 'ACME' },
      pantalla: { kind: 'end_screen', id: 'gracias' },
      completada: true,
    });

    expect(await screen.findByRole('heading', { name: /¡Gracias!/ })).toBeInTheDocument();
    expect(guardarRespuestaPublica).not.toHaveBeenCalled();
  });
});
