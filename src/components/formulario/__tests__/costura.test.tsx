/**
 * La costura entre la previsualización del editor y la experiencia pública.
 *
 * Es la razón de ser de la fase 4: el mismo componente sirve a las dos vistas y
 * **todo lo que las distingue entra por props**. Estos tests fijan esa promesa
 * para que la fase 5 y la fase 7 no puedan romperla sin que salte algo.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AnswersMap, ScreenRef } from '@/lib/forms';

import type { EventoAvance } from '../renderizador-formulario';

import { crearDefinicion, opciones, pintar } from './utiles';

const DEFINICION = crearDefinicion({
  blocks: [
    { id: 'b1', type: 'short_text', title: 'Tu nombre' },
    { id: 'b2', type: 'single_choice', title: '¿Vienes?', choices: opciones('Si', 'No') },
    { id: 'b3', type: 'short_text', title: 'Cuéntanos más' },
  ],
  rules: [
    {
      id: 'r1',
      sourceQuestionId: 'b2',
      operator: 'equals',
      value: 'no',
      priority: 1,
      target: { kind: 'end_screen', id: 'fin' },
    },
  ],
});

const RESPUESTAS: AnswersMap = { b1: 'Ada' };
const PANTALLA_B2: ScreenRef = { kind: 'block', id: 'b2' };

describe('mismo componente en las dos vistas', () => {
  it('el modo controlado y el no controlado producen el mismo marcado', () => {
    // Experiencia pública: el renderer se gobierna a sí mismo.
    const publica = pintar(DEFINICION, {
      respuestasIniciales: RESPUESTAS,
      pantallaInicial: PANTALLA_B2,
    });
    const marcadoPublico = publica.container.querySelector('form')?.innerHTML;
    publica.unmount();

    // Previsualización del editor: el estado lo lleva el editor por fuera.
    const editor = pintar(DEFINICION, {
      respuestas: RESPUESTAS,
      pantalla: PANTALLA_B2,
      enfocarAlCambiar: false,
      onRespuestasChange: vi.fn(),
      onPantallaChange: vi.fn(),
    });
    const marcadoEditor = editor.container.querySelector('form')?.innerHTML;

    expect(marcadoEditor).toBe(marcadoPublico);
    expect(marcadoPublico).toBeDefined();
  });

  it('en modo controlado la pantalla la manda quien renderiza', async () => {
    const usuario = userEvent.setup();
    const alCambiarPantalla = vi.fn();
    const alCambiarRespuestas = vi.fn();

    pintar(DEFINICION, {
      respuestas: RESPUESTAS,
      pantalla: PANTALLA_B2,
      enfocarAlCambiar: false,
      onPantallaChange: alCambiarPantalla,
      onRespuestasChange: alCambiarRespuestas,
    });

    await usuario.click(screen.getByRole('radio', { name: 'Si' }));
    expect(alCambiarRespuestas).toHaveBeenCalledWith({ b1: 'Ada', b2: 'si' });

    await usuario.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(alCambiarPantalla).toHaveBeenCalledWith({ kind: 'block', id: 'b3' });
    // El documento no ha cambiado: la pantalla sigue siendo la que impone la prop.
    expect(screen.getByRole('heading', { name: '¿Vienes?' })).toBeInTheDocument();
  });
});

describe('costura de persistencia', () => {
  it('`onAvanzar` recibe el destino que calcula el motor, con la lógica aplicada', async () => {
    const usuario = userEvent.setup();
    const avances: EventoAvance[] = [];

    pintar(DEFINICION, {
      pantallaInicial: PANTALLA_B2,
      respuestasIniciales: RESPUESTAS,
      onAvanzar: (evento) => {
        avances.push(evento);
      },
    });

    await usuario.click(screen.getByRole('radio', { name: 'No' }));
    await usuario.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => {
      expect(avances).toHaveLength(1);
    });
    const [avance] = avances;
    expect(avance?.desde).toEqual(PANTALLA_B2);
    expect(avance?.hacia).toEqual({ kind: 'end_screen', id: 'fin' });
    expect(avance?.respuesta).toEqual({ bloqueId: 'b2', valor: 'no' });
    expect(avance?.respuestas).toEqual({ b1: 'Ada', b2: 'no' });
  });

  it('si el guardado falla la pantalla no cambia y se explica por qué', async () => {
    const usuario = userEvent.setup();
    pintar(DEFINICION, {
      onAvanzar: () => Promise.reject(new Error('No hay conexión con el servidor')),
    });

    await usuario.keyboard('Ada{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No hay conexión con el servidor');
    });
    expect(screen.getByRole('heading', { name: 'Tu nombre' })).toBeInTheDocument();
  });

  it('sin `onAvanzar` el recorrido funciona igual: es la previsualización del editor', async () => {
    const usuario = userEvent.setup();
    pintar(DEFINICION);

    await usuario.keyboard('Ada{Enter}');
    expect(screen.getByRole('heading', { name: '¿Vienes?' })).toBeInTheDocument();

    await usuario.click(screen.getByRole('radio', { name: 'No' }));
    await usuario.click(screen.getByRole('button', { name: /enviar/i }));
    expect(screen.getByRole('heading', { name: '¡Gracias!' })).toBeInTheDocument();
  });

  it('`onCompletar` se invoca al llegar a una pantalla final', async () => {
    const usuario = userEvent.setup();
    const alCompletar = vi.fn();

    pintar(DEFINICION, {
      pantallaInicial: PANTALLA_B2,
      respuestasIniciales: RESPUESTAS,
      onCompletar: alCompletar,
    });

    await usuario.click(screen.getByRole('radio', { name: 'No' }));
    await usuario.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => {
      expect(alCompletar).toHaveBeenCalledWith({ b1: 'Ada', b2: 'no' });
    });
  });
});

/* -------------------------------------------------------------------------- */

/** Recorre los fuentes del renderer, sin los tests. */
function fuentesDelRenderer(directorio: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada !== '__tests__') fuentesDelRenderer(ruta, acumulado);
    } else if (/\.tsx?$/.test(entrada)) {
      acumulado.push(ruta);
    }
  }
  return acumulado;
}

describe('ni una sola rama de previsualización', () => {
  it('no existe ningún identificador de modo en el árbol de render', () => {
    const prohibido = /\b(esPreview|isPreview|esEditor|isEditor|esPublico|isPublic|modoRenderer)\b/;
    const fuentes = [
      ...fuentesDelRenderer(join(process.cwd(), 'src', 'components')),
      ...fuentesDelRenderer(join(process.cwd(), 'src', 'lib', 'theme')),
    ];

    expect(fuentes.length).toBeGreaterThan(10);
    for (const ruta of fuentes) {
      expect(readFileSync(ruta, 'utf8'), ruta).not.toMatch(prohibido);
    }
  });
});
