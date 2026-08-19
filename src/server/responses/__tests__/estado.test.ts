/**
 * Estado público y mensaje de un formulario que no admite respuestas.
 *
 * Módulo puro: no hace falta PostgreSQL.
 */

import { describe, expect, it } from 'vitest';

import { createDefaultFormDefinition, type FormDefinition } from '@/lib/forms';

import {
  MENSAJE_ARCHIVADO_POR_DEFECTO,
  MENSAJE_CERRADO_POR_DEFECTO,
  MENSAJE_SIN_PUBLICAR,
  estadoPublicoDe,
  mensajeDeEstado,
} from '../estado';

function conMensajeDeCierre(mensaje: string | undefined): FormDefinition {
  const base = createDefaultFormDefinition('Encuesta');
  return {
    ...base,
    meta: { ...base.meta, ...(mensaje === undefined ? {} : { closedMessage: mensaje }) },
  };
}

describe('estadoPublicoDe', () => {
  it('solo `published` con versión activa admite respuestas', () => {
    expect(estadoPublicoDe('published', true)).toBe('disponible');
  });

  it('sin versión activa siempre es `sin_publicar`, sea cual sea el estado', () => {
    for (const estado of ['draft', 'published', 'closed', 'archived'] as const) {
      expect(estadoPublicoDe(estado, false)).toBe('sin_publicar');
    }
  });

  it('distingue cerrado de archivado', () => {
    expect(estadoPublicoDe('closed', true)).toBe('cerrado');
    expect(estadoPublicoDe('archived', true)).toBe('archivado');
  });

  it('ante la duda no recoge respuestas: un borrador con versión activa es cerrado', () => {
    expect(estadoPublicoDe('draft', true)).toBe('cerrado');
  });
});

describe('mensajeDeEstado', () => {
  it('no hay mensaje cuando el formulario está disponible', () => {
    expect(mensajeDeEstado('disponible', conMensajeDeCierre('Da igual'))).toBeNull();
  });

  it('prefiere el mensaje configurado en el documento publicado', () => {
    const definicion = conMensajeDeCierre('Se acabó el plazo el 30 de junio.');
    expect(mensajeDeEstado('cerrado', definicion)).toBe('Se acabó el plazo el 30 de junio.');
    expect(mensajeDeEstado('archivado', definicion)).toBe('Se acabó el plazo el 30 de junio.');
  });

  it('cae al texto por defecto sin mensaje configurado', () => {
    const definicion = conMensajeDeCierre(undefined);
    expect(mensajeDeEstado('cerrado', definicion)).toBe(MENSAJE_CERRADO_POR_DEFECTO);
    expect(mensajeDeEstado('archivado', definicion)).toBe(MENSAJE_ARCHIVADO_POR_DEFECTO);
  });

  it('trata un mensaje en blanco como si no lo hubiera', () => {
    expect(mensajeDeEstado('cerrado', conMensajeDeCierre('   '))).toBe(
      MENSAJE_CERRADO_POR_DEFECTO,
    );
  });

  it('nunca es un 404 seco: sin versión también hay algo que contar', () => {
    expect(mensajeDeEstado('sin_publicar', null)).toBe(MENSAJE_SIN_PUBLICAR);
  });
});
