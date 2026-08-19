/**
 * Traducción entre `ScreenRef` y `response_sessions.current_question_id`.
 *
 * Módulo puro: no hace falta PostgreSQL.
 */

import { describe, expect, it } from 'vitest';

import { ending, makeForm, shortText, welcome } from '@/lib/forms/__tests__/fixtures';

import { idDePantalla, pantallaDesdeId } from '../pantalla';

const definicion = makeForm({
  blocks: [welcome('inicio'), shortText('nombre')],
  endScreens: [ending('gracias')],
});

describe('idDePantalla', () => {
  it('guarda el identificador de un bloque', () => {
    expect(idDePantalla({ kind: 'block', id: 'nombre' })).toBe('nombre');
  });

  it('guarda el identificador de una pantalla final', () => {
    expect(idDePantalla({ kind: 'end_screen', id: 'gracias' })).toBe('gracias');
  });

  it('guarda `null` cuando el recorrido termina sin pantalla final', () => {
    expect(idDePantalla({ kind: 'complete' })).toBeNull();
  });
});

describe('pantallaDesdeId', () => {
  it('reconoce un bloque del recorrido', () => {
    expect(pantallaDesdeId(definicion, 'nombre')).toEqual({ kind: 'block', id: 'nombre' });
  });

  it('reconoce una pantalla final', () => {
    expect(pantallaDesdeId(definicion, 'gracias')).toEqual({
      kind: 'end_screen',
      id: 'gracias',
    });
  });

  it('`null` significa recorrido terminado', () => {
    expect(pantallaDesdeId(definicion, null)).toEqual({ kind: 'complete' });
  });

  it('un identificador desconocido cae a la primera pantalla, no deja la sesión sin sitio', () => {
    expect(pantallaDesdeId(definicion, 'no-existe')).toEqual({
      kind: 'block',
      id: 'inicio',
    });
  });

  it('la ida y vuelta es estable para todas las pantallas del documento', () => {
    for (const bloque of definicion.blocks) {
      const ref = { kind: 'block', id: bloque.id } as const;
      expect(pantallaDesdeId(definicion, idDePantalla(ref))).toEqual(ref);
    }
    for (const pantalla of definicion.endScreens) {
      const ref = { kind: 'end_screen', id: pantalla.id } as const;
      expect(pantallaDesdeId(definicion, idDePantalla(ref))).toEqual(ref);
    }
  });
});
