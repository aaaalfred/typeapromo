/**
 * Catálogo de preguntas y lectura de valores.
 *
 * Es la pieza que sostiene la promesa del versionado: **cada respuesta se
 * interpreta con el snapshot de su propia versión**, aunque el panel muestre una
 * sola tabla con varias versiones dentro. Aquí se comprueba sin base de datos;
 * la otra mitad —que publicar de nuevo no mueva un resultado ya guardado— está
 * en `resultados.integration.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { FormDefinition, QuestionDefinition } from '@/lib/forms';
import {
  makeForm,
  multiChoice,
  rating,
  shortText,
  singleChoice,
} from '@/lib/forms/__tests__/fixtures';

import {
  construirCatalogo,
  esValorVacio,
  etiquetaDeOpcion,
  indexarCatalogo,
  textoDeRespuesta,
  type VersionEnAlcance,
} from '../catalogo';

function version(id: string, versionNumber: number, definition: FormDefinition): VersionEnAlcance {
  return { id, versionNumber, definition };
}

/** Recupera la definición de una pregunta en una versión, o falla el test. */
function preguntaDe(definition: FormDefinition, id: string): QuestionDefinition {
  const bloque = definition.blocks.find((candidato) => candidato.id === id);
  if (bloque === undefined) throw new Error(`El fixture no contiene «${id}»`);
  return bloque as QuestionDefinition;
}

/** Selección única con etiquetas propias, para distinguir versiones. */
function seleccionEtiquetada(id: string, etiquetas: Readonly<Record<string, string>>) {
  const base = singleChoice(id, Object.keys(etiquetas));
  return {
    ...base,
    choices: base.choices.map((opcion) => ({
      ...opcion,
      label: etiquetas[opcion.value] ?? opcion.label,
    })),
  };
}

describe('construirCatalogo', () => {
  it('une las preguntas por identificador estable y guarda cada versión', () => {
    const v1 = version('v1', 1, makeForm({ blocks: [singleChoice('perfil', ['a']), shortText('nota')] }));
    const v2 = version('v2', 2, makeForm({ blocks: [singleChoice('perfil', ['a', 'b'])] }));

    const catalogo = construirCatalogo([v1, v2]);

    expect(catalogo.map((entrada) => entrada.questionId)).toEqual(['perfil', 'nota']);

    const perfil = indexarCatalogo(catalogo).get('perfil');
    expect(perfil?.porVersion.size).toBe(2);
    // La v2 amplió las opciones; la definición de la v1 sigue intacta.
    expect(perfil?.porVersion.get('v1')).toEqual(preguntaDe(v1.definition, 'perfil'));
    expect(perfil?.porVersion.get('v2')).toEqual(preguntaDe(v2.definition, 'perfil'));
  });

  it('el título y el tipo visibles vienen de la versión más reciente', () => {
    const antigua = makeForm({ blocks: [shortText('campo')] });
    const nueva = makeForm({ blocks: [rating('campo', { scale: 5 })] });

    // Se pasan desordenadas a propósito: manda `versionNumber`, no el orden.
    const catalogo = construirCatalogo([version('v2', 2, nueva), version('v1', 1, antigua)]);

    expect(catalogo[0]?.tipo).toBe('rating');
    expect(catalogo[0]?.titulo).toBe('Valoración campo');
    expect(catalogo[0]?.tiposMixtos).toBe(true);
  });

  it('sin cambio de tipo no hay tipos mixtos', () => {
    const catalogo = construirCatalogo([
      version('v1', 1, makeForm({ blocks: [shortText('campo')] })),
      version('v2', 2, makeForm({ blocks: [shortText('campo')] })),
    ]);
    expect(catalogo[0]?.tiposMixtos).toBe(false);
  });

  it('los bloques sin respuesta no entran en el catálogo', () => {
    const definicion = makeForm({ blocks: [shortText('nota')] });
    // `makeForm` añade la pantalla final; el bloque de bienvenida y las
    // declaraciones tampoco recogen respuesta.
    expect(construirCatalogo([version('v1', 1, definicion)])).toHaveLength(1);
  });

  it('sin versiones el catálogo está vacío', () => {
    expect(construirCatalogo([])).toEqual([]);
  });
});

describe('textoDeRespuesta', () => {
  const v1 = makeForm({
    blocks: [
      seleccionEtiquetada('perfil', { cliente: 'Soy cliente', proveedor: 'Soy proveedor' }),
      multiChoice('canales', ['email', 'slack']),
    ],
  });
  const v2 = makeForm({
    blocks: [
      seleccionEtiquetada('perfil', { cliente: 'ETIQUETA REESCRITA', proveedor: 'Otra' }),
      multiChoice('canales', ['email', 'slack']),
    ],
  });

  it('traduce el valor a la etiqueta de la versión de esa respuesta', () => {
    // La misma respuesta, leída con dos contratos distintos: cada una conserva
    // el texto que vio quien respondió.
    expect(textoDeRespuesta(preguntaDe(v1, 'perfil'), 'cliente')).toBe('Soy cliente');
    expect(textoDeRespuesta(preguntaDe(v2, 'perfil'), 'cliente')).toBe('ETIQUETA REESCRITA');
  });

  it('une la selección múltiple con punto y coma', () => {
    expect(textoDeRespuesta(preguntaDe(v1, 'canales'), ['email', 'slack'])).toBe('email; slack');
  });

  it('el texto libre sale completo, sin recortar ni interpretar', () => {
    const largo = `Línea uno\nLínea dos con "comillas", comas y acentuación. ${'x'.repeat(500)}`;
    expect(textoDeRespuesta(preguntaDe(v1, 'perfil'), largo)).toBe(largo);
  });

  it('sin definición conocida serializa el valor bruto en lugar de inventárselo', () => {
    expect(textoDeRespuesta(null, 'cliente')).toBe('cliente');
    expect(textoDeRespuesta(null, 4)).toBe('4');
    expect(textoDeRespuesta(null, { a: 1 })).toBe('{"a":1}');
  });

  it('los valores vacíos se leen como celda en blanco', () => {
    expect(textoDeRespuesta(preguntaDe(v1, 'perfil'), null)).toBe('');
    expect(textoDeRespuesta(preguntaDe(v1, 'canales'), [])).toBe('');
    expect(textoDeRespuesta(preguntaDe(v1, 'perfil'), '   ')).toBe('');
  });

  it('una opción que la versión ya no conoce se muestra por su valor', () => {
    expect(textoDeRespuesta(preguntaDe(v1, 'perfil'), 'desaparecida')).toBe('desaparecida');
    expect(etiquetaDeOpcion(preguntaDe(v1, 'perfil'), 'proveedor')).toBe('Soy proveedor');
  });
});

describe('esValorVacio', () => {
  it('distingue el blanco de la ausencia de respuesta', () => {
    expect(esValorVacio(null)).toBe(true);
    expect(esValorVacio(undefined)).toBe(true);
    expect(esValorVacio('')).toBe(true);
    expect(esValorVacio('  ')).toBe(true);
    expect(esValorVacio([])).toBe(true);

    // El cero y el `false` son respuestas, no huecos.
    expect(esValorVacio(0)).toBe(false);
    expect(esValorVacio(false)).toBe(false);
    expect(esValorVacio(['a'])).toBe(false);
  });
});
