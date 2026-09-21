import { describe, expect, it } from 'vitest';

import { createDefaultFormDefinition } from '../definition';
import {
  validateDefinition,
  validateForPublication,
  type ValidationErrorCode,
  type ValidationReport,
  type ValidationWarningCode,
} from '../validate';
import {
  date,
  ending,
  longText,
  makeForm,
  makeRawForm,
  multiChoice,
  rating,
  rule,
  scale,
  shortText,
  singleChoice,
  statement,
  toBlock,
  toEnd,
  welcome,
} from './fixtures';

const errorCodes = (report: ValidationReport): ValidationErrorCode[] =>
  report.errors.map((error) => error.code);
const warningCodes = (report: ValidationReport): ValidationWarningCode[] =>
  report.warnings.map((warning) => warning.code);

/* -------------------------------------------------------------------------- */

describe('documento válido', () => {
  it('un formulario completo pasa sin errores ni advertencias', () => {
    const definition = makeForm({
      blocks: [
        welcome(),
        singleChoice('q1', ['a', 'b']),
        shortText('q2'),
        rating('q3', { scale: 5 }),
      ],
      rules: [rule('salta', 'q1', 'equals', 'a', toBlock('q3'), 1)],
    });
    const report = validateForPublication(definition);

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.definition).not.toBeNull();
  });

  it('el documento por defecto es publicable, solo avisa de que no hay preguntas', () => {
    const report = validateForPublication(createDefaultFormDefinition('Nuevo'));
    expect(report.ok).toBe(true);
    expect(warningCodes(report)).toEqual(['NO_QUESTIONS']);
  });

  it('validateDefinition funciona sobre un documento ya parseado', () => {
    const definition = makeForm({ blocks: [shortText('q1')] });
    expect(validateDefinition(definition).errors).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */

describe('errores de esquema', () => {
  it('un documento que no encaja en el contrato no llega a validarse semánticamente', () => {
    const report = validateForPublication({ hola: 'mundo' });
    expect(report.ok).toBe(false);
    expect(report.definition).toBeNull();
    expect(new Set(errorCodes(report))).toEqual(new Set(['SCHEMA_INVALID']));
  });

  it('cada error de esquema lleva su ruta dentro del documento', () => {
    const report = validateForPublication(
      makeRawForm({ blocks: [{ id: 'q1', type: 'short_text' }] }),
    );
    expect(report.ok).toBe(false);
    const first = report.errors[0];
    expect(first?.code).toBe('SCHEMA_INVALID');
    expect(first?.path).toContain('blocks');
  });
});

/* -------------------------------------------------------------------------- */

describe('estructura del documento', () => {
  it('detecta un formulario sin bloques', () => {
    expect(errorCodes(validateForPublication(makeForm({ blocks: [] })))).toContain('NO_BLOCKS');
  });

  it('detecta un formulario sin pantallas finales', () => {
    const report = validateForPublication(makeForm({ blocks: [shortText('q1')], endScreens: [] }));
    expect(errorCodes(report)).toContain('NO_END_SCREENS');
  });

  it('avisa de un formulario que no recoge ninguna respuesta', () => {
    const report = validateForPublication(makeForm({ blocks: [statement('s')] }));
    expect(warningCodes(report)).toContain('NO_QUESTIONS');
  });

  it('detecta identificadores de bloque repetidos', () => {
    const report = validateForPublication(
      makeForm({ blocks: [shortText('q1'), longText('q1')] }),
    );
    expect(errorCodes(report)).toContain('DUPLICATE_BLOCK_ID');
  });

  it('detecta identificadores de pantalla final repetidos', () => {
    const report = validateForPublication(
      makeForm({ blocks: [shortText('q1')], endScreens: [ending('end'), ending('end')] }),
    );
    expect(errorCodes(report)).toContain('DUPLICATE_END_SCREEN_ID');
  });

  it('detecta un identificador compartido entre bloque y pantalla final', () => {
    const report = validateForPublication(
      makeForm({ blocks: [shortText('q1'), shortText('dup')], endScreens: [ending('dup')] }),
    );
    expect(errorCodes(report)).toContain('ID_COLLISION');
  });

  it('valida la URL de redirección en las pantallas finales', () => {
    const validReport = validateForPublication(
      makeForm({
        blocks: [shortText('q1')],
        endScreens: [ending('end', { redirectUrl: 'https://ejemplo.com/gracias' })],
      }),
    );
    expect(validReport.ok).toBe(true);

    const invalidReport = validateForPublication(
      makeRawForm({
        blocks: [shortText('q1')],
        endScreens: [ending('end', { redirectUrl: 'javascript:alert(1)' as unknown as string })],
      }),
    );
    expect(invalidReport.ok).toBe(false);
    expect(errorCodes(invalidReport)).toContain('SCHEMA_INVALID');

    const semanticReport = validateDefinition({
      ...makeForm({ blocks: [shortText('q1')] }),
      endScreens: [{ ...ending('end'), redirectUrl: 'ftp://invalido.com' }],
    });
    expect(semanticReport.errors.map((e) => e.code)).toContain('INVALID_REDIRECT_URL');
  });

  it('detecta identificadores de regla repetidos', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [shortText('q1'), shortText('q2'), shortText('q3')],
        rules: [
          rule('r', 'q1', 'is_not_empty', null, toBlock('q2'), 1),
          rule('r', 'q1', 'is_empty', null, toBlock('q3'), 2),
        ],
      }),
    );
    expect(errorCodes(report)).toContain('DUPLICATE_RULE_ID');
  });

  it('solo admite una bienvenida y siempre la primera', () => {
    const report = validateForPublication(
      makeForm({ blocks: [welcome('w1'), welcome('w2'), shortText('q1')] }),
    );
    expect(errorCodes(report)).toContain('MULTIPLE_WELCOME_BLOCKS');
    expect(errorCodes(report)).toContain('WELCOME_NOT_FIRST');
  });

  it('detecta una pantalla final por defecto inexistente', () => {
    const report = validateForPublication(
      makeForm({ blocks: [shortText('q1')], defaultEndScreenId: 'fantasma' }),
    );
    expect(errorCodes(report)).toContain('DEFAULT_END_SCREEN_NOT_FOUND');
  });
});

/* -------------------------------------------------------------------------- */

describe('configuración de los bloques', () => {
  it('detecta opciones con identificador repetido', () => {
    const report = validateForPublication(
      makeRawForm({
        blocks: [
          {
            id: 'c',
            type: 'single_choice',
            title: 'Elige',
            choices: [
              { id: 'o1', label: 'A', value: 'a' },
              { id: 'o1', label: 'B', value: 'b' },
            ],
          },
        ],
      }),
    );
    expect(errorCodes(report)).toContain('DUPLICATE_CHOICE_ID');
  });

  it('detecta opciones con valor repetido, que harían ambiguas las reglas', () => {
    const report = validateForPublication(
      makeRawForm({
        blocks: [
          {
            id: 'c',
            type: 'single_choice',
            title: 'Elige',
            choices: [
              { id: 'o1', label: 'A', value: 'a' },
              { id: 'o2', label: 'Otra A', value: 'a' },
            ],
          },
        ],
      }),
    );
    expect(errorCodes(report)).toContain('DUPLICATE_CHOICE_VALUE');
  });

  it('avisa de opciones sin imagen en una presentación visual', () => {
    const report = validateForPublication(
      makeForm({ blocks: [singleChoice('c', ['a', 'b'], { presentation: 'image_cards' })] }),
    );
    expect(warningCodes(report)).toContain('CHOICE_IMAGE_MISSING');
  });

  it('detecta límites de selección inalcanzables', () => {
    const report = validateForPublication(
      makeForm({ blocks: [multiChoice('m', ['a', 'b'], { minSelections: 3 })] }),
    );
    expect(errorCodes(report)).toContain('INVALID_SELECTION_RANGE');
  });

  it('detecta una escala con el mínimo por encima del máximo', () => {
    const report = validateForPublication(
      makeForm({ blocks: [scale('s', { min: 8, max: 3 })] }),
    );
    expect(errorCodes(report)).toContain('INVALID_SCALE_RANGE');
  });

  it('detecta un paso que no permite alcanzar el máximo', () => {
    const report = validateForPublication(
      makeForm({ blocks: [scale('s', { min: 1, max: 10, step: 4 })] }),
    );
    expect(errorCodes(report)).toContain('INVALID_SCALE_STEP');
  });

  it('detecta una longitud mínima mayor que la máxima', () => {
    const report = validateForPublication(
      makeRawForm({
        blocks: [
          {
            id: 't',
            type: 'short_text',
            title: 'Texto',
            validation: { minLength: 10, maxLength: 5 },
          },
        ],
      }),
    );
    expect(errorCodes(report)).toContain('INVALID_TEXT_LENGTH_RANGE');
  });

  it('detecta una expresión regular que no compila', () => {
    const report = validateForPublication(
      makeRawForm({
        blocks: [{ id: 't', type: 'short_text', title: 'Texto', validation: { pattern: '([' } }],
      }),
    );
    expect(errorCodes(report)).toContain('INVALID_TEXT_PATTERN');
  });

  it('detecta un rango de fechas invertido', () => {
    const report = validateForPublication(
      makeRawForm({
        blocks: [
          {
            id: 'd',
            type: 'date',
            title: 'Fecha',
            validation: { min: '2026-12-31', max: '2026-01-01' },
          },
        ],
      }),
    );
    expect(errorCodes(report)).toContain('INVALID_DATE_RANGE');
  });
});

/* -------------------------------------------------------------------------- */

describe('reglas: origen y destino', () => {
  it('detecta un origen inexistente', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [shortText('q1'), shortText('q2')],
        rules: [rule('r', 'fantasma', 'is_not_empty', null, toBlock('q2'))],
      }),
    );
    expect(errorCodes(report)).toContain('RULE_SOURCE_NOT_FOUND');
  });

  it('detecta un origen que no recoge respuesta', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [statement('nota'), shortText('q1'), shortText('q2')],
        rules: [rule('r', 'nota', 'is_not_empty', null, toBlock('q2'))],
      }),
    );
    expect(errorCodes(report)).toContain('RULE_SOURCE_NOT_A_QUESTION');
  });

  it('detecta un destino inexistente, sea bloque o pantalla final', () => {
    const aBloque = validateForPublication(
      makeForm({
        blocks: [shortText('q1'), shortText('q2')],
        rules: [rule('r', 'q1', 'is_not_empty', null, toBlock('fantasma'))],
      }),
    );
    expect(errorCodes(aBloque)).toContain('RULE_TARGET_NOT_FOUND');

    const aFinal = validateForPublication(
      makeForm({
        blocks: [shortText('q1'), shortText('q2')],
        rules: [rule('r', 'q1', 'is_not_empty', null, toEnd('fantasma'))],
      }),
    );
    expect(errorCodes(aFinal)).toContain('RULE_TARGET_NOT_FOUND');
  });

  it('detecta un salto hacia atrás', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [shortText('q1'), shortText('q2'), shortText('q3')],
        rules: [rule('r', 'q3', 'is_not_empty', null, toBlock('q1'))],
      }),
    );
    expect(errorCodes(report)).toContain('RULE_TARGET_BACKWARD');
  });

  it('detecta un salto a la propia pregunta', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [shortText('q1'), shortText('q2')],
        rules: [rule('r', 'q1', 'is_not_empty', null, toBlock('q1'))],
      }),
    );
    expect(errorCodes(report)).toContain('RULE_TARGET_SELF');
  });

  it('el error de salto hacia atrás identifica origen y destino, no solo un texto', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [shortText('q1'), shortText('q2'), shortText('q3')],
        rules: [rule('vuelve', 'q3', 'is_not_empty', null, toBlock('q1'))],
      }),
    );
    const error = report.errors.find((candidate) => candidate.code === 'RULE_TARGET_BACKWARD');
    expect(error).toBeDefined();
    if (error?.code === 'RULE_TARGET_BACKWARD') {
      expect(error.ruleId).toBe('vuelve');
      expect(error.sourceQuestionId).toBe('q3');
      expect(error.targetId).toBe('q1');
      expect(error.path).toEqual(['rules', 0, 'target']);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe('reglas: operador y valor', () => {
  it('rechaza un operador que no aplica al tipo de pregunta', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [shortText('q1'), shortText('q2')],
        rules: [rule('r', 'q1', 'greater_than', 5, toBlock('q2'))],
      }),
    );
    expect(errorCodes(report)).toContain('RULE_OPERATOR_NOT_APPLICABLE');
  });

  it('rechaza selección múltiple con un operador de orden', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [multiChoice('m', ['a', 'b']), shortText('q2')],
        rules: [rule('r', 'm', 'less_than', 2, toBlock('q2'))],
      }),
    );
    expect(errorCodes(report)).toContain('RULE_OPERATOR_NOT_APPLICABLE');
  });

  it('exige valor en los operadores binarios', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [shortText('q1'), shortText('q2')],
        rules: [rule('r', 'q1', 'equals', null, toBlock('q2'))],
      }),
    );
    expect(errorCodes(report)).toContain('RULE_VALUE_REQUIRED');
  });

  it('prohíbe valor en los operadores unarios', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [shortText('q1'), shortText('q2')],
        rules: [rule('r', 'q1', 'is_empty', 'algo', toBlock('q2'))],
      }),
    );
    expect(errorCodes(report)).toContain('RULE_VALUE_NOT_ALLOWED');
  });

  it('exige el tipo de valor adecuado a cada pregunta', () => {
    const numerica = validateForPublication(
      makeForm({
        blocks: [scale('s', { min: 1, max: 10 }), shortText('q2')],
        rules: [rule('r', 's', 'equals', 'cinco', toBlock('q2'))],
      }),
    );
    expect(errorCodes(numerica)).toContain('RULE_VALUE_TYPE_INVALID');

    const fecha = validateForPublication(
      makeForm({
        blocks: [date('d'), shortText('q2')],
        rules: [rule('r', 'd', 'equals', '01/01/2026', toBlock('q2'))],
      }),
    );
    expect(errorCodes(fecha)).toContain('RULE_VALUE_TYPE_INVALID');

    const texto = validateForPublication(
      makeForm({
        blocks: [shortText('t'), shortText('q2')],
        rules: [rule('r', 't', 'equals', 42, toBlock('q2'))],
      }),
    );
    expect(errorCodes(texto)).toContain('RULE_VALUE_TYPE_INVALID');

    const seleccion = validateForPublication(
      makeForm({
        blocks: [singleChoice('c', ['a']), shortText('q2')],
        rules: [rule('r', 'c', 'equals', 7, toBlock('q2'))],
      }),
    );
    expect(errorCodes(seleccion)).toContain('RULE_VALUE_TYPE_INVALID');
  });

  it('detecta una opción inexistente en la condición', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [singleChoice('c', ['a', 'b']), shortText('q2')],
        rules: [rule('r', 'c', 'equals', 'z', toBlock('q2'))],
      }),
    );
    expect(errorCodes(report)).toContain('RULE_CHOICE_NOT_FOUND');
  });

  it('detecta un valor numérico fuera del rango de la pregunta', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [rating('r1', { scale: 5 }), shortText('q2')],
        rules: [rule('r', 'r1', 'greater_than', 99, toBlock('q2'))],
      }),
    );
    expect(errorCodes(report)).toContain('RULE_VALUE_OUT_OF_RANGE');
  });
});

/* -------------------------------------------------------------------------- */

describe('reglas contradictorias', () => {
  it('detecta dos reglas con la misma condición y destinos distintos', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [singleChoice('q1', ['a', 'b']), shortText('q2'), shortText('q3'), shortText('q4')],
        rules: [
          rule('uno', 'q1', 'equals', 'a', toBlock('q3'), 1),
          rule('dos', 'q1', 'equals', 'a', toBlock('q4'), 2),
        ],
      }),
    );
    const error = report.errors.find((candidate) => candidate.code === 'CONTRADICTORY_RULES');
    expect(error).toBeDefined();
    if (error?.code === 'CONTRADICTORY_RULES') {
      expect(error.ruleIds).toEqual(['uno', 'dos']);
      expect(error.sourceQuestionId).toBe('q1');
      expect(error.operator).toBe('equals');
    }
  });

  it('considera equivalentes dos listas con los mismos valores en otro orden', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [multiChoice('q1', ['a', 'b']), shortText('q2'), shortText('q3'), shortText('q4')],
        rules: [
          rule('uno', 'q1', 'is_selected', ['a', 'b'], toBlock('q3'), 1),
          rule('dos', 'q1', 'is_selected', ['b', 'a'], toBlock('q4'), 2),
        ],
      }),
    );
    expect(errorCodes(report)).toContain('CONTRADICTORY_RULES');
  });

  it('avisa cuando dos reglas idénticas llevan al mismo destino', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [singleChoice('q1', ['a', 'b']), shortText('q2'), shortText('q3')],
        rules: [
          rule('uno', 'q1', 'equals', 'a', toBlock('q3'), 1),
          rule('dos', 'q1', 'equals', 'a', toBlock('q3'), 2),
        ],
      }),
    );
    expect(warningCodes(report)).toContain('REDUNDANT_RULES');
    expect(errorCodes(report)).not.toContain('CONTRADICTORY_RULES');
  });

  it('rechaza dos reglas del mismo origen con la misma prioridad', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [singleChoice('q1', ['a', 'b']), shortText('q2'), shortText('q3'), shortText('q4')],
        rules: [
          rule('uno', 'q1', 'equals', 'a', toBlock('q3'), 1),
          rule('dos', 'q1', 'equals', 'b', toBlock('q4'), 1),
        ],
      }),
    );
    const error = report.errors.find((candidate) => candidate.code === 'DUPLICATE_RULE_PRIORITY');
    expect(error).toBeDefined();
    if (error?.code === 'DUPLICATE_RULE_PRIORITY') {
      expect(error.priority).toBe(1);
      expect(error.ruleIds).toEqual(['uno', 'dos']);
    }
  });

  it('avisa de una regla que no puede cumplirse nunca', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [shortText('q1', { required: true }), shortText('q2'), shortText('q3')],
        rules: [rule('muerta', 'q1', 'is_empty', null, toBlock('q3'))],
      }),
    );
    expect(warningCodes(report)).toContain('DEAD_RULE');
  });

  it('avisa de una regla tapada por otra de más prioridad que se cumple siempre', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [
          shortText('q1', { required: true }),
          shortText('q2'),
          shortText('q3'),
          shortText('q4'),
        ],
        rules: [
          rule('siempre', 'q1', 'is_not_empty', null, toBlock('q3'), 1),
          rule('tapada', 'q1', 'equals', 'x', toBlock('q4'), 2),
        ],
      }),
    );
    const warning = report.warnings.find((candidate) => candidate.code === 'SHADOWED_RULE');
    expect(warning).toBeDefined();
    if (warning?.code === 'SHADOWED_RULE') {
      expect(warning.ruleId).toBe('tapada');
      expect(warning.byRuleId).toBe('siempre');
    }
  });
});

/* -------------------------------------------------------------------------- */

describe('alcanzabilidad', () => {
  it('detecta una pregunta a la que no llega ningún recorrido', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [
          shortText('q1', { required: true }),
          shortText('saltada'),
          shortText('q3'),
        ],
        rules: [rule('siempre', 'q1', 'is_not_empty', null, toBlock('q3'))],
      }),
    );
    const error = report.errors.find((candidate) => candidate.code === 'UNREACHABLE_BLOCK');
    expect(error).toBeDefined();
    if (error?.code === 'UNREACHABLE_BLOCK') {
      expect(error.blockId).toBe('saltada');
    }
  });

  it('una bifurcación normal no deja nada inalcanzable', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [singleChoice('q1', ['a', 'b']), shortText('q2'), shortText('q3')],
        rules: [rule('salta', 'q1', 'equals', 'a', toBlock('q3'))],
      }),
    );
    expect(errorCodes(report)).not.toContain('UNREACHABLE_BLOCK');
  });

  it('avisa de una pantalla final a la que no llega ningún recorrido', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [shortText('q1')],
        endScreens: [ending('end'), ending('huerfana')],
      }),
    );
    const warning = report.warnings.find(
      (candidate) => candidate.code === 'UNREACHABLE_END_SCREEN',
    );
    expect(warning).toBeDefined();
    if (warning?.code === 'UNREACHABLE_END_SCREEN') {
      expect(warning.endScreenId).toBe('huerfana');
    }
  });

  it('una pantalla final usada por una regla sí es alcanzable', () => {
    const report = validateForPublication(
      makeForm({
        blocks: [singleChoice('q1', ['a', 'b']), shortText('q2')],
        endScreens: [ending('end'), ending('descartado')],
        rules: [rule('fuera', 'q1', 'equals', 'b', toEnd('descartado'))],
      }),
    );
    expect(warningCodes(report)).not.toContain('UNREACHABLE_END_SCREEN');
  });
});
