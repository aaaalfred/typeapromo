/**
 * Constructores de documentos para los tests.
 *
 * Todos los fixtures se construyen como **entrada** y se pasan por
 * `formDefinitionSchema.parse`, de modo que cada test ejercita también el
 * contrato y trabaja siempre con un documento con los valores por defecto ya
 * aplicados.
 */

import {
  DEFAULT_THEME,
  SCHEMA_VERSION,
  formDefinitionSchema,
  type FormDefinition,
  type FormDefinitionInput,
} from '../definition';

export type BlockInput = FormDefinitionInput['blocks'][number];
export type EndScreenInput = FormDefinitionInput['endScreens'][number];
export type RuleInput = NonNullable<FormDefinitionInput['rules']>[number];
export type RuleTargetInput = RuleInput['target'];

export function makeForm(input: {
  blocks: BlockInput[];
  rules?: RuleInput[];
  endScreens?: EndScreenInput[];
  defaultEndScreenId?: string;
  title?: string;
}): FormDefinition {
  return formDefinitionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    meta: { title: input.title ?? 'Formulario de prueba' },
    theme: DEFAULT_THEME,
    blocks: input.blocks,
    rules: input.rules ?? [],
    endScreens: input.endScreens ?? [ending('end')],
    ...(input.defaultEndScreenId !== undefined
      ? { defaultEndScreenId: input.defaultEndScreenId }
      : {}),
  });
}

/** Igual que `makeForm` pero sin pasar por el esquema, para probar el validador. */
export function makeRawForm(input: Record<string, unknown>): unknown {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Formulario de prueba' },
    theme: DEFAULT_THEME,
    blocks: [],
    rules: [],
    endScreens: [ending('end')],
    ...input,
  };
}

/* --- Bloques -------------------------------------------------------------- */

export const welcome = (id = 'welcome') =>
  ({ id, type: 'welcome', title: 'Bienvenida' }) satisfies BlockInput;

export const statement = (id: string) =>
  ({ id, type: 'statement', title: `Declaración ${id}` }) satisfies BlockInput;

export const shortText = (id: string, opts: { required?: boolean } = {}) =>
  ({ id, type: 'short_text', title: `Texto corto ${id}`, ...opts }) satisfies BlockInput;

export const longText = (id: string, opts: { required?: boolean } = {}) =>
  ({ id, type: 'long_text', title: `Texto largo ${id}`, ...opts }) satisfies BlockInput;

export const email = (id: string, opts: { required?: boolean } = {}) =>
  ({ id, type: 'email', title: `Correo ${id}`, ...opts }) satisfies BlockInput;

export const date = (id: string, opts: { required?: boolean } = {}) =>
  ({ id, type: 'date', title: `Fecha ${id}`, ...opts }) satisfies BlockInput;

export const singleChoice = (
  id: string,
  values: string[],
  opts: { required?: boolean; presentation?: 'list' | 'buttons' | 'image_cards' | 'grid' } = {},
) =>
  ({
    id,
    type: 'single_choice',
    title: `Selección única ${id}`,
    choices: values.map((value) => ({ id: `${id}-${value}`, label: value, value })),
    ...opts,
  }) satisfies BlockInput;

export const multiChoice = (
  id: string,
  values: string[],
  opts: { required?: boolean; minSelections?: number; maxSelections?: number } = {},
) =>
  ({
    id,
    type: 'multi_choice',
    title: `Selección múltiple ${id}`,
    choices: values.map((value) => ({ id: `${id}-${value}`, label: value, value })),
    ...opts,
  }) satisfies BlockInput;

export const scale = (
  id: string,
  opts: { required?: boolean; min?: number; max?: number; step?: number } = {},
) => ({ id, type: 'scale', title: `Escala ${id}`, ...opts }) satisfies BlockInput;

export const rating = (
  id: string,
  opts: {
    required?: boolean;
    scale?: 3 | 5 | 7 | 10;
    appearance?: 'stars' | 'faces' | 'hearts';
  } = {},
) => ({ id, type: 'rating', title: `Valoración ${id}`, ...opts }) satisfies BlockInput;

export const ending = (id: string) =>
  ({ id, type: 'ending', title: `Final ${id}` }) satisfies EndScreenInput;

/** Recupera un bloque ya parseado por identificador, o falla el test. */
export function blockOf(definition: FormDefinition, id: string) {
  const found = definition.blocks.find((block) => block.id === id);
  if (found === undefined) throw new Error(`El fixture no contiene el bloque «${id}»`);
  return found;
}

/* --- Reglas --------------------------------------------------------------- */

export const toBlock = (id: string) => ({ kind: 'block', id }) satisfies RuleTargetInput;
export const toEnd = (id: string) => ({ kind: 'end_screen', id }) satisfies RuleTargetInput;

export function rule(
  id: string,
  sourceQuestionId: string,
  operator: RuleInput['operator'],
  value: RuleInput['value'],
  target: RuleTargetInput,
  priority = 1,
): RuleInput {
  return { id, sourceQuestionId, operator, value, priority, target };
}
