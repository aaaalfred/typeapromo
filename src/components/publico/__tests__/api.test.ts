/**
 * Contrato de transporte del cliente público.
 *
 * No se prueba el servidor: se prueba lo que sale por `fetch`. Interesa aquí
 * una sola propiedad, y es una que no se ve mirando la interfaz: que la
 * finalización sobreviva a la descarga del documento.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { completarSesionPublica, guardarRespuestaPublica } from '../api';

const FORM_ID = '11111111-1111-4111-8111-111111111111';

function respuestaVacia(): Response {
  return new Response(JSON.stringify({ sesion: {} }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchDoble: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchDoble = vi.fn().mockResolvedValue(respuestaVacia());
  vi.stubGlobal('fetch', fetchDoble);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function opcionesDeLaLlamada(): RequestInit {
  const llamada: unknown[] | undefined = fetchDoble.mock.calls[0];
  expect(llamada).toBeDefined();
  return llamada?.[1] as RequestInit;
}

describe('completarSesionPublica', () => {
  it('viaja con keepalive: es la unica peticion que se emite despues de que la interfaz avance', async () => {
    await completarSesionPublica(FORM_ID);

    // Sin esto, cerrar la pestana en la pantalla final aborta la peticion y la
    // sesion queda `in_progress`: una respuesta completa contada como abandono.
    expect(opcionesDeLaLlamada().keepalive).toBe(true);
  });

  it('manda la cookie de sesion y nada de tokens en el cuerpo', async () => {
    await completarSesionPublica(FORM_ID);

    const opciones = opcionesDeLaLlamada();
    expect(opciones.credentials).toBe('same-origin');
    expect(JSON.parse(String(opciones.body))).toEqual({ formId: FORM_ID });
  });
});

describe('guardarRespuestaPublica', () => {
  it('no usa keepalive: su cuerpo lo escribe quien responde y podria agotar la cuota de 64 KB', async () => {
    await guardarRespuestaPublica(FORM_ID, 'pregunta-1', 'hola');

    expect(opcionesDeLaLlamada().keepalive).toBeUndefined();
  });
});
