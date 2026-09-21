import { describe, expect, it } from 'vitest';

import {
  FORMS_ERROR_CODES,
  FormsError,
  borradorNoEncontrado,
  datosInvalidos,
  formularioNoEncontrado,
  httpStatusFor,
  isFormsError,
  noAutenticado,
  transicionInvalida,
} from '../errors';

describe('FormsError', () => {
  it('deriva el estado HTTP del código', () => {
    expect(noAutenticado().status).toBe(401);
    expect(formularioNoEncontrado().status).toBe(404);
    expect(borradorNoEncontrado().status).toBe(404);
    expect(datosInvalidos('mal').status).toBe(400);
    expect(transicionInvalida('no procede').status).toBe(409);
    expect(new FormsError('ERROR_INTERNO', 'vaya').status).toBe(500);
  });

  it('tiene un estado definido para todos los códigos del contrato', () => {
    for (const code of FORMS_ERROR_CODES) {
      expect(httpStatusFor(code)).toBeGreaterThanOrEqual(400);
    }
  });

  it('se reconoce con `isFormsError` y no confunde otros errores', () => {
    expect(isFormsError(noAutenticado())).toBe(true);
    expect(isFormsError(new Error('cualquiera'))).toBe(false);
    expect(isFormsError(null)).toBe(false);
    expect(isFormsError({ code: 'NO_AUTENTICADO' })).toBe(false);
  });

  it('lleva los mensajes en español y sin detalles internos', () => {
    const mensajes = [
      noAutenticado().message,
      formularioNoEncontrado().message,
      borradorNoEncontrado().message,
      transicionInvalida('No se puede cerrar un formulario archivado.').message,
    ];
    for (const mensaje of mensajes) {
      expect(mensaje.length).toBeGreaterThan(0);
      expect(mensaje).not.toMatch(/postgres(ql)?:\/\/|select |insert |stack|Error:/i);
    }
  });

  it('transporta detalles estructurados cuando los hay', () => {
    const error = datosInvalidos('Los datos enviados no son válidos.', {
      issues: [{ path: 'title', message: 'El título no puede estar vacío' }],
    });
    expect(error.details).toEqual({
      issues: [{ path: 'title', message: 'El título no puede estar vacío' }],
    });
  });
});
