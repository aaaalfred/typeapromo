import { describe, expect, it } from 'vitest';

import {
  BLOCK_TYPES,
  CHOICE_PRESENTATIONS,
  DEFAULT_THEME,
  OPERATORS_BY_QUESTION_TYPE,
  QUESTION_BLOCK_TYPES,
  RATING_APPEARANCES,
  RATING_SCALES,
  SCHEMA_VERSION,
  THEME_FONTS,
  answerSchemaFor,
  blockDefinitionSchema,
  choiceDefinitionSchema,
  createDefaultFormDefinition,
  endingBlockSchema,
  formDefinitionSchema,
  hasAnswer,
  isChoiceBlock,
  isEmptyAnswer,
  isQuestionBlock,
  isUnaryOperator,
  logicRuleSchema,
  parseFormDefinition,
  themeDefinitionSchema,
  validateAnswer,
  type BlockDefinition,
} from '../definition';
import {
  blockOf,
  type BlockInput,
  date,
  email,
  ending,
  longText,
  makeForm,
  makeRawForm,
  multiChoice,
  rating,
  scale,
  shortText,
  singleChoice,
  statement,
  welcome,
} from './fixtures';

describe('schemaVersion', () => {
  it('es obligatorio y literal 1', () => {
    expect(SCHEMA_VERSION).toBe(1);

    const withoutVersion = makeRawForm({ blocks: [shortText('q1')] }) as Record<string, unknown>;
    delete withoutVersion.schemaVersion;
    expect(formDefinitionSchema.safeParse(withoutVersion).success).toBe(false);

    expect(
      formDefinitionSchema.safeParse(makeRawForm({ schemaVersion: 2, blocks: [] })).success,
    ).toBe(false);
  });

  it('viaja en el documento parseado para poder migrar snapshots antiguos', () => {
    const definition = makeForm({ blocks: [shortText('q1')] });
    expect(definition.schemaVersion).toBe(1);
  });
});

describe('unión discriminada de bloques', () => {
  it('cubre exactamente los once tipos del producto', () => {
    expect(BLOCK_TYPES).toHaveLength(11);
    expect(new Set(BLOCK_TYPES).size).toBe(11);
    expect(QUESTION_BLOCK_TYPES).toHaveLength(8);
  });

  const flowCases: readonly [string, BlockInput][] = [
    ['short_text', shortText('a')],
    ['long_text', longText('a')],
    ['email', email('a')],
    ['date', date('a')],
    ['single_choice', singleChoice('a', ['x', 'y'])],
    ['multi_choice', multiChoice('a', ['x', 'y'])],
    ['scale', scale('a')],
    ['rating', rating('a')],
    ['statement', statement('a')],
    ['welcome', welcome('a')],
  ];

  it.each(flowCases)('parsea el bloque %s dentro del recorrido', (type, block) => {
    const definition = makeForm({ blocks: [block] });
    expect(definition.blocks[0]?.type).toBe(type);
  });

  it('parsea el bloque ending como pantalla final', () => {
    const parsed = endingBlockSchema.parse({ id: 'end', type: 'ending', title: 'Gracias' });
    expect(parsed.type).toBe('ending');
    expect(blockDefinitionSchema.safeParse(parsed).success).toBe(true);
  });

  it('rechaza un bloque ending dentro de blocks: las pantallas finales van aparte', () => {
    const result = formDefinitionSchema.safeParse(
      makeRawForm({ blocks: [{ id: 'end2', type: 'ending', title: 'Final' }] }),
    );
    expect(result.success).toBe(false);
  });

  it('rechaza tipos desconocidos y claves de más', () => {
    expect(
      formDefinitionSchema.safeParse(makeRawForm({ blocks: [{ id: 'a', type: 'slider', title: 'x' }] }))
        .success,
    ).toBe(false);
    expect(
      formDefinitionSchema.safeParse(
        makeRawForm({ blocks: [{ id: 'a', type: 'short_text', title: 'x', color: 'red' }] }),
      ).success,
    ).toBe(false);
  });

  it('rechaza identificadores fuera del alfabeto estable', () => {
    expect(
      formDefinitionSchema.safeParse(
        makeRawForm({ blocks: [{ id: 'con espacio', type: 'short_text', title: 'x' }] }),
      ).success,
    ).toBe(false);
  });

  it('rechaza un título vacío', () => {
    expect(
      formDefinitionSchema.safeParse(
        makeRawForm({ blocks: [{ id: 'a', type: 'short_text', title: '' }] }),
      ).success,
    ).toBe(false);
  });

  it('aplica los valores por defecto de cada tipo', () => {
    const definition = makeForm({
      blocks: [shortText('a'), longText('b'), singleChoice('c', ['x']), scale('d'), rating('e')],
    });
    const [a, b, c, d, e] = definition.blocks;

    expect(a?.type === 'short_text' && a.required).toBe(false);
    expect(b?.type === 'long_text' && b.rows).toBe(4);
    expect(c?.type === 'single_choice' && c.presentation).toBe('list');
    expect(c?.type === 'single_choice' && c.randomizeChoices).toBe(false);
    expect(d?.type === 'scale' ? [d.min, d.max, d.step] : null).toEqual([1, 10, 1]);
    expect(e?.type === 'rating' ? [e.appearance, e.scale] : null).toEqual(['stars', 5]);
  });

  it('distingue preguntas de pantallas y bloques de selección', () => {
    const definition = makeForm({
      blocks: [welcome(), statement('s'), shortText('q'), singleChoice('c', ['x'])],
    });
    expect(definition.blocks.filter(isQuestionBlock).map((block) => block.id)).toEqual(['q', 'c']);
    expect(definition.blocks.filter(isChoiceBlock).map((block) => block.id)).toEqual(['c']);
  });
});

describe('presentación de las preguntas de selección', () => {
  it('admite las cuatro presentaciones', () => {
    expect(CHOICE_PRESENTATIONS).toEqual(['list', 'buttons', 'image_cards', 'grid']);
    for (const presentation of CHOICE_PRESENTATIONS) {
      const definition = makeForm({ blocks: [singleChoice('c', ['x'], { presentation })] });
      const block = blockOf(definition, 'c');
      expect(block.type === 'single_choice' && block.presentation).toBe(presentation);
    }
  });

  it('rechaza una presentación inventada', () => {
    expect(
      formDefinitionSchema.safeParse(
        makeRawForm({
          blocks: [
            {
              id: 'c',
              type: 'single_choice',
              title: 'x',
              choices: [{ id: 'a', label: 'A', value: 'a' }],
              presentation: 'carousel',
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('exige al menos una opción', () => {
    expect(
      formDefinitionSchema.safeParse(
        makeRawForm({ blocks: [{ id: 'c', type: 'single_choice', title: 'x', choices: [] }] }),
      ).success,
    ).toBe(false);
  });
});

describe('ChoiceDefinition', () => {
  it('exige id estable, etiqueta y valor, y admite imagen', () => {
    const parsed = choiceDefinitionSchema.parse({
      id: 'opt-1',
      label: 'Opción uno',
      value: 'uno',
      assetId: 'a1b2c3',
    });
    expect(parsed).toEqual({ id: 'opt-1', label: 'Opción uno', value: 'uno', assetId: 'a1b2c3' });

    expect(choiceDefinitionSchema.safeParse({ id: 'opt-1', label: 'x' }).success).toBe(false);
    expect(choiceDefinitionSchema.safeParse({ id: 'opt-1', label: '', value: 'x' }).success).toBe(
      false,
    );
  });
});

describe('rating como único tipo configurable', () => {
  it('admite las tres apariencias y las cuatro escalas', () => {
    expect(RATING_APPEARANCES).toEqual(['stars', 'faces', 'hearts']);
    expect(RATING_SCALES).toEqual([3, 5, 7, 10]);

    for (const appearance of RATING_APPEARANCES) {
      for (const value of RATING_SCALES) {
        const definition = makeForm({ blocks: [rating('r', { appearance, scale: value })] });
        const block = blockOf(definition, 'r');
        expect(block.type === 'rating' ? [block.appearance, block.scale] : null).toEqual([
          appearance,
          value,
        ]);
      }
    }
  });

  it('rechaza escalas fuera del catálogo', () => {
    for (const bad of [1, 2, 4, 6, 8, 9, 11]) {
      expect(
        formDefinitionSchema.safeParse(
          makeRawForm({ blocks: [{ id: 'r', type: 'rating', title: 'x', scale: bad }] }),
        ).success,
      ).toBe(false);
    }
  });

  it('admite etiquetas opcionales en los extremos', () => {
    const definition = formDefinitionSchema.parse(
      makeRawForm({
        blocks: [
          { id: 'r', type: 'rating', title: 'x', labels: { min: 'Fatal', max: 'Genial' } },
        ],
      }),
    );
    const block = blockOf(definition, 'r');
    expect(block.type === 'rating' ? block.labels : null).toEqual({ min: 'Fatal', max: 'Genial' });
  });
});

describe('LogicRule', () => {
  it('exige origen, operador, prioridad y destino', () => {
    const parsed = logicRuleSchema.parse({
      id: 'r1',
      sourceQuestionId: 'q1',
      operator: 'equals',
      value: 'sí',
      priority: 1,
      target: { kind: 'block', id: 'q3' },
    });
    expect(parsed.target).toEqual({ kind: 'block', id: 'q3' });
    expect(parsed.priority).toBe(1);
  });

  it('admite pantalla final como destino y rechaza destinos de otra clase', () => {
    expect(
      logicRuleSchema.safeParse({
        id: 'r1',
        sourceQuestionId: 'q1',
        operator: 'is_empty',
        priority: 0,
        target: { kind: 'end_screen', id: 'bye' },
      }).success,
    ).toBe(true);

    expect(
      logicRuleSchema.safeParse({
        id: 'r1',
        sourceQuestionId: 'q1',
        operator: 'is_empty',
        priority: 0,
        target: { kind: 'url', id: 'bye' },
      }).success,
    ).toBe(false);
  });

  it('el valor por defecto es null para los operadores unarios', () => {
    const parsed = logicRuleSchema.parse({
      id: 'r1',
      sourceQuestionId: 'q1',
      operator: 'is_not_empty',
      priority: 0,
      target: { kind: 'end_screen', id: 'bye' },
    });
    expect(parsed.value).toBeNull();
    expect(isUnaryOperator('is_not_empty')).toBe(true);
    expect(isUnaryOperator('equals')).toBe(false);
  });

  it('rechaza operadores desconocidos y prioridades no enteras', () => {
    const base = {
      id: 'r1',
      sourceQuestionId: 'q1',
      priority: 1,
      target: { kind: 'block', id: 'q2' },
    };
    expect(logicRuleSchema.safeParse({ ...base, operator: 'matches' }).success).toBe(false);
    expect(
      logicRuleSchema.safeParse({ ...base, operator: 'equals', value: 'x', priority: 1.5 }).success,
    ).toBe(false);
  });

  it('declara operadores aplicables para los ocho tipos de pregunta', () => {
    for (const type of QUESTION_BLOCK_TYPES) {
      const operators = OPERATORS_BY_QUESTION_TYPE[type];
      expect(operators.length).toBeGreaterThan(0);
      expect(operators).toContain('is_empty');
      expect(operators).toContain('is_not_empty');
    }
    expect(OPERATORS_BY_QUESTION_TYPE.multi_choice).not.toContain('greater_than');
    expect(OPERATORS_BY_QUESTION_TYPE.scale).toContain('greater_than');
    expect(OPERATORS_BY_QUESTION_TYPE.short_text).toContain('contains');
  });
});

describe('ThemeDefinition', () => {
  it('acepta el tema por defecto y aplica los valores implícitos', () => {
    const parsed = themeDefinitionSchema.parse({
      colors: DEFAULT_THEME.colors,
      typography: { fontFamily: 'inter' },
    });
    expect(parsed.typography.baseSize).toBe(16);
    expect(parsed.borderRadius).toBe('md');
    expect(parsed.buttonStyle).toBe('solid');
    expect(parsed.contentAlignment).toBe('left');
  });

  it('exige los cinco tokens de color del spec más el texto del botón', () => {
    for (const token of ['background', 'text', 'controls', 'buttons', 'buttonText', 'accent']) {
      const colors: Record<string, string> = { ...DEFAULT_THEME.colors };
      delete colors[token];
      expect(
        themeDefinitionSchema.safeParse({ colors, typography: { fontFamily: 'inter' } }).success,
      ).toBe(false);
    }
  });

  it('rechaza colores que no son hexadecimales', () => {
    expect(
      themeDefinitionSchema.safeParse({
        colors: { ...DEFAULT_THEME.colors, accent: 'rebeccapurple' },
        typography: { fontFamily: 'inter' },
      }).success,
    ).toBe(false);
  });

  it('solo admite tipografías del catálogo local', () => {
    for (const font of THEME_FONTS) {
      expect(
        themeDefinitionSchema.safeParse({
          colors: DEFAULT_THEME.colors,
          typography: { fontFamily: font },
        }).success,
      ).toBe(true);
    }
    expect(
      themeDefinitionSchema.safeParse({
        colors: DEFAULT_THEME.colors,
        typography: { fontFamily: 'Comic Sans MS' },
      }).success,
    ).toBe(false);
  });

  it('admite radio de bordes, estilo de botón, alineación, logo y fondo', () => {
    const parsed = themeDefinitionSchema.parse({
      ...DEFAULT_THEME,
      borderRadius: 'full',
      buttonStyle: 'outline',
      contentAlignment: 'center',
      logoAssetId: 'logo-1',
      backgroundImageAssetId: 'bg-1',
      backgroundOverlayOpacity: 0.4,
    });
    expect(parsed.borderRadius).toBe('full');
    expect(parsed.buttonStyle).toBe('outline');
    expect(parsed.contentAlignment).toBe('center');
    expect(parsed.logoAssetId).toBe('logo-1');
    expect(parsed.backgroundImageAssetId).toBe('bg-1');
    expect(parsed.backgroundOverlayOpacity).toBe(0.4);
  });
});

describe('FormDefinition', () => {
  it('acepta metadatos, tema, bloques, reglas y pantallas finales', () => {
    const definition = makeForm({
      blocks: [welcome(), shortText('q1')],
      endScreens: [ending('bye'), ending('nope')],
      defaultEndScreenId: 'bye',
      title: 'Encuesta interna',
    });
    expect(definition.meta.title).toBe('Encuesta interna');
    expect(definition.meta.language).toBe('es');
    expect(definition.settings.showProgressBar).toBe(true);
    expect(definition.endScreens.map((screen) => screen.id)).toEqual(['bye', 'nope']);
    expect(definition.defaultEndScreenId).toBe('bye');
  });

  it('createDefaultFormDefinition produce un documento válido para el esquema', () => {
    const definition = createDefaultFormDefinition('Nuevo formulario');
    expect(formDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(definition.meta.title).toBe('Nuevo formulario');
  });

  it('parseFormDefinition lanza con basura', () => {
    expect(() => parseFormDefinition({ hola: 'mundo' })).toThrow();
  });
});

describe('respuestas', () => {
  it('isEmptyAnswer distingue vacío de cero y de false', () => {
    expect(isEmptyAnswer(undefined)).toBe(true);
    expect(isEmptyAnswer(null)).toBe(true);
    expect(isEmptyAnswer('')).toBe(true);
    expect(isEmptyAnswer('   ')).toBe(true);
    expect(isEmptyAnswer([])).toBe(true);
    expect(isEmptyAnswer(0)).toBe(false);
    expect(isEmptyAnswer(false)).toBe(false);
    expect(isEmptyAnswer(['a'])).toBe(false);
  });

  it('hasAnswer distingue «respondida en blanco» de «todavía no vista»', () => {
    expect(hasAnswer({ q1: null }, 'q1')).toBe(true);
    expect(hasAnswer({ q1: '' }, 'q1')).toBe(true);
    expect(hasAnswer({ q1: undefined }, 'q1')).toBe(false);
    expect(hasAnswer({}, 'q1')).toBe(false);
  });

  const definition = makeForm({
    blocks: [
      shortText('texto', { required: true }),
      longText('largo'),
      email('correo', { required: true }),
      date('fecha', { required: true }),
      singleChoice('unica', ['a', 'b'], { required: true }),
      multiChoice('multi', ['a', 'b', 'c'], { required: true, maxSelections: 2 }),
      scale('escala', { required: true, min: 0, max: 10, step: 2 }),
      rating('valoracion', { required: true, scale: 7 }),
      statement('nota'),
    ],
  });
  const get = (id: string): BlockDefinition => blockOf(definition, id);

  const answerCases: readonly [string, unknown, boolean][] = [
    ['texto', 'hola', true],
    ['texto', '', false],
    ['largo', null, true],
    ['correo', 'alguien@example.com', true],
    ['correo', 'alguien-arroba', false],
    ['fecha', '2026-03-01', true],
    ['fecha', '01/03/2026', false],
    ['unica', 'a', true],
    ['unica', 'z', false],
    ['multi', ['a', 'b'], true],
    ['multi', ['a', 'b', 'c'], false],
    ['multi', ['a', 'z'], false],
    ['multi', [], false],
    ['escala', 4, true],
    ['escala', 3, false],
    ['escala', 12, false],
    ['valoracion', 7, true],
    ['valoracion', 8, false],
    ['valoracion', 0, false],
    ['nota', null, true],
    ['nota', 'algo', false],
  ];

  it.each(answerCases)('valida la respuesta de %s con %o', (id, value, expected) => {
    expect(validateAnswer(get(id), value).ok).toBe(expected);
  });

  it('devuelve incidencias legibles cuando la respuesta no encaja', () => {
    const result = validateAnswer(get('unica'), 'z');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.message).toContain('no existe');
    }
  });

  it('una pregunta no obligatoria admite null', () => {
    const optional = makeForm({ blocks: [shortText('opcional')] });
    expect(validateAnswer(blockOf(optional, 'opcional'), null).ok).toBe(true);
    expect(validateAnswer(blockOf(optional, 'opcional'), undefined).ok).toBe(true);
  });

  it('answerSchemaFor respeta las validaciones de longitud y patrón', () => {
    const withRules = formDefinitionSchema.parse(
      makeRawForm({
        blocks: [
          {
            id: 'codigo',
            type: 'short_text',
            title: 'Código',
            required: true,
            validation: { minLength: 3, maxLength: 5, pattern: '^[A-Z]+$' },
          },
        ],
      }),
    );
    const schema = answerSchemaFor(blockOf(withRules, 'codigo'));
    expect(schema.safeParse('ABC').success).toBe(true);
    expect(schema.safeParse('AB').success).toBe(false);
    expect(schema.safeParse('ABCDEF').success).toBe(false);
    expect(schema.safeParse('abc').success).toBe(false);
  });

  it('answerSchemaFor respeta el rango de fechas', () => {
    const withRange = formDefinitionSchema.parse(
      makeRawForm({
        blocks: [
          {
            id: 'cuando',
            type: 'date',
            title: 'Cuándo',
            required: true,
            validation: { min: '2026-01-01', max: '2026-12-31' },
          },
        ],
      }),
    );
    const schema = answerSchemaFor(blockOf(withRange, 'cuando'));
    expect(schema.safeParse('2026-06-15').success).toBe(true);
    expect(schema.safeParse('2025-12-31').success).toBe(false);
    expect(schema.safeParse('2027-01-01').success).toBe(false);
  });

  it('answerSchemaFor exige el mínimo de selecciones cuando hay alguna', () => {
    const definition2 = makeForm({
      blocks: [multiChoice('m', ['a', 'b', 'c'], { required: true, minSelections: 2 })],
    });
    const schema = answerSchemaFor(blockOf(definition2, 'm'));
    expect(schema.safeParse(['a', 'b']).success).toBe(true);
    expect(schema.safeParse(['a']).success).toBe(false);
  });
});
