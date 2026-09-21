import { describe, expect, it } from 'vitest';

import type {
  AnswerValue,
  AnswersMap,
  BlockDefinition,
  LogicOperator,
  LogicValue,
} from '../definition';
import {
  UnknownScreenError,
  countReachableQuestions,
  evaluateOperator,
  firstScreen,
  indexForm,
  nextScreen,
  progressFor,
  reachableFrom,
  staticRuleOutcome,
  walkPath,
  type ScreenRef,
} from '../engine';
import {
  blockOf,
  date,
  email,
  ending,
  longText,
  makeForm,
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

const block = (id: string): ScreenRef => ({ kind: 'block', id });
const endScreen = (id: string): ScreenRef => ({ kind: 'end_screen', id });
const complete: ScreenRef = { kind: 'complete' };

/* -------------------------------------------------------------------------- */

describe('flujo secuencial', () => {
  const definition = makeForm({
    blocks: [welcome(), statement('intro'), shortText('q1'), shortText('q2')],
  });

  it('la primera pantalla es el primer bloque', () => {
    expect(firstScreen(definition)).toEqual(block('welcome'));
    expect(nextScreen(definition, {}, null)).toEqual(block('welcome'));
  });

  it('avanza bloque a bloque cuando no hay reglas', () => {
    expect(nextScreen(definition, {}, 'welcome')).toEqual(block('intro'));
    expect(nextScreen(definition, {}, 'intro')).toEqual(block('q1'));
    expect(nextScreen(definition, { q1: 'hola' }, 'q1')).toEqual(block('q2'));
  });

  it('al caer del último bloque muestra la pantalla final por defecto', () => {
    expect(nextScreen(definition, { q2: 'hola' }, 'q2')).toEqual(endScreen('end'));
  });

  it('respeta defaultEndScreenId cuando se declara', () => {
    const withDefault = makeForm({
      blocks: [shortText('q1')],
      endScreens: [ending('primera'), ending('elegida')],
      defaultEndScreenId: 'elegida',
    });
    expect(nextScreen(withDefault, {}, 'q1')).toEqual(endScreen('elegida'));
  });

  it('sin pantallas finales el recorrido simplemente termina', () => {
    const sinFinal = makeForm({ blocks: [shortText('q1')], endScreens: [] });
    expect(nextScreen(sinFinal, {}, 'q1')).toEqual(complete);
    expect(firstScreen(makeForm({ blocks: [], endScreens: [] }))).toEqual(complete);
  });

  it('un formulario sin bloques arranca directamente en la pantalla final', () => {
    expect(firstScreen(makeForm({ blocks: [] }))).toEqual(endScreen('end'));
  });

  it('desde una pantalla final el recorrido ya ha terminado', () => {
    expect(nextScreen(definition, {}, 'end')).toEqual(complete);
  });

  it('lanza UnknownScreenError con un identificador que no existe', () => {
    expect(() => nextScreen(definition, {}, 'fantasma')).toThrow(UnknownScreenError);
    expect(() => reachableFrom(definition, {}, 'fantasma')).toThrow(UnknownScreenError);
  });
});

/* -------------------------------------------------------------------------- */

describe('prioridad de las reglas', () => {
  const definition = makeForm({
    blocks: [singleChoice('q1', ['a', 'b']), shortText('q2'), shortText('q3'), shortText('q4')],
    rules: [
      // Declarada primero pero con prioridad peor: no debe ganar.
      rule('baja', 'q1', 'is_not_empty', null, toBlock('q4'), 5),
      rule('alta', 'q1', 'equals', 'a', toBlock('q3'), 1),
    ],
  });

  it('gana la regla de prioridad más baja, no la primera del array', () => {
    expect(nextScreen(definition, { q1: 'a' }, 'q1')).toEqual(block('q3'));
  });

  it('si la de más prioridad no se cumple, se evalúa la siguiente', () => {
    expect(nextScreen(definition, { q1: 'b' }, 'q1')).toEqual(block('q4'));
  });

  it('sin ninguna regla cumplida se sigue el orden secuencial', () => {
    expect(nextScreen(definition, { q1: null }, 'q1')).toEqual(block('q2'));
  });

  it('el índice ordena las reglas por prioridad ascendente', () => {
    const index = indexForm(definition);
    expect(index.rulesBySource.get('q1')?.map((r) => r.id)).toEqual(['alta', 'baja']);
  });

  it('las reglas de otro origen no afectan al bloque actual', () => {
    expect(nextScreen(definition, { q1: 'a' }, 'q2')).toEqual(block('q3'));
  });
});

/* -------------------------------------------------------------------------- */

describe('solo saltos hacia adelante', () => {
  const back = makeForm({
    blocks: [shortText('q1'), shortText('q2'), shortText('q3')],
    rules: [rule('atras', 'q3', 'is_not_empty', null, toBlock('q1'))],
  });

  it('ignora un salto hacia atrás y continúa secuencialmente', () => {
    expect(nextScreen(back, { q3: 'algo' }, 'q3')).toEqual(endScreen('end'));
  });

  it('ignora un salto a la propia pregunta', () => {
    const self = makeForm({
      blocks: [shortText('q1'), shortText('q2')],
      rules: [rule('yo', 'q1', 'is_not_empty', null, toBlock('q1'))],
    });
    expect(nextScreen(self, { q1: 'algo' }, 'q1')).toEqual(block('q2'));
  });

  it('ignora un destino inexistente', () => {
    const ghost = makeForm({
      blocks: [shortText('q1'), shortText('q2')],
      rules: [rule('fantasma', 'q1', 'is_not_empty', null, toBlock('q9'))],
    });
    expect(nextScreen(ghost, { q1: 'algo' }, 'q1')).toEqual(block('q2'));
  });

  it('ignora una pantalla final inexistente', () => {
    const ghost = makeForm({
      blocks: [shortText('q1'), shortText('q2')],
      rules: [rule('fantasma', 'q1', 'is_not_empty', null, toEnd('nope'))],
    });
    expect(nextScreen(ghost, { q1: 'algo' }, 'q1')).toEqual(block('q2'));
  });

  it('el recorrido siempre termina, incluso con un documento con ciclos', () => {
    const cyclic = makeForm({
      blocks: [shortText('q1'), shortText('q2'), shortText('q3')],
      rules: [
        rule('adelante', 'q1', 'is_not_empty', null, toBlock('q3')),
        rule('atras', 'q3', 'is_not_empty', null, toBlock('q1')),
      ],
    });
    const path = walkPath(cyclic, { q1: 'x', q3: 'y' });
    expect(path).toEqual([block('q1'), block('q3'), endScreen('end')]);
  });

  it('salta a una pantalla final concreta', () => {
    const definition = makeForm({
      blocks: [singleChoice('q1', ['si', 'no']), shortText('q2')],
      endScreens: [ending('end'), ending('descartado')],
      rules: [rule('fuera', 'q1', 'equals', 'no', toEnd('descartado'))],
    });
    expect(nextScreen(definition, { q1: 'no' }, 'q1')).toEqual(endScreen('descartado'));
    expect(nextScreen(definition, { q1: 'si' }, 'q1')).toEqual(block('q2'));
  });
});

/* -------------------------------------------------------------------------- */

describe('casos límite de saltos', () => {
  it('un salto al bloque inmediatamente siguiente equivale al flujo secuencial', () => {
    const definition = makeForm({
      blocks: [shortText('q1'), shortText('q2'), shortText('q3')],
      rules: [rule('r', 'q1', 'is_not_empty', null, toBlock('q2'))],
    });
    expect(nextScreen(definition, { q1: 'x' }, 'q1')).toEqual(block('q2'));
  });

  it('encadena varios saltos sin volver a los bloques intermedios', () => {
    const definition = makeForm({
      blocks: [
        shortText('q1'),
        shortText('q2'),
        shortText('q3'),
        shortText('q4'),
        shortText('q5'),
      ],
      rules: [
        rule('uno', 'q1', 'is_not_empty', null, toBlock('q3')),
        rule('dos', 'q3', 'is_not_empty', null, toBlock('q5')),
      ],
    });
    expect(walkPath(definition, { q1: 'x', q3: 'y', q5: 'z' })).toEqual([
      block('q1'),
      block('q3'),
      block('q5'),
      endScreen('end'),
    ]);
  });

  it('un salto desde el último bloque a la pantalla final funciona igual', () => {
    const definition = makeForm({
      blocks: [shortText('q1')],
      endScreens: [ending('end'), ending('otra')],
      rules: [rule('r', 'q1', 'is_not_empty', null, toEnd('otra'))],
    });
    expect(nextScreen(definition, { q1: 'x' }, 'q1')).toEqual(endScreen('otra'));
    expect(nextScreen(definition, { q1: '' }, 'q1')).toEqual(endScreen('end'));
  });

  it('un salto que se dispara sobre una pregunta dejada en blanco sigue siendo válido', () => {
    const definition = makeForm({
      blocks: [shortText('q1'), shortText('q2'), shortText('q3')],
      rules: [rule('vacia', 'q1', 'is_empty', null, toBlock('q3'))],
    });
    expect(nextScreen(definition, { q1: '' }, 'q1')).toEqual(block('q3'));
    expect(nextScreen(definition, { q1: 'algo' }, 'q1')).toEqual(block('q2'));
  });

  it('con la respuesta todavía sin registrar se evalúa como vacía', () => {
    const definition = makeForm({
      blocks: [shortText('q1'), shortText('q2'), shortText('q3')],
      rules: [rule('vacia', 'q1', 'is_empty', null, toBlock('q3'))],
    });
    expect(nextScreen(definition, {}, 'q1')).toEqual(block('q3'));
  });
});

/* -------------------------------------------------------------------------- */

describe('cada tipo de pregunta puede condicionar un salto', () => {
  const definition = makeForm({
    blocks: [
      shortText('short_text'),
      longText('long_text'),
      email('email'),
      date('date'),
      singleChoice('single_choice', ['a', 'b']),
      multiChoice('multi_choice', ['a', 'b']),
      scale('scale', { min: 1, max: 10 }),
      rating('rating', { scale: 5 }),
      shortText('relleno'),
      shortText('destino'),
    ],
    rules: [
      rule('r-short_text', 'short_text', 'equals', 'salta', toBlock('destino'), 1),
      rule('r-long_text', 'long_text', 'contains', 'salta', toBlock('destino'), 1),
      rule('r-email', 'email', 'contains', '@salta.com', toBlock('destino'), 1),
      rule('r-date', 'date', 'greater_than', '2026-01-01', toBlock('destino'), 1),
      rule('r-single_choice', 'single_choice', 'equals', 'a', toBlock('destino'), 1),
      rule('r-multi_choice', 'multi_choice', 'is_selected', 'b', toBlock('destino'), 1),
      rule('r-scale', 'scale', 'greater_or_equal', 8, toBlock('destino'), 1),
      rule('r-rating', 'rating', 'less_than', 3, toBlock('destino'), 1),
    ],
  });

  const matching: readonly [string, AnswerValue, AnswerValue][] = [
    ['short_text', 'salta', 'quieto'],
    ['long_text', 'esto salta seguro', 'esto no'],
    ['email', 'yo@salta.com', 'yo@quieto.com'],
    ['date', '2026-06-01', '2025-06-01'],
    ['single_choice', 'a', 'b'],
    ['multi_choice', ['a', 'b'], ['a']],
    ['scale', 9, 2],
    ['rating', 1, 5],
  ];

  it.each(matching)(
    'la regla de %s salta con la respuesta que la cumple y no con la que no',
    (id, matches, doesNotMatch) => {
      expect(nextScreen(definition, { [id]: matches }, id)).toEqual(block('destino'));
      const sequential = nextScreen(definition, { [id]: doesNotMatch }, id);
      expect(sequential).not.toEqual(block('destino'));
    },
  );
});

/* -------------------------------------------------------------------------- */

describe('operadores', () => {
  const definition = makeForm({
    blocks: [
      shortText('texto'),
      singleChoice('unica', ['a', 'b', 'c']),
      multiChoice('multi', ['a', 'b', 'c']),
      scale('escala', { min: 1, max: 10 }),
      rating('valoracion', { scale: 5 }),
      date('fecha'),
    ],
  });
  const b = (id: string): BlockDefinition => blockOf(definition, id);

  const check = (
    blockId: string,
    operator: LogicOperator,
    answer: AnswerValue | undefined,
    value: LogicValue,
  ): boolean => evaluateOperator(operator, b(blockId), answer, value);

  it('equals compara texto sin distinguir mayúsculas ni espacios sobrantes', () => {
    expect(check('texto', 'equals', ' Hola ', 'hola')).toBe(true);
    expect(check('texto', 'equals', 'adiós', 'hola')).toBe(false);
  });

  it('equals compara los valores de opción de forma exacta', () => {
    expect(check('unica', 'equals', 'a', 'a')).toBe(true);
    expect(check('unica', 'equals', 'A', 'a')).toBe(false);
  });

  it('equals compara números y fechas por valor', () => {
    expect(check('escala', 'equals', 7, 7)).toBe(true);
    expect(check('escala', 'equals', 7, 8)).toBe(false);
    expect(check('fecha', 'equals', '2026-03-01', '2026-03-01')).toBe(true);
    expect(check('fecha', 'equals', '2026-03-02', '2026-03-01')).toBe(false);
  });

  it('equals sobre selección múltiple compara el conjunto completo', () => {
    expect(check('multi', 'equals', ['a', 'b'], ['b', 'a'])).toBe(true);
    expect(check('multi', 'equals', ['a'], ['a', 'b'])).toBe(false);
  });

  it('not_equals es el complemento y se cumple con respuesta vacía', () => {
    expect(check('texto', 'not_equals', 'adiós', 'hola')).toBe(true);
    expect(check('texto', 'not_equals', 'hola', 'hola')).toBe(false);
    expect(check('texto', 'not_equals', '', 'hola')).toBe(true);
    expect(check('texto', 'not_equals', undefined, 'hola')).toBe(true);
  });

  it('contains busca dentro del texto y dentro de la selección múltiple', () => {
    expect(check('texto', 'contains', 'Buenos días', 'DÍAS')).toBe(true);
    expect(check('texto', 'contains', 'Buenos días', 'tardes')).toBe(false);
    expect(check('multi', 'contains', ['a', 'b'], 'a')).toBe(true);
    expect(check('multi', 'contains', ['a', 'b'], ['a', 'b'])).toBe(true);
    expect(check('multi', 'contains', ['a', 'b'], ['a', 'c'])).toBe(false);
  });

  it('not_contains es el complemento y se cumple con respuesta vacía', () => {
    expect(check('texto', 'not_contains', 'Buenos días', 'tardes')).toBe(true);
    expect(check('texto', 'not_contains', 'Buenos días', 'días')).toBe(false);
    expect(check('multi', 'not_contains', [], 'a')).toBe(true);
  });

  it('greater_than y greater_or_equal comparan escalas y ratings', () => {
    expect(check('escala', 'greater_than', 7, 5)).toBe(true);
    expect(check('escala', 'greater_than', 5, 5)).toBe(false);
    expect(check('escala', 'greater_or_equal', 5, 5)).toBe(true);
    expect(check('valoracion', 'greater_or_equal', 4, 4)).toBe(true);
    expect(check('valoracion', 'greater_than', 2, 4)).toBe(false);
  });

  it('less_than y less_or_equal comparan escalas y ratings', () => {
    expect(check('escala', 'less_than', 3, 5)).toBe(true);
    expect(check('escala', 'less_than', 5, 5)).toBe(false);
    expect(check('escala', 'less_or_equal', 5, 5)).toBe(true);
  });

  it('las comparaciones ordenadas funcionan sobre fechas', () => {
    expect(check('fecha', 'greater_than', '2026-06-01', '2026-01-01')).toBe(true);
    expect(check('fecha', 'less_than', '2025-06-01', '2026-01-01')).toBe(true);
    expect(check('fecha', 'greater_or_equal', '2026-01-01', '2026-01-01')).toBe(true);
    expect(check('fecha', 'less_or_equal', '2026-01-01', '2026-01-01')).toBe(true);
  });

  it('una comparación sin sentido no se cumple en lugar de romper', () => {
    expect(check('escala', 'greater_than', 5, 'cinco')).toBe(false);
    expect(check('fecha', 'greater_than', 'ayer', '2026-01-01')).toBe(false);
    expect(check('texto', 'contains', 'hola', 3)).toBe(false);
  });

  it('is_selected acepta un valor o una lista de valores', () => {
    expect(check('unica', 'is_selected', 'a', 'a')).toBe(true);
    expect(check('unica', 'is_selected', 'a', ['a', 'b'])).toBe(true);
    expect(check('unica', 'is_selected', 'c', ['a', 'b'])).toBe(false);
    expect(check('multi', 'is_selected', ['a', 'c'], 'c')).toBe(true);
    expect(check('multi', 'is_selected', ['a', 'c'], ['b', 'c'])).toBe(true);
    expect(check('multi', 'is_selected', ['a'], ['b', 'c'])).toBe(false);
  });

  it('is_not_selected es el complemento y se cumple con respuesta vacía', () => {
    expect(check('multi', 'is_not_selected', ['a'], 'b')).toBe(true);
    expect(check('multi', 'is_not_selected', ['a'], 'a')).toBe(false);
    expect(check('multi', 'is_not_selected', [], 'a')).toBe(true);
  });

  it('is_empty e is_not_empty detectan la presencia de respuesta', () => {
    expect(check('texto', 'is_empty', undefined, null)).toBe(true);
    expect(check('texto', 'is_empty', null, null)).toBe(true);
    expect(check('texto', 'is_empty', '   ', null)).toBe(true);
    expect(check('multi', 'is_empty', [], null)).toBe(true);
    expect(check('texto', 'is_not_empty', 'algo', null)).toBe(true);
    expect(check('escala', 'is_not_empty', 0, null)).toBe(true);
    expect(check('texto', 'is_not_empty', '', null)).toBe(false);
  });

  it('las comparaciones ordinarias no se cumplen con respuesta vacía', () => {
    for (const operator of ['equals', 'contains', 'is_selected', 'greater_than', 'less_than'] as const) {
      expect(check('texto', operator, '', 'x')).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe('análisis estático de reglas', () => {
  const definition = makeForm({
    blocks: [
      shortText('obligatoria', { required: true }),
      shortText('opcional'),
      scale('escala', { required: true, min: 1, max: 10 }),
      rating('valoracion', { required: true, scale: 5 }),
      singleChoice('unica', ['a', 'b'], { required: true }),
      singleChoice('sola', ['unica-opcion'], { required: true }),
    ],
  });
  const outcome = (
    blockId: string,
    operator: LogicOperator,
    value: LogicValue,
  ): 'always' | 'never' | 'maybe' =>
    staticRuleOutcome(
      { id: 'r', sourceQuestionId: blockId, operator, value, priority: 1, target: { kind: 'block', id: 'z' } },
      blockOf(definition, blockId),
    );

  it('is_not_empty se cumple siempre en una pregunta obligatoria', () => {
    expect(outcome('obligatoria', 'is_not_empty', null)).toBe('always');
    expect(outcome('opcional', 'is_not_empty', null)).toBe('maybe');
  });

  it('is_empty no se cumple nunca en una pregunta obligatoria', () => {
    expect(outcome('obligatoria', 'is_empty', null)).toBe('never');
    expect(outcome('opcional', 'is_empty', null)).toBe('maybe');
  });

  it('detecta comparaciones numéricas imposibles', () => {
    expect(outcome('escala', 'equals', 99)).toBe('never');
    expect(outcome('escala', 'greater_than', 10)).toBe('never');
    expect(outcome('escala', 'less_than', 1)).toBe('never');
    expect(outcome('valoracion', 'greater_than', 5)).toBe('never');
    expect(outcome('valoracion', 'equals', 6)).toBe('never');
  });

  it('detecta comparaciones numéricas que siempre se cumplen', () => {
    expect(outcome('escala', 'greater_or_equal', 1)).toBe('always');
    expect(outcome('escala', 'less_or_equal', 10)).toBe('always');
    expect(outcome('escala', 'not_equals', 99)).toBe('always');
    expect(outcome('escala', 'greater_than', 5)).toBe('maybe');
  });

  it('detecta opciones inexistentes', () => {
    expect(outcome('unica', 'equals', 'z')).toBe('never');
    expect(outcome('unica', 'is_selected', 'z')).toBe('never');
    expect(outcome('unica', 'not_equals', 'z')).toBe('always');
    expect(outcome('unica', 'equals', 'a')).toBe('maybe');
  });

  it('una pregunta obligatoria con una sola opción hace la regla constante', () => {
    expect(outcome('sola', 'equals', 'unica-opcion')).toBe('always');
  });
});

/* -------------------------------------------------------------------------- */

describe('reachableFrom', () => {
  const linear = makeForm({
    blocks: [welcome(), shortText('q1'), shortText('q2'), shortText('q3')],
  });

  it('en un recorrido lineal alcanza todas las preguntas y es determinista', () => {
    const reachable = reachableFrom(linear, {}, 'welcome');
    expect(reachable.blocks).toEqual(['welcome', 'q1', 'q2', 'q3']);
    expect(reachable.questions).toEqual(['q1', 'q2', 'q3']);
    expect(reachable.endScreens).toEqual(['end']);
    expect(reachable.deterministic).toBe(true);
  });

  it('desde la mitad solo cuenta lo que queda por delante', () => {
    expect(reachableFrom(linear, { q1: 'x' }, 'q2').questions).toEqual(['q2', 'q3']);
    expect(countReachableQuestions(linear, { q1: 'x' }, 'q2')).toBe(2);
  });

  const branching = makeForm({
    blocks: [singleChoice('q1', ['a', 'b']), shortText('q2'), shortText('q3'), shortText('q4')],
    endScreens: [ending('end'), ending('corto')],
    rules: [
      rule('salta', 'q1', 'equals', 'a', toBlock('q3'), 1),
      rule('corta', 'q1', 'equals', 'b', toEnd('corto'), 2),
    ],
  });

  it('sin respuesta suma todas las ramas todavía posibles', () => {
    const reachable = reachableFrom(branching, {}, 'q1');
    expect(reachable.questions).toEqual(['q1', 'q2', 'q3', 'q4']);
    expect(reachable.endScreens).toEqual(['end', 'corto']);
    expect(reachable.deterministic).toBe(false);
  });

  it('con la respuesta ya dada la rama queda resuelta', () => {
    const reachable = reachableFrom(branching, { q1: 'a' }, 'q1');
    expect(reachable.questions).toEqual(['q1', 'q3', 'q4']);
    expect(reachable.endScreens).toEqual(['end']);
    expect(reachable.deterministic).toBe(true);
  });

  it('una rama que termina antes recorta el total', () => {
    const reachable = reachableFrom(branching, { q1: 'b' }, 'q1');
    expect(reachable.questions).toEqual(['q1']);
    expect(reachable.endScreens).toEqual(['corto']);
  });

  it('una respuesta que no dispara ninguna regla sigue el orden secuencial', () => {
    expect(reachableFrom(branching, { q1: null }, 'q1').questions).toEqual([
      'q1',
      'q2',
      'q3',
      'q4',
    ]);
  });

  it('desde una pantalla final no queda nada por delante', () => {
    const reachable = reachableFrom(branching, { q1: 'b' }, 'corto');
    expect(reachable.questions).toEqual([]);
    expect(reachable.endScreens).toEqual(['corto']);
    expect(reachable.deterministic).toBe(true);
  });

  it('una regla que se cumple siempre deja bloques fuera del recorrido', () => {
    const forced = makeForm({
      blocks: [
        shortText('q1', { required: true }),
        shortText('q2'),
        shortText('q3'),
      ],
      rules: [rule('siempre', 'q1', 'is_not_empty', null, toBlock('q3'))],
    });
    expect(reachableFrom(forced, {}, 'q1').questions).toEqual(['q1', 'q3']);
  });

  it('una regla que no se cumple nunca no abre ninguna rama', () => {
    const dead = makeForm({
      blocks: [scale('q1', { min: 1, max: 5 }), shortText('q2'), shortText('q3')],
      endScreens: [ending('end'), ending('imposible')],
      rules: [rule('muerta', 'q1', 'greater_than', 99, toEnd('imposible'))],
    });
    const reachable = reachableFrom(dead, {}, 'q1');
    expect(reachable.questions).toEqual(['q1', 'q2', 'q3']);
    expect(reachable.endScreens).toEqual(['end']);
    expect(reachable.deterministic).toBe(true);
  });

  it('sin pantalla actual arranca desde el principio del formulario', () => {
    expect(reachableFrom(linear, {}, null).blocks).toEqual(['welcome', 'q1', 'q2', 'q3']);
  });
});

/* -------------------------------------------------------------------------- */

describe('progressFor', () => {
  const definition = makeForm({
    blocks: [welcome(), shortText('q1'), shortText('q2'), shortText('q3')],
  });

  it('empieza en cero y no cuenta las pantallas sin respuesta', () => {
    const progress = progressFor(definition, {}, 'welcome');
    expect(progress).toMatchObject({ answered: 0, remaining: 3, total: 3, ratio: 0 });
  });

  it('avanza conforme se responden las preguntas', () => {
    expect(progressFor(definition, { q1: 'a' }, 'q2')).toMatchObject({
      answered: 1,
      remaining: 2,
      total: 3,
    });
    expect(progressFor(definition, { q1: 'a', q2: 'b' }, 'q3')).toMatchObject({
      answered: 2,
      remaining: 1,
      total: 3,
    });
  });

  it('llega a uno en la pantalla final', () => {
    const progress = progressFor(definition, { q1: 'a', q2: 'b', q3: 'c' }, 'end');
    expect(progress.ratio).toBe(1);
    expect(progress.total).toBe(3);
  });

  it('el total se recalcula con el recorrido efectivo, no con el total del documento', () => {
    const branching = makeForm({
      blocks: [singleChoice('q1', ['corto', 'largo']), shortText('q2'), shortText('q3')],
      rules: [rule('atajo', 'q1', 'equals', 'corto', toEnd('end'))],
    });

    const sinResponder = progressFor(branching, {}, 'q1');
    expect(sinResponder.total).toBe(3);
    expect(sinResponder.deterministic).toBe(false);

    const atajo = progressFor(branching, { q1: 'corto' }, 'q1');
    expect(atajo.total).toBe(1);
    expect(atajo.deterministic).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe('walkPath', () => {
  it('devuelve el recorrido completo dado un conjunto de respuestas', () => {
    const definition = makeForm({
      blocks: [
        welcome(),
        singleChoice('q1', ['a', 'b']),
        shortText('q2'),
        rating('q3', { scale: 5 }),
      ],
      endScreens: [ending('end'), ending('vip')],
      rules: [
        rule('salta', 'q1', 'equals', 'a', toBlock('q3'), 1),
        rule('vip', 'q3', 'greater_or_equal', 4, toEnd('vip'), 1),
      ],
    });

    const answers: AnswersMap = { q1: 'a', q3: 5 };
    expect(walkPath(definition, answers)).toEqual([
      block('welcome'),
      block('q1'),
      block('q3'),
      endScreen('vip'),
    ]);

    expect(walkPath(definition, { q1: 'b', q2: 'x', q3: 1 })).toEqual([
      block('welcome'),
      block('q1'),
      block('q2'),
      block('q3'),
      endScreen('end'),
    ]);
  });
});
