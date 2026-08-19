import { describe, expect, it } from 'vitest';

import {
  applyTransition,
  canEditDraft,
  type FormStateContext,
  type FormStatus,
} from '../status';

function contexto(overrides: Partial<FormStateContext> = {}): FormStateContext {
  return {
    status: 'draft',
    hasActiveVersion: false,
    wasClosed: false,
    ...overrides,
  };
}

describe('applyTransition · cerrar', () => {
  it('cierra un formulario publicado', () => {
    const resultado = applyTransition(
      contexto({ status: 'published', hasActiveVersion: true }),
      'close',
    );
    expect(resultado).toEqual({ ok: true, status: 'closed', changed: true });
  });

  it('es idempotente sobre uno ya cerrado', () => {
    const resultado = applyTransition(
      contexto({ status: 'closed', hasActiveVersion: true, wasClosed: true }),
      'close',
    );
    expect(resultado).toEqual({ ok: true, status: 'closed', changed: false });
  });

  it('rechaza cerrar un borrador nunca publicado', () => {
    const resultado = applyTransition(contexto({ status: 'draft' }), 'close');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.message).toMatch(/publicado/i);
    }
  });

  it('rechaza cerrar un formulario archivado', () => {
    const resultado = applyTransition(contexto({ status: 'archived' }), 'close');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.message).toMatch(/archivad/i);
    }
  });
});

describe('applyTransition · archivar', () => {
  it.each<FormStatus>(['draft', 'published', 'closed'])('archiva desde %s', (status) => {
    const resultado = applyTransition(contexto({ status }), 'archive');
    expect(resultado).toEqual({ ok: true, status: 'archived', changed: true });
  });

  it('es idempotente sobre uno ya archivado', () => {
    const resultado = applyTransition(contexto({ status: 'archived' }), 'archive');
    expect(resultado).toEqual({ ok: true, status: 'archived', changed: false });
  });
});

describe('applyTransition · desarchivar', () => {
  it('devuelve a borrador el que nunca se publicó', () => {
    const resultado = applyTransition(contexto({ status: 'archived' }), 'unarchive');
    expect(resultado).toEqual({ ok: true, status: 'draft', changed: true });
  });

  it('devuelve a publicado el que tenía versión activa', () => {
    const resultado = applyTransition(
      contexto({ status: 'archived', hasActiveVersion: true }),
      'unarchive',
    );
    expect(resultado).toEqual({ ok: true, status: 'published', changed: true });
  });

  it('devuelve a cerrado el que se archivó estando cerrado', () => {
    const resultado = applyTransition(
      contexto({ status: 'archived', hasActiveVersion: true, wasClosed: true }),
      'unarchive',
    );
    expect(resultado).toEqual({ ok: true, status: 'closed', changed: true });
  });

  it('no hace nada si no estaba archivado', () => {
    const resultado = applyTransition(contexto({ status: 'published' }), 'unarchive');
    expect(resultado).toEqual({ ok: true, status: 'published', changed: false });
  });
});

describe('canEditDraft', () => {
  it('solo el archivado es de solo lectura', () => {
    expect(canEditDraft('draft')).toBe(true);
    expect(canEditDraft('published')).toBe(true);
    expect(canEditDraft('closed')).toBe(true);
    expect(canEditDraft('archived')).toBe(false);
  });
});
