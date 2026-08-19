/**
 * Operaciones del editor sobre el documento.
 *
 * El foco está en la integridad referencial: lo que se rompe al borrar y al
 * reordenar es lo que después impide publicar sin que el usuario sepa por qué.
 * Todos los resultados se vuelven a pasar por `formDefinitionSchema` para
 * comprobar que ninguna operación puede producir un documento ilegible.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THEME,
  SCHEMA_VERSION,
  formDefinitionSchema,
  type FormDefinition,
} from '@/lib/forms';

import {
  anadirBloque,
  anadirOpcion,
  anadirPantallaFinal,
  anadirRegla,
  cambiarTipoDeBloque,
  desplazarBloque,
  desplazarRegla,
  duplicarBloque,
  eliminarBloque,
  eliminarOpcion,
  eliminarPantallaFinal,
  identificadoresOcupados,
  marcarPantallaPorDefecto,
  moverBloque,
  siguientePrioridad,
} from '../documento';

function base(): FormDefinition {
  return formDefinitionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Prueba' },
    theme: DEFAULT_THEME,
    blocks: [
      { id: 'b1', type: 'short_text', title: 'Nombre' },
      {
        id: 'b2',
        type: 'single_choice',
        title: 'Color',
        choices: [
          { id: 'op1', label: 'Rojo', value: 'rojo' },
          { id: 'op2', label: 'Azul', value: 'azul' },
        ],
      },
      { id: 'b3', type: 'rating', title: 'Valoración', scale: 5 },
    ],
    rules: [
      {
        id: 'r1',
        sourceQuestionId: 'b2',
        operator: 'equals',
        value: 'rojo',
        priority: 1,
        target: { kind: 'block', id: 'b3' },
      },
    ],
    endScreens: [{ id: 'fin', type: 'ending', title: 'Gracias' }],
  });
}

/** Toda operación debe devolver algo que el contrato siga aceptando. */
function valido(definicion: FormDefinition): FormDefinition {
  return formDefinitionSchema.parse(definicion);
}

describe('identificadoresOcupados', () => {
  it('recoge bloques, opciones, pantallas y reglas', () => {
    expect([...identificadoresOcupados(base())].sort()).toEqual([
      'b1',
      'b2',
      'b3',
      'fin',
      'op1',
      'op2',
      'r1',
    ]);
  });
});

describe('anadirBloque', () => {
  it('añade al final y devuelve el bloque creado con identificador libre', () => {
    const { definicion, bloque } = anadirBloque(base(), 'email');
    expect(definicion.blocks).toHaveLength(4);
    expect(definicion.blocks[3]?.id).toBe(bloque.id);
    expect(identificadoresOcupados(base()).has(bloque.id)).toBe(false);
    valido(definicion);
  });

  it('coloca la bienvenida siempre la primera', () => {
    const { definicion } = anadirBloque(base(), 'welcome', 2);
    expect(definicion.blocks[0]?.type).toBe('welcome');
    valido(definicion);
  });

  it('no admite una segunda bienvenida', () => {
    const primera = anadirBloque(base(), 'welcome').definicion;
    const segunda = anadirBloque(primera, 'welcome').definicion;
    expect(segunda.blocks.filter((bloque) => bloque.type === 'welcome')).toHaveLength(1);
  });

  it('nunca inserta por delante de la bienvenida', () => {
    const conBienvenida = anadirBloque(base(), 'welcome').definicion;
    const { definicion } = anadirBloque(conBienvenida, 'email', 0);
    expect(definicion.blocks[0]?.type).toBe('welcome');
  });
});

describe('eliminarBloque', () => {
  it('borra también las reglas que salen de él', () => {
    const resultado = eliminarBloque(base(), 'b2');
    expect(resultado.blocks.map((bloque) => bloque.id)).toEqual(['b1', 'b3']);
    expect(resultado.rules).toHaveLength(0);
    valido(resultado);
  });

  it('borra también las reglas que apuntaban a él', () => {
    const resultado = eliminarBloque(base(), 'b3');
    expect(resultado.rules).toHaveLength(0);
    valido(resultado);
  });
});

describe('duplicarBloque', () => {
  it('inserta la copia detrás, con identificadores nuevos también en las opciones', () => {
    const resultado = duplicarBloque(base(), 'b2');
    const copia = resultado.blocks[2];
    expect(resultado.blocks).toHaveLength(4);
    expect(copia?.id).not.toBe('b2');
    expect(copia?.title).toBe('Color (copia)');
    if (copia !== undefined && copia.type === 'single_choice') {
      expect(copia.choices.map((opcion) => opcion.id)).not.toContain('op1');
      // Los valores sí se conservan: son lo que compara la lógica.
      expect(copia.choices.map((opcion) => opcion.value)).toEqual(['rojo', 'azul']);
    }
    valido(resultado);
  });

  it('no duplica las reglas del original', () => {
    expect(duplicarBloque(base(), 'b2').rules).toHaveLength(1);
  });
});

describe('moverBloque y desplazarBloque', () => {
  it('reordena el recorrido', () => {
    const resultado = moverBloque(base(), 0, 2);
    expect(resultado.blocks.map((bloque) => bloque.id)).toEqual(['b2', 'b3', 'b1']);
    valido(resultado);
  });

  it('desplazar respeta los extremos', () => {
    const documento = base();
    expect(desplazarBloque(documento, 'b1', -1)).toBe(documento);
    expect(desplazarBloque(documento, 'b3', 1)).toBe(documento);
    expect(desplazarBloque(documento, 'b1', 1).blocks[0]?.id).toBe('b2');
  });

  it('no toca las reglas: un salto que queda hacia atrás lo denuncia el validador', () => {
    const resultado = moverBloque(base(), 2, 0);
    expect(resultado.rules[0]?.target).toEqual({ kind: 'block', id: 'b3' });
  });
});

describe('opciones', () => {
  it('añade opciones con identificador y valor libres', () => {
    const resultado = anadirOpcion(base(), 'b2');
    const bloque = resultado.blocks[1];
    expect(bloque?.type).toBe('single_choice');
    if (bloque?.type !== 'single_choice') return;
    expect(bloque.choices).toHaveLength(3);
    expect(new Set(bloque.choices.map((opcion) => opcion.value)).size).toBe(3);
    valido(resultado);
  });

  it('al eliminar una opción limpia las reglas que la comparaban', () => {
    const resultado = eliminarOpcion(base(), 'b2', 'op1');
    expect(resultado.rules).toHaveLength(0);
    valido(resultado);
  });

  it('no deja una pregunta de selección sin opciones', () => {
    const conUna = eliminarOpcion(base(), 'b2', 'op1');
    const resultado = eliminarOpcion(conUna, 'b2', 'op2');
    const bloque = resultado.blocks[1];
    if (bloque?.type !== 'single_choice') return;
    expect(bloque.choices).toHaveLength(1);
  });
});

describe('pantallas finales', () => {
  it('añade una nueva con identificador libre', () => {
    const { definicion, pantalla } = anadirPantallaFinal(base());
    expect(definicion.endScreens).toHaveLength(2);
    expect(pantalla.id).not.toBe('fin');
    valido(definicion);
  });

  it('no deja el documento sin ninguna', () => {
    const documento = base();
    expect(eliminarPantallaFinal(documento, 'fin')).toBe(documento);
  });

  it('al eliminar una, desengancha las reglas que la tenían por destino', () => {
    const { definicion } = anadirPantallaFinal(base());
    const nueva = definicion.endScreens[1];
    if (nueva === undefined) return;
    const conRegla = anadirRegla(definicion, {
      sourceQuestionId: 'b1',
      operator: 'is_empty',
      value: null,
      target: { kind: 'end_screen', id: nueva.id },
    }).definicion;
    const resultado = eliminarPantallaFinal(conRegla, nueva.id);
    expect(resultado.rules.map((regla) => regla.id)).toEqual(['r1']);
    valido(resultado);
  });

  it('al eliminar la que era por defecto, deja de serlo', () => {
    const { definicion } = anadirPantallaFinal(base());
    const nueva = definicion.endScreens[1];
    if (nueva === undefined) return;
    const marcada = marcarPantallaPorDefecto(definicion, nueva.id);
    expect(marcada.defaultEndScreenId).toBe(nueva.id);
    expect(eliminarPantallaFinal(marcada, nueva.id).defaultEndScreenId).toBeUndefined();
  });
});

describe('reglas', () => {
  it('asigna la primera prioridad libre del mismo origen', () => {
    expect(siguientePrioridad(base(), 'b2')).toBe(2);
    expect(siguientePrioridad(base(), 'b1')).toBe(1);
  });

  it('desplazar una regla reescribe las prioridades sin huecos ni empates', () => {
    let documento = base();
    documento = anadirRegla(documento, {
      sourceQuestionId: 'b2',
      operator: 'equals',
      value: 'azul',
      target: { kind: 'end_screen', id: 'fin' },
    }).definicion;

    const segunda = documento.rules[1];
    if (segunda === undefined) return;
    expect(segunda.priority).toBe(2);

    const resultado = desplazarRegla(documento, segunda.id, -1);
    const prioridades = new Map(resultado.rules.map((regla) => [regla.id, regla.priority]));
    expect(prioridades.get(segunda.id)).toBe(1);
    expect(prioridades.get('r1')).toBe(2);
    valido(resultado);
  });
});

describe('cambiarTipoDeBloque', () => {
  it('conserva el identificador, el título y las reglas que apuntan al bloque', () => {
    const resultado = cambiarTipoDeBloque(base(), 'b3', 'scale');
    const bloque = resultado.blocks[2];
    expect(bloque?.id).toBe('b3');
    expect(bloque?.type).toBe('scale');
    expect(bloque?.title).toBe('Valoración');
    expect(resultado.rules[0]?.target).toEqual({ kind: 'block', id: 'b3' });
    valido(resultado);
  });

  it('al convertir una pregunta en declaración, borra las reglas que salían de ella', () => {
    const resultado = cambiarTipoDeBloque(base(), 'b2', 'statement');
    expect(resultado.blocks[1]?.type).toBe('statement');
    expect(resultado.rules).toHaveLength(0);
    valido(resultado);
  });
});
