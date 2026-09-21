/**
 * Indexado del validador de publicación.
 *
 * Lo que se comprueba aquí no es *qué* detecta el validador —eso ya tiene su
 * batería en `lib/forms`— sino que cada problema llega al elemento correcto del
 * editor. Un aviso que no se puede pegar a su bloque o a su regla obliga a
 * buscarlo a mano, que es justo lo que la validación en vivo debería evitar.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THEME,
  SCHEMA_VERSION,
  formDefinitionSchema,
  type FormDefinition,
  type FormDefinitionInput,
} from '@/lib/forms';

import { analizarDocumento, avisosDeBloque, avisosDeRegla, tieneErrores } from '../diagnostico';

function documento(parcial: Partial<FormDefinitionInput>): FormDefinition {
  return formDefinitionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Prueba' },
    theme: DEFAULT_THEME,
    blocks: [],
    rules: [],
    endScreens: [{ id: 'fin', type: 'ending', title: 'Gracias' }],
    ...parcial,
  });
}

const PREGUNTAS: FormDefinitionInput['blocks'] = [
  { id: 'b1', type: 'short_text', title: 'Nombre' },
  { id: 'b2', type: 'short_text', title: 'Apellidos' },
];

describe('analizarDocumento', () => {
  it('un documento correcto es publicable y no tiene avisos', () => {
    const diagnostico = analizarDocumento(documento({ blocks: PREGUNTAS }));
    expect(diagnostico.publicable).toBe(true);
    expect(diagnostico.errores).toHaveLength(0);
  });

  it('indexa por regla el destino inexistente', () => {
    const diagnostico = analizarDocumento(
      documento({
        blocks: PREGUNTAS,
        rules: [
          {
            id: 'r1',
            sourceQuestionId: 'b1',
            operator: 'is_not_empty',
            value: null,
            priority: 1,
            target: { kind: 'block', id: 'no-existe' },
          },
        ],
      }),
    );

    expect(diagnostico.publicable).toBe(false);
    const avisos = avisosDeRegla(diagnostico, 'r1');
    expect(avisos.map((aviso) => aviso.codigo)).toContain('RULE_TARGET_NOT_FOUND');
    expect(tieneErrores(avisos)).toBe(true);
  });

  it('indexa por regla y por bloque el salto hacia atrás', () => {
    const diagnostico = analizarDocumento(
      documento({
        blocks: PREGUNTAS,
        rules: [
          {
            id: 'r1',
            sourceQuestionId: 'b2',
            operator: 'is_not_empty',
            value: null,
            priority: 1,
            target: { kind: 'block', id: 'b1' },
          },
        ],
      }),
    );

    expect(avisosDeRegla(diagnostico, 'r1').map((aviso) => aviso.codigo)).toContain(
      'RULE_TARGET_BACKWARD',
    );
    expect(avisosDeBloque(diagnostico, 'b2').map((aviso) => aviso.codigo)).toContain(
      'RULE_TARGET_BACKWARD',
    );
  });

  it('señala el bloque inalcanzable', () => {
    const diagnostico = analizarDocumento(
      documento({
        blocks: [
          // Obligatoria: `is_not_empty` se cumple entonces siempre, así que la
          // rama secuencial hacia «b2» no existe en ningún recorrido.
          { id: 'b1', type: 'short_text', title: 'Nombre', required: true },
          { id: 'b2', type: 'short_text', title: 'Saltado' },
          { id: 'b3', type: 'short_text', title: 'Final' },
        ],
        rules: [
          {
            id: 'r1',
            sourceQuestionId: 'b1',
            operator: 'is_not_empty',
            value: null,
            priority: 1,
            target: { kind: 'block', id: 'b3' },
          },
        ],
      }),
    );

    const avisos = avisosDeBloque(diagnostico, 'b2');
    expect(avisos.map((aviso) => aviso.codigo)).toContain('UNREACHABLE_BLOCK');
  });

  it('señala las reglas contradictorias en todas las implicadas', () => {
    const diagnostico = analizarDocumento(
      documento({
        blocks: PREGUNTAS,
        rules: [
          {
            id: 'r1',
            sourceQuestionId: 'b1',
            operator: 'equals',
            value: 'x',
            priority: 1,
            target: { kind: 'block', id: 'b2' },
          },
          {
            id: 'r2',
            sourceQuestionId: 'b1',
            operator: 'equals',
            value: 'x',
            priority: 2,
            target: { kind: 'end_screen', id: 'fin' },
          },
        ],
      }),
    );

    expect(avisosDeRegla(diagnostico, 'r1').map((aviso) => aviso.codigo)).toContain(
      'CONTRADICTORY_RULES',
    );
    expect(avisosDeRegla(diagnostico, 'r2').map((aviso) => aviso.codigo)).toContain(
      'CONTRADICTORY_RULES',
    );
  });

  it('distingue advertencias de errores', () => {
    const diagnostico = analizarDocumento(
      documento({ blocks: [{ id: 'b1', type: 'statement', title: 'Solo un aviso' }] }),
    );
    expect(diagnostico.publicable).toBe(true);
    expect(diagnostico.advertencias.map((aviso) => aviso.codigo)).toContain('NO_QUESTIONS');
    expect(tieneErrores(diagnostico.advertencias)).toBe(false);
  });
});
