import { describe, expect, it } from 'vitest';

import { conflictoDeRevision, httpStatusFor } from '../errors';
import { decideDraftWrite, revisionMatches } from '../revision';

const AHORA = new Date('2026-01-01T10:00:00.000Z');

describe('decideDraftWrite', () => {
  it('guarda cuando el UPDATE afectó a la fila', () => {
    const decision = decideDraftWrite(3, { revision: 4, updatedAt: AHORA }, 4);
    expect(decision).toEqual({ kind: 'saved', revision: 4, updatedAt: AHORA });
  });

  it('detecta que no hay borrador cuando el UPDATE no afectó y no existe la fila', () => {
    expect(decideDraftWrite(3, undefined, null)).toEqual({ kind: 'missing' });
  });

  it('detecta el conflicto y lleva la revisión del servidor', () => {
    expect(decideDraftWrite(3, undefined, 5)).toEqual({
      kind: 'conflict',
      expectedRevision: 3,
      serverRevision: 5,
    });
  });

  it('trata como conflicto una revisión del cliente mayor que la del servidor', () => {
    // Solo puede venir de un cliente corrupto: jamás se escribe a ciegas.
    expect(decideDraftWrite(9, undefined, 2)).toEqual({
      kind: 'conflict',
      expectedRevision: 9,
      serverRevision: 2,
    });
  });
});

describe('revisionMatches', () => {
  it('solo la igualdad exacta permite escribir', () => {
    expect(revisionMatches(4, 4)).toBe(true);
    expect(revisionMatches(3, 4)).toBe(false);
    expect(revisionMatches(5, 4)).toBe(false);
  });
});

describe('conflictoDeRevision', () => {
  it('es un 409 con las dos revisiones en el cuerpo', () => {
    const error = conflictoDeRevision(3, 5);
    expect(error.code).toBe('CONFLICTO_REVISION');
    expect(error.status).toBe(409);
    expect(httpStatusFor('CONFLICTO_REVISION')).toBe(409);
    expect(error.details).toEqual({ revisionEnviada: 3, revisionServidor: 5 });
  });

  it('lleva un mensaje en español y no filtra detalles internos', () => {
    const error = conflictoDeRevision(1, 2);
    expect(error.message).toMatch(/pestaña|Recarga/i);
    expect(error.message).not.toMatch(/postgres|select|update|password/i);
  });
});
