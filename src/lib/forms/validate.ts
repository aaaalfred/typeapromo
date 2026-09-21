/**
 * Validador de publicación.
 *
 * Comprueba lo que `formDefinitionSchema` no puede comprobar: coherencia entre
 * partes del documento. Devuelve **errores tipados** — un código discriminante
 * más los datos concretos del problema — para que el editor pueda enlazar cada
 * aviso con el bloque o la regla que lo provoca sin volver a parsear un texto.
 *
 * Cubre los cuatro casos exigidos por el plan (destinos inexistentes, saltos
 * hacia atrás, preguntas inalcanzables y reglas contradictorias) y algunos más
 * que se detectan gratis con la misma información.
 */

import {
  OPERATORS_BY_QUESTION_TYPE,
  formDefinitionSchema,
  isChoiceBlock,
  isQuestionBlock,
  isUnaryOperator,
  type BlockType,
  type FormDefinition,
  type LogicOperator,
  type LogicRule,
  type LogicValue,
  type QuestionDefinition,
} from './definition';
import { indexForm, reachableFrom, staticRuleOutcome } from './engine';

/* -------------------------------------------------------------------------- */
/* Tipos de resultado                                                          */
/* -------------------------------------------------------------------------- */

interface IssueBase {
  /** Mensaje en español, listo para mostrarse junto al elemento afectado. */
  readonly message: string;
  /** Ruta dentro del documento, p. ej. `['blocks', 3, 'choices']`. */
  readonly path: readonly (string | number)[];
}

/** Problemas que impiden publicar. */
export type ValidationError = IssueBase &
  (
    | { readonly code: 'SCHEMA_INVALID'; readonly detail: string }
    | { readonly code: 'NO_BLOCKS' }
    | { readonly code: 'NO_END_SCREENS' }
    | { readonly code: 'DUPLICATE_BLOCK_ID'; readonly blockId: string }
    | { readonly code: 'DUPLICATE_END_SCREEN_ID'; readonly endScreenId: string }
    | { readonly code: 'ID_COLLISION'; readonly id: string }
    | { readonly code: 'DUPLICATE_RULE_ID'; readonly ruleId: string }
    | { readonly code: 'DUPLICATE_CHOICE_ID'; readonly blockId: string; readonly choiceId: string }
    | {
        readonly code: 'DUPLICATE_CHOICE_VALUE';
        readonly blockId: string;
        readonly choiceValue: string;
      }
    | { readonly code: 'MULTIPLE_WELCOME_BLOCKS'; readonly blockIds: readonly string[] }
    | { readonly code: 'WELCOME_NOT_FIRST'; readonly blockId: string; readonly position: number }
    | { readonly code: 'DEFAULT_END_SCREEN_NOT_FOUND'; readonly endScreenId: string }
    | {
        readonly code: 'INVALID_REDIRECT_URL';
        readonly endScreenId: string;
        readonly redirectUrl: string;
      }
    | {
        readonly code: 'INVALID_SCALE_RANGE';
        readonly blockId: string;
        readonly min: number;
        readonly max: number;
      }
    | {
        readonly code: 'INVALID_SCALE_STEP';
        readonly blockId: string;
        readonly step: number;
      }
    | {
        readonly code: 'INVALID_TEXT_LENGTH_RANGE';
        readonly blockId: string;
        readonly minLength: number;
        readonly maxLength: number;
      }
    | { readonly code: 'INVALID_TEXT_PATTERN'; readonly blockId: string; readonly pattern: string }
    | {
        readonly code: 'INVALID_DATE_RANGE';
        readonly blockId: string;
        readonly min: string;
        readonly max: string;
      }
    | {
        readonly code: 'INVALID_SELECTION_RANGE';
        readonly blockId: string;
        readonly minSelections?: number;
        readonly maxSelections?: number;
      }
    | {
        readonly code: 'RULE_SOURCE_NOT_FOUND';
        readonly ruleId: string;
        readonly sourceQuestionId: string;
      }
    | {
        readonly code: 'RULE_SOURCE_NOT_A_QUESTION';
        readonly ruleId: string;
        readonly sourceQuestionId: string;
        readonly blockType: BlockType;
      }
    | {
        readonly code: 'RULE_TARGET_NOT_FOUND';
        readonly ruleId: string;
        readonly targetKind: 'block' | 'end_screen';
        readonly targetId: string;
      }
    | { readonly code: 'RULE_TARGET_SELF'; readonly ruleId: string; readonly blockId: string }
    | {
        readonly code: 'RULE_TARGET_BACKWARD';
        readonly ruleId: string;
        readonly sourceQuestionId: string;
        readonly targetId: string;
      }
    | {
        readonly code: 'RULE_OPERATOR_NOT_APPLICABLE';
        readonly ruleId: string;
        readonly operator: LogicOperator;
        readonly blockType: BlockType;
      }
    | {
        readonly code: 'RULE_VALUE_REQUIRED';
        readonly ruleId: string;
        readonly operator: LogicOperator;
      }
    | {
        readonly code: 'RULE_VALUE_NOT_ALLOWED';
        readonly ruleId: string;
        readonly operator: LogicOperator;
      }
    | {
        readonly code: 'RULE_VALUE_TYPE_INVALID';
        readonly ruleId: string;
        readonly blockType: BlockType;
        readonly expected: string;
      }
    | {
        readonly code: 'RULE_CHOICE_NOT_FOUND';
        readonly ruleId: string;
        readonly blockId: string;
        readonly choiceValue: string;
      }
    | {
        readonly code: 'RULE_VALUE_OUT_OF_RANGE';
        readonly ruleId: string;
        readonly blockId: string;
        readonly value: number;
        readonly min: number;
        readonly max: number;
      }
    | {
        readonly code: 'DUPLICATE_RULE_PRIORITY';
        readonly sourceQuestionId: string;
        readonly priority: number;
        readonly ruleIds: readonly string[];
      }
    | {
        readonly code: 'CONTRADICTORY_RULES';
        readonly sourceQuestionId: string;
        readonly ruleIds: readonly string[];
        readonly operator: LogicOperator;
      }
    | { readonly code: 'UNREACHABLE_BLOCK'; readonly blockId: string }
  );

/** Problemas que no impiden publicar pero casi siempre delatan un error. */
export type ValidationWarning = IssueBase &
  (
    | { readonly code: 'NO_QUESTIONS' }
    | { readonly code: 'DEAD_RULE'; readonly ruleId: string }
    | { readonly code: 'SHADOWED_RULE'; readonly ruleId: string; readonly byRuleId: string }
    | {
        readonly code: 'REDUNDANT_RULES';
        readonly sourceQuestionId: string;
        readonly ruleIds: readonly string[];
      }
    | { readonly code: 'UNREACHABLE_END_SCREEN'; readonly endScreenId: string }
    | {
        readonly code: 'CHOICE_IMAGE_MISSING';
        readonly blockId: string;
        readonly choiceIds: readonly string[];
      }
  );

export type ValidationIssue = ValidationError | ValidationWarning;
export type ValidationErrorCode = ValidationError['code'];
export type ValidationWarningCode = ValidationWarning['code'];

/** Resultado del validador. `ok` es exactamente `errors.length === 0`. */
export interface ValidationReport {
  readonly ok: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
  /** Documento ya parseado, o `null` si ni siquiera pasó el esquema. */
  readonly definition: FormDefinition | null;
}

/* -------------------------------------------------------------------------- */
/* Entradas públicas                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Valida un documento sin confiar en su forma. Es lo que ejecuta
 * `POST /api/forms/:id/publish` antes de crear el snapshot.
 */
export function validateForPublication(input: unknown): ValidationReport {
  const parsed = formDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    const errors: ValidationError[] = parsed.error.issues.map((issue) => {
      const path: (string | number)[] = issue.path.map((segment) =>
        typeof segment === 'number' ? segment : String(segment),
      );
      return {
        code: 'SCHEMA_INVALID',
        detail: issue.message,
        message: `Documento inválido en «${path.join('.') || '(raíz)'}»: ${issue.message}`,
        path,
      };
    });
    return { ok: false, errors, warnings: [], definition: null };
  }
  const { errors, warnings } = validateDefinition(parsed.data);
  return { ok: errors.length === 0, errors, warnings, definition: parsed.data };
}

/** Comprobaciones semánticas sobre un documento ya parseado. */
export function validateDefinition(definition: FormDefinition): {
  errors: ValidationError[];
  warnings: ValidationWarning[];
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  checkStructure(definition, errors, warnings);
  checkBlockConfiguration(definition, errors, warnings);
  checkRules(definition, errors);
  checkRuleInteractions(definition, errors, warnings);
  checkReachability(definition, errors, warnings);

  return { errors, warnings };
}

/* -------------------------------------------------------------------------- */
/* Estructura                                                                  */
/* -------------------------------------------------------------------------- */

function checkStructure(
  definition: FormDefinition,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  if (definition.blocks.length === 0) {
    errors.push({
      code: 'NO_BLOCKS',
      message: 'El formulario no tiene ningún bloque.',
      path: ['blocks'],
    });
  }
  if (definition.endScreens.length === 0) {
    errors.push({
      code: 'NO_END_SCREENS',
      message: 'El formulario necesita al menos una pantalla final.',
      path: ['endScreens'],
    });
  }
  if (!definition.blocks.some(isQuestionBlock)) {
    warnings.push({
      code: 'NO_QUESTIONS',
      message: 'El formulario no contiene ninguna pregunta; no recogerá respuestas.',
      path: ['blocks'],
    });
  }

  const seenBlocks = new Set<string>();
  const welcomeIds: string[] = [];
  definition.blocks.forEach((block, position) => {
    if (seenBlocks.has(block.id)) {
      errors.push({
        code: 'DUPLICATE_BLOCK_ID',
        blockId: block.id,
        message: `Hay más de un bloque con el identificador «${block.id}».`,
        path: ['blocks', position, 'id'],
      });
    }
    seenBlocks.add(block.id);

    if (block.type === 'welcome') {
      welcomeIds.push(block.id);
      if (position !== 0) {
        errors.push({
          code: 'WELCOME_NOT_FIRST',
          blockId: block.id,
          position,
          message: 'La pantalla de bienvenida debe ser el primer bloque del formulario.',
          path: ['blocks', position],
        });
      }
    }
  });

  if (welcomeIds.length > 1) {
    errors.push({
      code: 'MULTIPLE_WELCOME_BLOCKS',
      blockIds: welcomeIds,
      message: 'Solo puede haber una pantalla de bienvenida.',
      path: ['blocks'],
    });
  }

  const seenEndScreens = new Set<string>();
  definition.endScreens.forEach((screen, position) => {
    if (seenEndScreens.has(screen.id)) {
      errors.push({
        code: 'DUPLICATE_END_SCREEN_ID',
        endScreenId: screen.id,
        message: `Hay más de una pantalla final con el identificador «${screen.id}».`,
        path: ['endScreens', position, 'id'],
      });
    }
    seenEndScreens.add(screen.id);

    if (seenBlocks.has(screen.id)) {
      errors.push({
        code: 'ID_COLLISION',
        id: screen.id,
        message: `El identificador «${screen.id}» lo usan a la vez un bloque y una pantalla final.`,
        path: ['endScreens', position, 'id'],
      });
    }

    if (screen.redirectUrl !== undefined) {
      if (!/^https?:\/\/[^\s]+$/.test(screen.redirectUrl)) {
        errors.push({
          code: 'INVALID_REDIRECT_URL',
          endScreenId: screen.id,
          redirectUrl: screen.redirectUrl,
          message: `La URL de redirección de la pantalla final «${screen.id}» debe comenzar por http:// o https://.`,
          path: ['endScreens', position, 'redirectUrl'],
        });
      }
    }
  });

  if (
    definition.defaultEndScreenId !== undefined &&
    !seenEndScreens.has(definition.defaultEndScreenId)
  ) {
    errors.push({
      code: 'DEFAULT_END_SCREEN_NOT_FOUND',
      endScreenId: definition.defaultEndScreenId,
      message: `La pantalla final por defecto «${definition.defaultEndScreenId}» no existe.`,
      path: ['defaultEndScreenId'],
    });
  }

  const seenRules = new Set<string>();
  definition.rules.forEach((rule, position) => {
    if (seenRules.has(rule.id)) {
      errors.push({
        code: 'DUPLICATE_RULE_ID',
        ruleId: rule.id,
        message: `Hay más de una regla con el identificador «${rule.id}».`,
        path: ['rules', position, 'id'],
      });
    }
    seenRules.add(rule.id);
  });
}

/* -------------------------------------------------------------------------- */
/* Configuración de cada bloque                                                */
/* -------------------------------------------------------------------------- */

function checkBlockConfiguration(
  definition: FormDefinition,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  definition.blocks.forEach((block, position) => {
    const path: (string | number)[] = ['blocks', position];

    if (isChoiceBlock(block)) {
      const seenIds = new Set<string>();
      const seenValues = new Set<string>();
      block.choices.forEach((choice, choicePosition) => {
        if (seenIds.has(choice.id)) {
          errors.push({
            code: 'DUPLICATE_CHOICE_ID',
            blockId: block.id,
            choiceId: choice.id,
            message: `La opción «${choice.id}» está repetida en «${block.title}».`,
            path: [...path, 'choices', choicePosition, 'id'],
          });
        }
        seenIds.add(choice.id);

        if (seenValues.has(choice.value)) {
          errors.push({
            code: 'DUPLICATE_CHOICE_VALUE',
            blockId: block.id,
            choiceValue: choice.value,
            message: `El valor «${choice.value}» está repetido en «${block.title}»; las reglas no podrían distinguir las dos opciones.`,
            path: [...path, 'choices', choicePosition, 'value'],
          });
        }
        seenValues.add(choice.value);
      });

      if (block.presentation === 'image_cards' || block.presentation === 'grid') {
        const missing = block.choices
          .filter((choice) => choice.assetId === undefined)
          .map((choice) => choice.id);
        if (missing.length > 0) {
          warnings.push({
            code: 'CHOICE_IMAGE_MISSING',
            blockId: block.id,
            choiceIds: missing,
            message: `«${block.title}» se muestra con imágenes pero ${String(missing.length)} opción(es) no tienen imagen.`,
            path: [...path, 'choices'],
          });
        }
      }
    }

    if (block.type === 'multi_choice') {
      const { minSelections, maxSelections } = block;
      const invalid =
        (minSelections !== undefined && maxSelections !== undefined && minSelections > maxSelections) ||
        (minSelections !== undefined && minSelections > block.choices.length) ||
        (maxSelections !== undefined && maxSelections > block.choices.length);
      if (invalid) {
        errors.push({
          code: 'INVALID_SELECTION_RANGE',
          blockId: block.id,
          ...(minSelections !== undefined ? { minSelections } : {}),
          ...(maxSelections !== undefined ? { maxSelections } : {}),
          message: `Los límites de selección de «${block.title}» no son alcanzables con ${String(block.choices.length)} opciones.`,
          path,
        });
      }
    }

    if (block.type === 'scale') {
      if (block.min >= block.max) {
        errors.push({
          code: 'INVALID_SCALE_RANGE',
          blockId: block.id,
          min: block.min,
          max: block.max,
          message: `El mínimo de «${block.title}» debe ser menor que el máximo.`,
          path,
        });
      } else if ((block.max - block.min) % block.step !== 0) {
        errors.push({
          code: 'INVALID_SCALE_STEP',
          blockId: block.id,
          step: block.step,
          message: `El paso de «${block.title}» no permite alcanzar el valor máximo.`,
          path: [...path, 'step'],
        });
      }
    }

    if (block.type === 'short_text' || block.type === 'long_text') {
      const { minLength, maxLength } = block.validation ?? {};
      if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
        errors.push({
          code: 'INVALID_TEXT_LENGTH_RANGE',
          blockId: block.id,
          minLength,
          maxLength,
          message: `La longitud mínima de «${block.title}» supera a la máxima.`,
          path: [...path, 'validation'],
        });
      }
      const { pattern } = block.validation ?? {};
      if (pattern !== undefined && !isCompilableRegExp(pattern)) {
        errors.push({
          code: 'INVALID_TEXT_PATTERN',
          blockId: block.id,
          pattern,
          message: `La expresión regular de «${block.title}» no es válida.`,
          path: [...path, 'validation', 'pattern'],
        });
      }
    }

    if (block.type === 'date') {
      const { min, max } = block.validation ?? {};
      if (min !== undefined && max !== undefined && min > max) {
        errors.push({
          code: 'INVALID_DATE_RANGE',
          blockId: block.id,
          min,
          max,
          message: `La fecha mínima de «${block.title}» es posterior a la máxima.`,
          path: [...path, 'validation'],
        });
      }
    }
  });
}

function isCompilableRegExp(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Reglas, una a una                                                           */
/* -------------------------------------------------------------------------- */

function checkRules(definition: FormDefinition, errors: ValidationError[]): void {
  const index = indexForm(definition);

  definition.rules.forEach((rule, position) => {
    const path: (string | number)[] = ['rules', position];
    const source = index.blockById.get(rule.sourceQuestionId);

    if (source === undefined) {
      errors.push({
        code: 'RULE_SOURCE_NOT_FOUND',
        ruleId: rule.id,
        sourceQuestionId: rule.sourceQuestionId,
        message: `La regla «${rule.id}» parte de un bloque inexistente («${rule.sourceQuestionId}»).`,
        path: [...path, 'sourceQuestionId'],
      });
      return;
    }

    if (!isQuestionBlock(source)) {
      errors.push({
        code: 'RULE_SOURCE_NOT_A_QUESTION',
        ruleId: rule.id,
        sourceQuestionId: rule.sourceQuestionId,
        blockType: source.type,
        message: `La regla «${rule.id}» parte de «${source.title}», que no recoge respuesta y por tanto no puede condicionar nada.`,
        path: [...path, 'sourceQuestionId'],
      });
      return;
    }

    checkRuleTarget(rule, index.order.get(source.id) ?? 0, index, errors, path);
    checkRuleOperator(rule, source, errors, path);
    checkRuleValue(rule, source, errors, path);
  });
}

function checkRuleTarget(
  rule: LogicRule,
  sourcePosition: number,
  index: ReturnType<typeof indexForm>,
  errors: ValidationError[],
  path: (string | number)[],
): void {
  if (rule.target.kind === 'end_screen') {
    if (!index.endScreenById.has(rule.target.id)) {
      errors.push({
        code: 'RULE_TARGET_NOT_FOUND',
        ruleId: rule.id,
        targetKind: 'end_screen',
        targetId: rule.target.id,
        message: `La regla «${rule.id}» apunta a una pantalla final inexistente («${rule.target.id}»).`,
        path: [...path, 'target'],
      });
    }
    return;
  }

  const targetPosition = index.order.get(rule.target.id);
  if (targetPosition === undefined) {
    errors.push({
      code: 'RULE_TARGET_NOT_FOUND',
      ruleId: rule.id,
      targetKind: 'block',
      targetId: rule.target.id,
      message: `La regla «${rule.id}» apunta a un bloque inexistente («${rule.target.id}»).`,
      path: [...path, 'target'],
    });
    return;
  }

  if (rule.target.id === rule.sourceQuestionId) {
    errors.push({
      code: 'RULE_TARGET_SELF',
      ruleId: rule.id,
      blockId: rule.sourceQuestionId,
      message: `La regla «${rule.id}» salta a su propia pregunta y crearía un ciclo.`,
      path: [...path, 'target'],
    });
    return;
  }

  if (targetPosition < sourcePosition) {
    errors.push({
      code: 'RULE_TARGET_BACKWARD',
      ruleId: rule.id,
      sourceQuestionId: rule.sourceQuestionId,
      targetId: rule.target.id,
      message: `La regla «${rule.id}» salta hacia atrás; solo se permiten saltos hacia adelante.`,
      path: [...path, 'target'],
    });
  }
}

function checkRuleOperator(
  rule: LogicRule,
  source: QuestionDefinition,
  errors: ValidationError[],
  path: (string | number)[],
): void {
  const allowed = OPERATORS_BY_QUESTION_TYPE[source.type];
  if (!allowed.includes(rule.operator)) {
    errors.push({
      code: 'RULE_OPERATOR_NOT_APPLICABLE',
      ruleId: rule.id,
      operator: rule.operator,
      blockType: source.type,
      message: `El operador «${rule.operator}» no se puede aplicar a una pregunta de tipo «${source.type}».`,
      path: [...path, 'operator'],
    });
  }
}

function checkRuleValue(
  rule: LogicRule,
  source: QuestionDefinition,
  errors: ValidationError[],
  path: (string | number)[],
): void {
  const valuePath = [...path, 'value'];

  if (isUnaryOperator(rule.operator)) {
    if (rule.value !== null) {
      errors.push({
        code: 'RULE_VALUE_NOT_ALLOWED',
        ruleId: rule.id,
        operator: rule.operator,
        message: `El operador «${rule.operator}» no admite un valor de comparación.`,
        path: valuePath,
      });
    }
    return;
  }

  if (rule.value === null) {
    errors.push({
      code: 'RULE_VALUE_REQUIRED',
      ruleId: rule.id,
      operator: rule.operator,
      message: `El operador «${rule.operator}» necesita un valor de comparación.`,
      path: valuePath,
    });
    return;
  }

  switch (source.type) {
    case 'scale':
    case 'rating': {
      if (typeof rule.value !== 'number' || !Number.isFinite(rule.value)) {
        errors.push({
          code: 'RULE_VALUE_TYPE_INVALID',
          ruleId: rule.id,
          blockType: source.type,
          expected: 'número',
          message: `La regla «${rule.id}» compara una pregunta numérica con un valor que no es un número.`,
          path: valuePath,
        });
        return;
      }
      const min = source.type === 'rating' ? 1 : source.min;
      const max = source.type === 'rating' ? source.scale : source.max;
      if (rule.value < min || rule.value > max) {
        errors.push({
          code: 'RULE_VALUE_OUT_OF_RANGE',
          ruleId: rule.id,
          blockId: source.id,
          value: rule.value,
          min,
          max,
          message: `La regla «${rule.id}» compara con ${String(rule.value)}, fuera del rango ${String(min)}–${String(max)} de la pregunta.`,
          path: valuePath,
        });
      }
      return;
    }
    case 'date': {
      if (typeof rule.value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rule.value)) {
        errors.push({
          code: 'RULE_VALUE_TYPE_INVALID',
          ruleId: rule.id,
          blockType: source.type,
          expected: 'fecha YYYY-MM-DD',
          message: `La regla «${rule.id}» compara una fecha con un valor que no tiene formato YYYY-MM-DD.`,
          path: valuePath,
        });
      }
      return;
    }
    case 'single_choice':
    case 'multi_choice': {
      const values = ruleValueAsStrings(rule.value);
      if (values === null) {
        errors.push({
          code: 'RULE_VALUE_TYPE_INVALID',
          ruleId: rule.id,
          blockType: source.type,
          expected: 'valor de opción (texto) o lista de valores',
          message: `La regla «${rule.id}» compara una pregunta de selección con un valor que no es el valor de una opción.`,
          path: valuePath,
        });
        return;
      }
      const available = new Set(source.choices.map((choice) => choice.value));
      for (const value of values) {
        if (!available.has(value)) {
          errors.push({
            code: 'RULE_CHOICE_NOT_FOUND',
            ruleId: rule.id,
            blockId: source.id,
            choiceValue: value,
            message: `La regla «${rule.id}» compara con la opción «${value}», que no existe en «${source.title}».`,
            path: valuePath,
          });
        }
      }
      return;
    }
    default: {
      if (typeof rule.value !== 'string') {
        errors.push({
          code: 'RULE_VALUE_TYPE_INVALID',
          ruleId: rule.id,
          blockType: source.type,
          expected: 'texto',
          message: `La regla «${rule.id}» compara una pregunta de texto con un valor que no es texto.`,
          path: valuePath,
        });
      }
    }
  }
}

function ruleValueAsStrings(value: LogicValue): string[] | null {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Interacción entre reglas del mismo origen                                   */
/* -------------------------------------------------------------------------- */

function conditionKey(rule: LogicRule): string {
  const value = Array.isArray(rule.value) ? [...rule.value].sort() : rule.value;
  return `${rule.operator}::${JSON.stringify(value)}`;
}

function targetKey(rule: LogicRule): string {
  return `${rule.target.kind}::${rule.target.id}`;
}

function checkRuleInteractions(
  definition: FormDefinition,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  const index = indexForm(definition);

  for (const [sourceId, rules] of index.rulesBySource) {
    const source = index.blockById.get(sourceId);
    if (source === undefined) continue;

    // Prioridades repetidas: el orden de evaluación dependería del array.
    const byPriority = new Map<number, string[]>();
    for (const rule of rules) {
      const bucket = byPriority.get(rule.priority);
      if (bucket) bucket.push(rule.id);
      else byPriority.set(rule.priority, [rule.id]);
    }
    for (const [priority, ruleIds] of byPriority) {
      if (ruleIds.length > 1) {
        errors.push({
          code: 'DUPLICATE_RULE_PRIORITY',
          sourceQuestionId: sourceId,
          priority,
          ruleIds,
          message: `Las reglas ${ruleIds.map((id) => `«${id}»`).join(', ')} comparten la prioridad ${String(priority)}; el orden de evaluación quedaría indefinido.`,
          path: ['rules'],
        });
      }
    }

    // Misma condición evaluada dos veces: solo puede ganar la primera.
    const byCondition = new Map<string, LogicRule[]>();
    for (const rule of rules) {
      const key = conditionKey(rule);
      const bucket = byCondition.get(key);
      if (bucket) bucket.push(rule);
      else byCondition.set(key, [rule]);
    }
    for (const group of byCondition.values()) {
      if (group.length < 2) continue;
      const targets = new Set(group.map(targetKey));
      const ruleIds = group.map((rule) => rule.id);
      if (targets.size > 1) {
        errors.push({
          code: 'CONTRADICTORY_RULES',
          sourceQuestionId: sourceId,
          ruleIds,
          operator: group[0]?.operator ?? 'equals',
          message: `Las reglas ${ruleIds.map((id) => `«${id}»`).join(', ')} evalúan la misma condición sobre «${source.title}» pero llevan a destinos distintos.`,
          path: ['rules'],
        });
      } else {
        warnings.push({
          code: 'REDUNDANT_RULES',
          sourceQuestionId: sourceId,
          ruleIds,
          message: `Las reglas ${ruleIds.map((id) => `«${id}»`).join(', ')} son idénticas; sobra todo menos la primera.`,
          path: ['rules'],
        });
      }
    }

    // Reglas muertas y reglas tapadas por una anterior que se cumple siempre.
    let alwaysMatching: LogicRule | null = null;
    for (const rule of rules) {
      if (alwaysMatching !== null) {
        warnings.push({
          code: 'SHADOWED_RULE',
          ruleId: rule.id,
          byRuleId: alwaysMatching.id,
          message: `La regla «${rule.id}» nunca se evaluará: «${alwaysMatching.id}» tiene más prioridad y se cumple siempre.`,
          path: ['rules'],
        });
        continue;
      }
      const outcome = staticRuleOutcome(rule, source);
      if (outcome === 'never') {
        warnings.push({
          code: 'DEAD_RULE',
          ruleId: rule.id,
          message: `La regla «${rule.id}» no puede cumplirse con ninguna respuesta admisible de «${source.title}».`,
          path: ['rules'],
        });
      } else if (outcome === 'always') {
        alwaysMatching = rule;
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Alcanzabilidad                                                              */
/* -------------------------------------------------------------------------- */

function checkReachability(
  definition: FormDefinition,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  const first = definition.blocks[0];
  if (first === undefined) return;

  // Sin ninguna respuesta conocida todas las ramas siguen abiertas, así que lo
  // que quede fuera de este recorrido es inalcanzable de verdad.
  const reachable = reachableFrom(definition, {}, first.id);
  const reachableBlocks = new Set(reachable.blocks);
  const reachableEndScreens = new Set(reachable.endScreens);

  definition.blocks.forEach((block, position) => {
    if (reachableBlocks.has(block.id)) return;
    errors.push({
      code: 'UNREACHABLE_BLOCK',
      blockId: block.id,
      message: `Al bloque «${block.title}» no se puede llegar por ningún recorrido.`,
      path: ['blocks', position],
    });
  });

  definition.endScreens.forEach((screen, position) => {
    if (reachableEndScreens.has(screen.id)) return;
    warnings.push({
      code: 'UNREACHABLE_END_SCREEN',
      endScreenId: screen.id,
      message: `A la pantalla final «${screen.title}» no llega ningún recorrido.`,
      path: ['endScreens', position],
    });
  });
}
