/**
 * Contratos Zod del documento de formulario.
 *
 * Este fichero define **la forma** del documento y nada más. Todas las
 * comprobaciones semánticas (identificadores duplicados, rangos incoherentes,
 * destinos inexistentes, saltos hacia atrás, alcanzabilidad, reglas
 * contradictorias) viven en `validate.ts` y devuelven errores tipados.
 *
 * La separación es deliberada: `formDefinitionSchema.parse()` garantiza que el
 * JSONB es estructuralmente legible; `validateForPublication()` garantiza que
 * además tiene sentido como formulario publicable.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Versión de esquema                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Versión del esquema del documento. Se persiste en cada borrador y en cada
 * snapshot publicado (PLAN.md §2.5). Cualquier cambio de forma incompatible en
 * `BlockDefinition` obliga a incrementarla y a escribir un migrador de lectura.
 */
export const SCHEMA_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Primitivas                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Identificador estable. Acepta nanoid, uuid y slugs cortos.
 * No se generan aquí: los crea el editor y se conservan entre versiones.
 */
export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'El identificador solo admite [A-Za-z0-9_-]');

/** Color en notación hexadecimal (#rgb, #rrggbb o #rrggbbaa). */
export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Color hexadecimal inválido');

/** Fecha civil sin zona horaria, en formato `YYYY-MM-DD`. */
export const plainDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Se espera una fecha en formato YYYY-MM-DD');

/** URL absoluta http/https. Se evita `z.string().url()` por compatibilidad entre versiones de zod. */
export const httpUrlSchema = z
  .string()
  .max(2000)
  .regex(/^https?:\/\/[^\s]+$/, 'Se espera una URL absoluta http(s)');

/**
 * Expresión de correo usada tanto por el contrato de respuesta como por el
 * validador de respuestas. Deliberadamente conservadora.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailSchema = z.string().max(320).regex(EMAIL_PATTERN, 'Correo electrónico inválido');

/** Etiquetas opcionales de los extremos de una escala o de un rating. */
export const extremeLabelsSchema = z
  .object({
    min: z.string().max(120).optional(),
    max: z.string().max(120).optional(),
  })
  .strict();

export type ExtremeLabels = z.infer<typeof extremeLabelsSchema>;

/* -------------------------------------------------------------------------- */
/* Opciones de respuesta                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Opción de una pregunta de selección.
 *
 * - `id` es estable y sobrevive a reordenaciones y reetiquetados.
 * - `value` es lo que se persiste en `answers` y lo que comparan las reglas.
 * - `assetId` referencia un `media_assets` ya publicado (tarjetas con imagen).
 */
export const choiceDefinitionSchema = z
  .object({
    id: idSchema,
    label: z.string().min(1).max(300),
    value: z.string().min(1).max(200),
    assetId: idSchema.optional(),
  })
  .strict();

export type ChoiceDefinition = z.infer<typeof choiceDefinitionSchema>;

/** Formas de presentar una pregunta de selección. */
export const CHOICE_PRESENTATIONS = ['list', 'buttons', 'image_cards', 'grid'] as const;
export const choicePresentationSchema = z.enum(CHOICE_PRESENTATIONS);
export type ChoicePresentation = z.infer<typeof choicePresentationSchema>;

/* -------------------------------------------------------------------------- */
/* Rating                                                                      */
/* -------------------------------------------------------------------------- */

/** Apariencias del bloque `rating`. Un único tipo configurable, no tres tipos. */
export const RATING_APPEARANCES = ['stars', 'faces', 'hearts'] as const;
export const ratingAppearanceSchema = z.enum(RATING_APPEARANCES);
export type RatingAppearance = z.infer<typeof ratingAppearanceSchema>;

/** Escalas admitidas por el bloque `rating`. */
export const RATING_SCALES = [3, 5, 7, 10] as const;
export const ratingScaleSchema = z.union([
  z.literal(3),
  z.literal(5),
  z.literal(7),
  z.literal(10),
]);
export type RatingScale = z.infer<typeof ratingScaleSchema>;

/* -------------------------------------------------------------------------- */
/* Validaciones por tipo                                                       */
/* -------------------------------------------------------------------------- */

export const textValidationSchema = z
  .object({
    minLength: z.number().int().min(0).max(10000).optional(),
    maxLength: z.number().int().min(1).max(10000).optional(),
    /** Expresión regular adicional, en notación JavaScript sin delimitadores. */
    pattern: z.string().max(300).optional(),
  })
  .strict();

export type TextValidation = z.infer<typeof textValidationSchema>;

export const dateValidationSchema = z
  .object({
    min: plainDateSchema.optional(),
    max: plainDateSchema.optional(),
  })
  .strict();

export type DateValidation = z.infer<typeof dateValidationSchema>;

/* -------------------------------------------------------------------------- */
/* Bloques                                                                     */
/* -------------------------------------------------------------------------- */

const baseBlockShape = {
  id: idSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  /** Imagen asociada a la pregunta, la declaración o la pantalla. */
  mediaAssetId: idSchema.optional(),
};

const baseQuestionShape = {
  ...baseBlockShape,
  required: z.boolean().default(false),
};

export const shortTextBlockSchema = z
  .object({
    ...baseQuestionShape,
    type: z.literal('short_text'),
    placeholder: z.string().max(200).optional(),
    validation: textValidationSchema.optional(),
  })
  .strict();

export const longTextBlockSchema = z
  .object({
    ...baseQuestionShape,
    type: z.literal('long_text'),
    placeholder: z.string().max(200).optional(),
    rows: z.number().int().min(2).max(20).default(4),
    validation: textValidationSchema.optional(),
  })
  .strict();

export const emailBlockSchema = z
  .object({
    ...baseQuestionShape,
    type: z.literal('email'),
    placeholder: z.string().max(200).optional(),
  })
  .strict();

export const dateBlockSchema = z
  .object({
    ...baseQuestionShape,
    type: z.literal('date'),
    validation: dateValidationSchema.optional(),
  })
  .strict();

export const singleChoiceBlockSchema = z
  .object({
    ...baseQuestionShape,
    type: z.literal('single_choice'),
    choices: z.array(choiceDefinitionSchema).min(1).max(100),
    presentation: choicePresentationSchema.default('list'),
    randomizeChoices: z.boolean().default(false),
  })
  .strict();

export const multiChoiceBlockSchema = z
  .object({
    ...baseQuestionShape,
    type: z.literal('multi_choice'),
    choices: z.array(choiceDefinitionSchema).min(1).max(100),
    presentation: choicePresentationSchema.default('list'),
    randomizeChoices: z.boolean().default(false),
    minSelections: z.number().int().min(0).max(100).optional(),
    maxSelections: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const scaleBlockSchema = z
  .object({
    ...baseQuestionShape,
    type: z.literal('scale'),
    min: z.number().int().min(0).max(100).default(1),
    max: z.number().int().min(1).max(100).default(10),
    step: z.number().int().min(1).max(100).default(1),
    labels: extremeLabelsSchema.optional(),
  })
  .strict();

export const ratingBlockSchema = z
  .object({
    ...baseQuestionShape,
    type: z.literal('rating'),
    appearance: ratingAppearanceSchema.default('stars'),
    scale: ratingScaleSchema.default(5),
    labels: extremeLabelsSchema.optional(),
  })
  .strict();

export const statementBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal('statement'),
    body: z.string().max(5000).optional(),
    buttonLabel: z.string().max(120).optional(),
  })
  .strict();

export const welcomeBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal('welcome'),
    body: z.string().max(5000).optional(),
    buttonLabel: z.string().max(120).optional(),
  })
  .strict();

export const endingBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal('ending'),
    body: z.string().max(5000).optional(),
    ctaLabel: z.string().max(120).optional(),
    ctaUrl: httpUrlSchema.optional(),
    redirectUrl: httpUrlSchema.optional(),
  })
  .strict();

/* --- Uniones discriminadas ------------------------------------------------ */

/** Los ocho bloques que recogen una respuesta. */
export const questionDefinitionSchema = z.discriminatedUnion('type', [
  shortTextBlockSchema,
  longTextBlockSchema,
  emailBlockSchema,
  dateBlockSchema,
  singleChoiceBlockSchema,
  multiChoiceBlockSchema,
  scaleBlockSchema,
  ratingBlockSchema,
]);

/**
 * Los diez bloques que participan en el recorrido secuencial.
 * `ending` queda fuera a propósito: las pantallas finales viven en
 * `FormDefinition.endScreens` y solo se alcanzan por caída natural del flujo o
 * por el destino explícito de una regla.
 */
export const flowBlockDefinitionSchema = z.discriminatedUnion('type', [
  shortTextBlockSchema,
  longTextBlockSchema,
  emailBlockSchema,
  dateBlockSchema,
  singleChoiceBlockSchema,
  multiChoiceBlockSchema,
  scaleBlockSchema,
  ratingBlockSchema,
  statementBlockSchema,
  welcomeBlockSchema,
]);

/** Los once tipos de bloque del producto, discriminados por `type`. */
export const blockDefinitionSchema = z.discriminatedUnion('type', [
  shortTextBlockSchema,
  longTextBlockSchema,
  emailBlockSchema,
  dateBlockSchema,
  singleChoiceBlockSchema,
  multiChoiceBlockSchema,
  scaleBlockSchema,
  ratingBlockSchema,
  statementBlockSchema,
  welcomeBlockSchema,
  endingBlockSchema,
]);

export type ShortTextBlock = z.infer<typeof shortTextBlockSchema>;
export type LongTextBlock = z.infer<typeof longTextBlockSchema>;
export type EmailBlock = z.infer<typeof emailBlockSchema>;
export type DateBlock = z.infer<typeof dateBlockSchema>;
export type SingleChoiceBlock = z.infer<typeof singleChoiceBlockSchema>;
export type MultiChoiceBlock = z.infer<typeof multiChoiceBlockSchema>;
export type ScaleBlock = z.infer<typeof scaleBlockSchema>;
export type RatingBlock = z.infer<typeof ratingBlockSchema>;
export type StatementBlock = z.infer<typeof statementBlockSchema>;
export type WelcomeBlock = z.infer<typeof welcomeBlockSchema>;
export type EndingBlock = z.infer<typeof endingBlockSchema>;

/** Bloque que recoge una respuesta. */
export type QuestionDefinition = z.infer<typeof questionDefinitionSchema>;
/** Bloque que ocupa una posición en el recorrido secuencial. */
export type FlowBlockDefinition = z.infer<typeof flowBlockDefinitionSchema>;
/** Cualquiera de los once bloques. */
export type BlockDefinition = z.infer<typeof blockDefinitionSchema>;

export type BlockType = BlockDefinition['type'];
export type QuestionType = QuestionDefinition['type'];

/** Bloques con imagen de opción (los únicos que declaran `choices`). */
export type ChoiceBlock = SingleChoiceBlock | MultiChoiceBlock;

export const BLOCK_TYPES = [
  'short_text',
  'long_text',
  'email',
  'date',
  'single_choice',
  'multi_choice',
  'scale',
  'rating',
  'statement',
  'welcome',
  'ending',
] as const satisfies readonly BlockType[];

export const QUESTION_BLOCK_TYPES = [
  'short_text',
  'long_text',
  'email',
  'date',
  'single_choice',
  'multi_choice',
  'scale',
  'rating',
] as const satisfies readonly QuestionType[];

const QUESTION_TYPE_SET: ReadonlySet<string> = new Set(QUESTION_BLOCK_TYPES);

/** `true` si el bloque recoge una respuesta del participante. */
export function isQuestionBlock(block: BlockDefinition): block is QuestionDefinition {
  return QUESTION_TYPE_SET.has(block.type);
}

/** `true` si el bloque declara opciones de selección. */
export function isChoiceBlock(block: BlockDefinition): block is ChoiceBlock {
  return block.type === 'single_choice' || block.type === 'multi_choice';
}

/* -------------------------------------------------------------------------- */
/* Lógica condicional                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Operadores admitidos. La aplicabilidad por tipo de bloque está en
 * `OPERATORS_BY_QUESTION_TYPE`; el validador de publicación rechaza cualquier
 * combinación fuera de esa tabla.
 */
export const LOGIC_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
  'is_selected',
  'is_not_selected',
  'is_empty',
  'is_not_empty',
] as const;

export const logicOperatorSchema = z.enum(LOGIC_OPERATORS);
export type LogicOperator = z.infer<typeof logicOperatorSchema>;

/** Operadores que no llevan operando derecho. */
export const UNARY_OPERATORS = ['is_empty', 'is_not_empty'] as const;
const UNARY_OPERATOR_SET: ReadonlySet<LogicOperator> = new Set(UNARY_OPERATORS);

export function isUnaryOperator(operator: LogicOperator): boolean {
  return UNARY_OPERATOR_SET.has(operator);
}

/** Operadores válidos para cada tipo de pregunta. */
export const OPERATORS_BY_QUESTION_TYPE: Readonly<
  Record<QuestionType, readonly LogicOperator[]>
> = {
  short_text: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
  long_text: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
  email: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
  date: [
    'equals',
    'not_equals',
    'greater_than',
    'greater_or_equal',
    'less_than',
    'less_or_equal',
    'is_empty',
    'is_not_empty',
  ],
  single_choice: [
    'equals',
    'not_equals',
    'is_selected',
    'is_not_selected',
    'is_empty',
    'is_not_empty',
  ],
  multi_choice: [
    'contains',
    'not_contains',
    'is_selected',
    'is_not_selected',
    'is_empty',
    'is_not_empty',
  ],
  scale: [
    'equals',
    'not_equals',
    'greater_than',
    'greater_or_equal',
    'less_than',
    'less_or_equal',
    'is_empty',
    'is_not_empty',
  ],
  rating: [
    'equals',
    'not_equals',
    'greater_than',
    'greater_or_equal',
    'less_than',
    'less_or_equal',
    'is_empty',
    'is_not_empty',
  ],
};

/** Operando derecho de una regla. `null` para operadores unarios. */
export const logicValueSchema = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(100),
  z.null(),
]);

export type LogicValue = z.infer<typeof logicValueSchema>;

/** Destino de una regla: otra pregunta posterior o una pantalla final. */
export const ruleTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('block'), id: idSchema }).strict(),
  z.object({ kind: z.literal('end_screen'), id: idSchema }).strict(),
]);

export type RuleTarget = z.infer<typeof ruleTargetSchema>;

/**
 * Regla de lógica condicional.
 *
 * Se evalúa al abandonar `sourceQuestionId`. Entre varias reglas del mismo
 * origen gana la de **menor `priority`** (1 antes que 2); a igualdad de
 * prioridad, el orden de declaración — pero el validador exige prioridades
 * distintas por origen para que el orden nunca dependa del array.
 */
export const logicRuleSchema = z
  .object({
    id: idSchema,
    sourceQuestionId: idSchema,
    operator: logicOperatorSchema,
    value: logicValueSchema.default(null),
    priority: z.number().int().min(0).max(9999),
    target: ruleTargetSchema,
  })
  .strict();

export type LogicRule = z.infer<typeof logicRuleSchema>;

/* -------------------------------------------------------------------------- */
/* Tema                                                                        */
/* -------------------------------------------------------------------------- */

/** Catálogo local de tipografías. No se cargan fuentes de terceros. */
export const THEME_FONTS = [
  'system',
  'inter',
  'dm-sans',
  'space-grotesk',
  'ibm-plex-sans',
  'lora',
  'georgia',
] as const;

export const themeFontSchema = z.enum(THEME_FONTS);
export type ThemeFont = z.infer<typeof themeFontSchema>;

export const BORDER_RADII = ['none', 'sm', 'md', 'lg', 'full'] as const;
export const borderRadiusSchema = z.enum(BORDER_RADII);
export type BorderRadius = z.infer<typeof borderRadiusSchema>;

export const BUTTON_STYLES = ['solid', 'outline', 'ghost', 'pill'] as const;
export const buttonStyleSchema = z.enum(BUTTON_STYLES);
export type ButtonStyle = z.infer<typeof buttonStyleSchema>;

export const CONTENT_ALIGNMENTS = ['left', 'center', 'right'] as const;
export const contentAlignmentSchema = z.enum(CONTENT_ALIGNMENTS);
export type ContentAlignment = z.infer<typeof contentAlignmentSchema>;

/** Tokens de color del tema. El editor valida el contraste sobre estos valores. */
export const themeColorsSchema = z
  .object({
    background: hexColorSchema,
    text: hexColorSchema,
    /** Bordes y superficies de los controles de formulario. */
    controls: hexColorSchema,
    /** Fondo del botón primario. */
    buttons: hexColorSchema,
    /** Texto sobre el botón primario. */
    buttonText: hexColorSchema,
    accent: hexColorSchema,
  })
  .strict();

export type ThemeColors = z.infer<typeof themeColorsSchema>;

export const themeTypographySchema = z
  .object({
    fontFamily: themeFontSchema,
    /** Tamaño base en píxeles. El resto de tamaños se derivan de él. */
    baseSize: z.number().int().min(12).max(28).default(16),
    headingScale: z.number().min(1).max(2.5).default(1.25),
  })
  .strict();

export type ThemeTypography = z.infer<typeof themeTypographySchema>;

export const themeDefinitionSchema = z
  .object({
    colors: themeColorsSchema,
    typography: themeTypographySchema,
    borderRadius: borderRadiusSchema.default('md'),
    buttonStyle: buttonStyleSchema.default('solid'),
    contentAlignment: contentAlignmentSchema.default('left'),
    logoAssetId: idSchema.optional(),
    backgroundImageAssetId: idSchema.optional(),
    backgroundOverlayOpacity: z.number().min(0).max(1).default(0),
  })
  .strict();

export type ThemeDefinition = z.infer<typeof themeDefinitionSchema>;

/** Tema por defecto. Cumple AA sobre texto normal en todas sus parejas. */
export const DEFAULT_THEME: ThemeDefinition = {
  colors: {
    background: '#ffffff',
    text: '#111827',
    // 4,83:1 sobre el fondo blanco. El valor anterior (#d1d5db) daba 1,47:1 y
    // suspendía el mínimo de 3:1 que WCAG 2.1 §1.4.11 exige a los bordes de
    // control, así que todo formulario nuevo nacía con una advertencia del
    // propio panel de tema del editor.
    controls: '#6b7280',
    buttons: '#111827',
    buttonText: '#ffffff',
    accent: '#2563eb',
  },
  typography: {
    fontFamily: 'inter',
    baseSize: 16,
    headingScale: 1.25,
  },
  borderRadius: 'md',
  buttonStyle: 'solid',
  contentAlignment: 'left',
  backgroundOverlayOpacity: 0,
};

/* -------------------------------------------------------------------------- */
/* Documento completo                                                          */
/* -------------------------------------------------------------------------- */

export const formMetaSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(2000).optional(),
    language: z.string().min(2).max(10).default('es'),
    /** Mensaje que se muestra cuando el formulario está cerrado. */
    closedMessage: z.string().max(1000).optional(),
  })
  .strict();

export type FormMeta = z.infer<typeof formMetaSchema>;

export const formSettingsSchema = z
  .object({
    showProgressBar: z.boolean().default(true),
    allowResume: z.boolean().default(true),
    showQuestionNumbers: z.boolean().default(false),
    notifyOnCompletion: z.boolean().default(true),
  })
  .strict();

export type FormSettings = z.infer<typeof formSettingsSchema>;

/**
 * Documento completo del formulario. Es lo que se guarda en `form_drafts` y lo
 * que se congela en `form_versions`.
 */
export const formDefinitionSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    meta: formMetaSchema,
    theme: themeDefinitionSchema,
    /** Recorrido secuencial. Nunca contiene bloques `ending`. */
    blocks: z.array(flowBlockDefinitionSchema),
    rules: z.array(logicRuleSchema).default([]),
    /** Pantallas finales. Al menos una para poder publicar. */
    endScreens: z.array(endingBlockSchema),
    /** Pantalla final por defecto. Si se omite, se usa `endScreens[0]`. */
    defaultEndScreenId: idSchema.optional(),
    settings: formSettingsSchema.default({
      showProgressBar: true,
      allowResume: true,
      showQuestionNumbers: false,
      notifyOnCompletion: true,
    }),
  })
  .strict();

export type FormDefinition = z.infer<typeof formDefinitionSchema>;
/** Forma aceptada en entrada, antes de aplicar los valores por defecto de zod. */
export type FormDefinitionInput = z.input<typeof formDefinitionSchema>;

/* -------------------------------------------------------------------------- */
/* Respuestas                                                                  */
/* -------------------------------------------------------------------------- */

/** Valor persistido en `answers.value_json`. */
export const answerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export type AnswerValue = z.infer<typeof answerValueSchema>;

/** Respuestas conocidas de una sesión, indexadas por identificador de bloque. */
export type AnswersMap = Readonly<Record<string, AnswerValue | undefined>>;

/** `true` si el valor cuenta como «sin responder». */
export function isEmptyAnswer(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * `true` si la sesión ya ha pasado por esa pregunta, aunque la haya dejado en
 * blanco. Distinguir «respondida en blanco» de «todavía no vista» es lo que
 * permite a `reachableFrom` saber qué ramas están ya decididas.
 */
export function hasAnswer(answers: AnswersMap, blockId: string): boolean {
  return Object.prototype.hasOwnProperty.call(answers, blockId) && answers[blockId] !== undefined;
}

/**
 * Esquema de la respuesta admisible para un bloque concreto, aplicando sus
 * reglas de validación. Las rutas públicas lo usan para validar cada `PUT`.
 *
 * Si la pregunta no es obligatoria, el esquema admite además `null` como
 * «pasada en blanco».
 */
export function answerSchemaFor(block: BlockDefinition): z.ZodTypeAny {
  if (!isQuestionBlock(block)) {
    // Los bloques sin respuesta (welcome, statement, ending) solo admiten `null`.
    return z.null();
  }
  const base = questionAnswerSchema(block);
  return block.required ? base : z.union([base, z.null()]);
}

function questionAnswerSchema(block: QuestionDefinition): z.ZodTypeAny {
  switch (block.type) {
    case 'short_text':
    case 'long_text': {
      let schema = z.string().max(block.validation?.maxLength ?? 10000);
      const minLength = block.validation?.minLength ?? (block.required ? 1 : 0);
      if (minLength > 0) {
        schema = schema.min(minLength);
      }
      if (block.validation?.pattern !== undefined) {
        schema = schema.regex(new RegExp(block.validation.pattern));
      }
      return schema;
    }
    case 'email':
      return emailSchema;
    case 'date':
      return plainDateSchema.superRefine((value, ctx) => {
        if (block.validation?.min !== undefined && value < block.validation.min) {
          ctx.addIssue({
            code: 'custom',
            message: `La fecha no puede ser anterior a ${block.validation.min}`,
          });
        }
        if (block.validation?.max !== undefined && value > block.validation.max) {
          ctx.addIssue({
            code: 'custom',
            message: `La fecha no puede ser posterior a ${block.validation.max}`,
          });
        }
      });
    case 'single_choice': {
      const values = new Set(block.choices.map((choice) => choice.value));
      return z.string().superRefine((value, ctx) => {
        if (!values.has(value)) {
          ctx.addIssue({
            code: 'custom',
            message: 'La opción seleccionada no existe',
          });
        }
      });
    }
    case 'multi_choice': {
      const values = new Set(block.choices.map((choice) => choice.value));
      const { minSelections, maxSelections, required } = block;
      return z.array(z.string()).superRefine((selection, ctx) => {
        for (const value of selection) {
          if (!values.has(value)) {
            ctx.addIssue({
              code: 'custom',
              message: `La opción «${value}» no existe`,
            });
          }
        }
        if (new Set(selection).size !== selection.length) {
          ctx.addIssue({
            code: 'custom',
            message: 'No se admiten selecciones repetidas',
          });
        }
        if (required && selection.length === 0) {
          ctx.addIssue({ code: 'custom', message: 'Esta pregunta es obligatoria' });
        }
        if (minSelections !== undefined && selection.length > 0 && selection.length < minSelections) {
          ctx.addIssue({
            code: 'custom',
            message: `Selecciona al menos ${String(minSelections)} opciones`,
          });
        }
        if (maxSelections !== undefined && selection.length > maxSelections) {
          ctx.addIssue({
            code: 'custom',
            message: `Selecciona como mucho ${String(maxSelections)} opciones`,
          });
        }
      });
    }
    case 'scale': {
      const { min, max, step } = block;
      return z
        .number()
        .int()
        .min(min)
        .max(max)
        .superRefine((value, ctx) => {
          if ((value - min) % step !== 0) {
            ctx.addIssue({
              code: 'custom',
              message: 'El valor no cae en un paso válido de la escala',
            });
          }
        });
    }
    case 'rating':
      return z.number().int().min(1).max(block.scale);
  }
}

export type AnswerValidationResult =
  | { readonly ok: true; readonly value: AnswerValue }
  | { readonly ok: false; readonly issues: readonly { path: string; message: string }[] };

/** Valida una respuesta contra su bloque y devuelve el valor normalizado. */
export function validateAnswer(block: BlockDefinition, value: unknown): AnswerValidationResult {
  const normalized = value === undefined ? null : value;
  const parsed = answerSchemaFor(block).safeParse(normalized);
  if (parsed.success) {
    // El esquema devuelto por `answerSchemaFor` siempre produce un `AnswerValue`.
    return { ok: true, value: parsed.data as AnswerValue };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Constructores de conveniencia                                               */
/* -------------------------------------------------------------------------- */

/** Documento mínimo publicable, usado al crear un formulario nuevo. */
export function createDefaultFormDefinition(title: string): FormDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title, language: 'es' },
    theme: DEFAULT_THEME,
    blocks: [
      {
        id: 'welcome',
        type: 'welcome',
        title: '¡Hola!',
        buttonLabel: 'Empezar',
      },
    ],
    rules: [],
    endScreens: [
      {
        id: 'ending',
        type: 'ending',
        title: '¡Gracias!',
        body: 'Hemos recibido tu respuesta.',
      },
    ],
    settings: {
      showProgressBar: true,
      allowResume: true,
      showQuestionNumbers: false,
      notifyOnCompletion: true,
    },
  };
}

/** Parseo estricto del documento. Lanza si la forma no es válida. */
export function parseFormDefinition(input: unknown): FormDefinition {
  return formDefinitionSchema.parse(input);
}
