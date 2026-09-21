/**
 * Motor de recorrido.
 *
 * Reglas del modelo, todas verificadas por el validador de publicación y
 * defendidas además aquí en tiempo de ejecución:
 *
 * 1. El flujo es **secuencial por defecto**: al terminar un bloque se pasa al
 *    siguiente del array `blocks`.
 * 2. Las reglas de un mismo origen se evalúan por **prioridad explícita
 *    ascendente** (`priority: 1` antes que `priority: 2`). Gana la primera que
 *    se cumple; el resto no se evalúa.
 * 3. **Solo se permiten saltos hacia adelante.** Un destino que apunte al mismo
 *    bloque o a uno anterior se ignora, de modo que el recorrido no puede
 *    entrar en un ciclo ni con un documento corrupto.
 * 4. Al caer del último bloque se muestra la pantalla final por defecto.
 */

import {
  hasAnswer,
  isEmptyAnswer,
  isQuestionBlock,
  type AnswerValue,
  type AnswersMap,
  type BlockDefinition,
  type EndingBlock,
  type FlowBlockDefinition,
  type FormDefinition,
  type LogicOperator,
  type LogicRule,
  type LogicValue,
  type QuestionDefinition,
} from './definition';

/* -------------------------------------------------------------------------- */
/* Tipos públicos                                                              */
/* -------------------------------------------------------------------------- */

/** Referencia a una pantalla del recorrido. */
export type ScreenRef =
  | { readonly kind: 'block'; readonly id: string }
  | { readonly kind: 'end_screen'; readonly id: string }
  /** El formulario termina y no hay ninguna pantalla final declarada. */
  | { readonly kind: 'complete' };

/** Error de uso del motor: el identificador no existe en la definición. */
export class UnknownScreenError extends Error {
  readonly screenId: string;

  constructor(screenId: string) {
    super(`La pantalla «${screenId}» no existe en la definición`);
    this.name = 'UnknownScreenError';
    this.screenId = screenId;
  }
}

/** Índice derivado de una definición. Se construye una vez por operación. */
export interface FormIndex {
  readonly definition: FormDefinition;
  /** Posición de cada bloque en el recorrido secuencial. */
  readonly order: ReadonlyMap<string, number>;
  readonly blockById: ReadonlyMap<string, FlowBlockDefinition>;
  readonly endScreenById: ReadonlyMap<string, EndingBlock>;
  /** Reglas por origen, ya ordenadas por prioridad ascendente. */
  readonly rulesBySource: ReadonlyMap<string, readonly LogicRule[]>;
  readonly defaultEndScreenId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Índice                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Orden de declaración de cada regla, usado solo como desempate estable cuando
 * dos reglas del mismo origen comparten prioridad (que el validador rechaza).
 */
const declarationOrderOf = new WeakMap<LogicRule, number>();

/**
 * Construye el índice de una definición. Es O(bloques + reglas) y no cachea a
 * propósito: el editor muta el borrador entre pulsaciones de tecla y una caché
 * por identidad de objeto devolvería recorridos obsoletos.
 */
export function indexForm(definition: FormDefinition): FormIndex {
  const order = new Map<string, number>();
  const blockById = new Map<string, FlowBlockDefinition>();
  definition.blocks.forEach((block, position) => {
    if (!order.has(block.id)) {
      order.set(block.id, position);
      blockById.set(block.id, block);
    }
  });

  const endScreenById = new Map<string, EndingBlock>();
  for (const screen of definition.endScreens) {
    if (!endScreenById.has(screen.id)) endScreenById.set(screen.id, screen);
  }

  const rulesBySource = new Map<string, LogicRule[]>();
  definition.rules.forEach((rule, declarationOrder) => {
    const bucket = rulesBySource.get(rule.sourceQuestionId);
    if (bucket) bucket.push(rule);
    else rulesBySource.set(rule.sourceQuestionId, [rule]);
    declarationOrderOf.set(rule, declarationOrder);
  });
  for (const bucket of rulesBySource.values()) {
    bucket.sort(
      (a, b) =>
        a.priority - b.priority ||
        (declarationOrderOf.get(a) ?? 0) - (declarationOrderOf.get(b) ?? 0),
    );
  }

  const defaultEndScreenId =
    definition.defaultEndScreenId !== undefined && endScreenById.has(definition.defaultEndScreenId)
      ? definition.defaultEndScreenId
      : (definition.endScreens[0]?.id ?? null);

  return { definition, order, blockById, endScreenById, rulesBySource, defaultEndScreenId };
}

/* -------------------------------------------------------------------------- */
/* Evaluación de operadores                                                    */
/* -------------------------------------------------------------------------- */

const TEXT_BLOCK_TYPES: ReadonlySet<string> = new Set(['short_text', 'long_text', 'email']);

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function toNumber(value: AnswerValue | LogicValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value: AnswerValue | LogicValue): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Convierte ambos operandos a números comparables según el tipo de bloque.
 * Devuelve `null` cuando la comparación no tiene sentido, y en ese caso la
 * regla no se cumple.
 */
function comparablePair(
  block: BlockDefinition,
  answer: AnswerValue,
  ruleValue: LogicValue,
): readonly [number, number] | null {
  const convert = block.type === 'date' ? toDate : toNumber;
  const left = convert(answer);
  const right = convert(ruleValue);
  if (left === null || right === null) return null;
  return [left, right];
}

function valuesEqual(block: BlockDefinition, answer: AnswerValue, ruleValue: LogicValue): boolean {
  if (Array.isArray(answer)) {
    if (!Array.isArray(ruleValue)) return false;
    if (answer.length !== ruleValue.length) return false;
    const expected = new Set(ruleValue);
    return answer.every((item) => expected.has(item));
  }
  if (Array.isArray(ruleValue)) return false;

  if (block.type === 'date') {
    const pair = comparablePair(block, answer, ruleValue);
    return pair !== null && pair[0] === pair[1];
  }
  if (typeof answer === 'number' || typeof ruleValue === 'number') {
    const pair = comparablePair(block, answer, ruleValue);
    return pair !== null && pair[0] === pair[1];
  }
  if (typeof answer === 'string' && typeof ruleValue === 'string') {
    return TEXT_BLOCK_TYPES.has(block.type)
      ? normalizeText(answer) === normalizeText(ruleValue)
      : answer === ruleValue;
  }
  return answer === ruleValue;
}

/**
 * `contains` exige que estén **todos** los valores buscados: sobre texto es la
 * subcadena, sobre selección múltiple es «tiene todas estas opciones».
 */
function valueContains(
  block: BlockDefinition,
  answer: AnswerValue,
  ruleValue: LogicValue,
): boolean {
  if (Array.isArray(answer)) {
    const needles = Array.isArray(ruleValue) ? ruleValue : [ruleValue];
    return needles.every(
      (needle) => typeof needle === 'string' && answer.includes(needle),
    );
  }
  if (typeof answer !== 'string' || typeof ruleValue !== 'string') return false;
  return TEXT_BLOCK_TYPES.has(block.type)
    ? normalizeText(answer).includes(normalizeText(ruleValue))
    : answer.includes(ruleValue);
}

/**
 * `is_selected` se cumple con que esté **alguno** de los valores buscados. Es la
 * diferencia deliberada con `contains`, que los exige todos.
 */
function valueSelected(answer: AnswerValue, ruleValue: LogicValue): boolean {
  if (Array.isArray(answer)) {
    const needles = Array.isArray(ruleValue) ? ruleValue : [ruleValue];
    return needles.some((needle) => typeof needle === 'string' && answer.includes(needle));
  }
  if (Array.isArray(ruleValue)) {
    return typeof answer === 'string' && ruleValue.includes(answer);
  }
  return answer === ruleValue;
}

/**
 * Evalúa un operador aislado.
 *
 * Convención con respuesta vacía (sin responder, cadena vacía o lista vacía):
 * solo se cumplen `is_empty`, `not_equals`, `not_contains` e `is_not_selected`.
 * El resto de operadores devuelven `false`, de modo que una pregunta saltada
 * nunca dispara una bifurcación por comparación.
 */
export function evaluateOperator(
  operator: LogicOperator,
  block: BlockDefinition,
  answer: AnswerValue | undefined,
  ruleValue: LogicValue,
): boolean {
  const value: AnswerValue = answer ?? null;
  const empty = isEmptyAnswer(value);

  switch (operator) {
    case 'is_empty':
      return empty;
    case 'is_not_empty':
      return !empty;
    case 'not_equals':
      return empty ? true : !valuesEqual(block, value, ruleValue);
    case 'not_contains':
      return empty ? true : !valueContains(block, value, ruleValue);
    case 'is_not_selected':
      return empty ? true : !valueSelected(value, ruleValue);
    default:
      break;
  }

  if (empty) return false;

  switch (operator) {
    case 'equals':
      return valuesEqual(block, value, ruleValue);
    case 'contains':
      return valueContains(block, value, ruleValue);
    case 'is_selected':
      return valueSelected(value, ruleValue);
    case 'greater_than': {
      const pair = comparablePair(block, value, ruleValue);
      return pair !== null && pair[0] > pair[1];
    }
    case 'greater_or_equal': {
      const pair = comparablePair(block, value, ruleValue);
      return pair !== null && pair[0] >= pair[1];
    }
    case 'less_than': {
      const pair = comparablePair(block, value, ruleValue);
      return pair !== null && pair[0] < pair[1];
    }
    case 'less_or_equal': {
      const pair = comparablePair(block, value, ruleValue);
      return pair !== null && pair[0] <= pair[1];
    }
    default:
      return false;
  }
}

/** Evalúa una regla completa contra el conjunto de respuestas. */
export function evaluateRule(rule: LogicRule, block: BlockDefinition, answers: AnswersMap): boolean {
  return evaluateOperator(rule.operator, block, answers[rule.sourceQuestionId], rule.value);
}

/* -------------------------------------------------------------------------- */
/* Análisis estático de reglas                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Resultado que puede tener una regla **sin conocer la respuesta**:
 * - `always`: se cumple para cualquier respuesta admisible.
 * - `never`: no puede cumplirse nunca (regla muerta).
 * - `maybe`: depende de la respuesta.
 */
export type StaticOutcome = 'always' | 'never' | 'maybe';

function numericDomain(block: QuestionDefinition): readonly [number, number] | null {
  if (block.type === 'rating') return [1, block.scale];
  if (block.type === 'scale') return [block.min, block.max];
  return null;
}

/**
 * Analiza si una regla puede cumplirse. Es la base de dos comprobaciones del
 * validador — reglas muertas y bloques inalcanzables — y de la estimación de
 * `reachableFrom` cuando la respuesta todavía no se conoce.
 */
export function staticRuleOutcome(rule: LogicRule, block: BlockDefinition): StaticOutcome {
  if (!isQuestionBlock(block)) {
    // Un bloque sin respuesta está siempre vacío.
    return evaluateOperator(rule.operator, block, null, rule.value) ? 'always' : 'never';
  }

  const canBeEmpty = !block.required;

  switch (rule.operator) {
    case 'is_empty':
      return canBeEmpty ? 'maybe' : 'never';
    case 'is_not_empty':
      return canBeEmpty ? 'maybe' : 'always';
    default:
      break;
  }

  const domain = numericDomain(block);
  if (domain !== null) {
    const [lo, hi] = domain;
    const target = toNumber(rule.value);
    if (target === null) return 'never';
    switch (rule.operator) {
      case 'equals':
        if (target < lo || target > hi) return 'never';
        return lo === hi && !canBeEmpty ? 'always' : 'maybe';
      case 'not_equals':
        // Con respuesta vacía `not_equals` también se cumple, así que basta con
        // que el valor quede fuera del dominio para que la regla sea constante.
        return target < lo || target > hi ? 'always' : 'maybe';
      case 'greater_than':
        if (target >= hi) return 'never';
        return target < lo && !canBeEmpty ? 'always' : 'maybe';
      case 'greater_or_equal':
        if (target > hi) return 'never';
        return target <= lo && !canBeEmpty ? 'always' : 'maybe';
      case 'less_than':
        if (target <= lo) return 'never';
        return target > hi && !canBeEmpty ? 'always' : 'maybe';
      case 'less_or_equal':
        if (target < lo) return 'never';
        return target >= hi && !canBeEmpty ? 'always' : 'maybe';
      default:
        return 'maybe';
    }
  }

  if (block.type === 'single_choice' || block.type === 'multi_choice') {
    const available = new Set(block.choices.map((choice) => choice.value));
    const needles = Array.isArray(rule.value)
      ? rule.value
      : typeof rule.value === 'string'
        ? [rule.value]
        : [];
    if (needles.length === 0) return 'maybe';
    const anyAvailable = needles.some((needle) => available.has(needle));
    switch (rule.operator) {
      case 'equals':
      case 'is_selected':
      case 'contains':
        if (!anyAvailable) return 'never';
        if (
          block.type === 'single_choice' &&
          !canBeEmpty &&
          block.choices.length === 1 &&
          needles.length === 1 &&
          available.has(needles[0] as string)
        ) {
          return 'always';
        }
        return 'maybe';
      case 'not_equals':
      case 'is_not_selected':
      case 'not_contains':
        return anyAvailable ? 'maybe' : 'always';
      default:
        return 'maybe';
    }
  }

  return 'maybe';
}

/* -------------------------------------------------------------------------- */
/* Recorrido                                                                   */
/* -------------------------------------------------------------------------- */

function endScreenOrComplete(index: FormIndex): ScreenRef {
  return index.defaultEndScreenId === null
    ? { kind: 'complete' }
    : { kind: 'end_screen', id: index.defaultEndScreenId };
}

function sequentialNext(index: FormIndex, position: number): ScreenRef {
  const next = index.definition.blocks[position + 1];
  return next === undefined ? endScreenOrComplete(index) : { kind: 'block', id: next.id };
}

/**
 * `true` si el destino existe y está estrictamente por delante del origen.
 * Las pantallas finales son siempre destinos válidos: son terminales.
 */
function isForwardTarget(index: FormIndex, sourcePosition: number, rule: LogicRule): boolean {
  if (rule.target.kind === 'end_screen') return index.endScreenById.has(rule.target.id);
  const targetPosition = index.order.get(rule.target.id);
  return targetPosition !== undefined && targetPosition > sourcePosition;
}

function targetToScreen(rule: LogicRule): ScreenRef {
  return rule.target.kind === 'end_screen'
    ? { kind: 'end_screen', id: rule.target.id }
    : { kind: 'block', id: rule.target.id };
}

/** Primera pantalla del formulario. */
export function firstScreen(definition: FormDefinition): ScreenRef {
  const index = indexForm(definition);
  const first = definition.blocks[0];
  return first === undefined ? endScreenOrComplete(index) : { kind: 'block', id: first.id };
}

/**
 * Siguiente pantalla dada la definición, las respuestas conocidas y la pantalla
 * actual.
 *
 * - `currentId === null` devuelve la primera pantalla.
 * - Si `currentId` es una pantalla final, el recorrido ya ha terminado.
 * - Lanza `UnknownScreenError` si el identificador no pertenece al documento.
 */
export function nextScreen(
  definition: FormDefinition,
  answers: AnswersMap,
  currentId: string | null,
): ScreenRef {
  const index = indexForm(definition);
  if (currentId === null) return firstScreen(definition);
  if (index.endScreenById.has(currentId)) return { kind: 'complete' };

  const position = index.order.get(currentId);
  const block = index.blockById.get(currentId);
  if (position === undefined || block === undefined) throw new UnknownScreenError(currentId);

  for (const rule of index.rulesBySource.get(currentId) ?? []) {
    if (!isForwardTarget(index, position, rule)) continue;
    if (evaluateRule(rule, block, answers)) return targetToScreen(rule);
  }

  return sequentialNext(index, position);
}

/**
 * Sucesores posibles de un bloque.
 *
 * Si la respuesta del bloque ya se conoce, el sucesor es único y determinista.
 * Si no, se devuelven todas las ramas que todavía podrían tomarse: los destinos
 * de las reglas que pueden cumplirse, más el siguiente secuencial salvo que una
 * regla de prioridad superior se cumpla siempre.
 */
function possibleSuccessors(index: FormIndex, blockId: string, answers: AnswersMap): ScreenRef[] {
  const position = index.order.get(blockId);
  const block = index.blockById.get(blockId);
  if (position === undefined || block === undefined) throw new UnknownScreenError(blockId);

  const rules = (index.rulesBySource.get(blockId) ?? []).filter((rule) =>
    isForwardTarget(index, position, rule),
  );

  const decided = !isQuestionBlock(block) || hasAnswer(answers, blockId);
  if (decided) {
    for (const rule of rules) {
      if (evaluateRule(rule, block, answers)) return [targetToScreen(rule)];
    }
    return [sequentialNext(index, position)];
  }

  const successors: ScreenRef[] = [];
  for (const rule of rules) {
    const outcome = staticRuleOutcome(rule, block);
    if (outcome === 'never') continue;
    successors.push(targetToScreen(rule));
    if (outcome === 'always') return successors;
  }
  successors.push(sequentialNext(index, position));
  return successors;
}

/** Conjunto de pantallas alcanzables desde una pantalla dada. */
export interface ReachableSet {
  /** Bloques alcanzables, incluida la pantalla actual, en orden de recorrido. */
  readonly blocks: readonly string[];
  /** Subconjunto de `blocks` que son preguntas. Es la base de la barra de progreso. */
  readonly questions: readonly string[];
  /** Pantallas finales que todavía podrían mostrarse. */
  readonly endScreens: readonly string[];
  /**
   * `true` si el recorrido restante está completamente determinado por las
   * respuestas ya introducidas y no depende de ninguna bifurcación abierta.
   */
  readonly deterministic: boolean;
}

/**
 * Preguntas alcanzables desde la pantalla actual dadas las respuestas ya
 * introducidas (PLAN.md §2.7).
 *
 * Para cada bloque cuya respuesta ya se conoce la bifurcación está resuelta y
 * solo se sigue la rama real; para los que todavía no se han respondido se
 * suman todas las ramas posibles. Por eso el resultado es una **estimación**
 * que puede encogerse o crecer al avanzar, y así se documenta al usuario.
 *
 * El grafo es acíclico porque solo se admiten saltos hacia adelante, pero se
 * mantiene un conjunto de visitados por si la definición llegara corrupta.
 */
export function reachableFrom(
  definition: FormDefinition,
  answers: AnswersMap,
  currentId: string | null,
): ReachableSet {
  const index = indexForm(definition);
  const start = currentId ?? definition.blocks[0]?.id ?? null;

  if (start === null || index.endScreenById.has(start)) {
    const endScreens = start !== null && index.endScreenById.has(start) ? [start] : [];
    return { blocks: [], questions: [], endScreens, deterministic: true };
  }
  if (!index.order.has(start)) throw new UnknownScreenError(start);

  const visited = new Set<string>();
  const endScreens = new Set<string>();
  let deterministic = true;
  const queue: string[] = [start];

  while (queue.length > 0) {
    const blockId = queue.shift() as string;
    if (visited.has(blockId)) continue;
    visited.add(blockId);

    const successors = possibleSuccessors(index, blockId, answers);
    if (successors.length > 1) deterministic = false;
    for (const successor of successors) {
      if (successor.kind === 'block') {
        if (!visited.has(successor.id)) queue.push(successor.id);
      } else if (successor.kind === 'end_screen') {
        endScreens.add(successor.id);
      }
    }
  }

  const blocks = definition.blocks
    .filter((block) => visited.has(block.id))
    .map((block) => block.id);
  const questions = definition.blocks
    .filter((block) => visited.has(block.id) && isQuestionBlock(block))
    .map((block) => block.id);

  return {
    blocks,
    questions,
    endScreens: definition.endScreens
      .filter((screen) => endScreens.has(screen.id))
      .map((screen) => screen.id),
    deterministic,
  };
}

/** Número de preguntas alcanzables desde la pantalla actual, la actual incluida. */
export function countReachableQuestions(
  definition: FormDefinition,
  answers: AnswersMap,
  currentId: string | null,
): number {
  return reachableFrom(definition, answers, currentId).questions.length;
}

/** Estado de la barra de progreso. */
export interface FormProgress {
  /** Preguntas ya respondidas, sin contar la actual. */
  readonly answered: number;
  /** Preguntas alcanzables desde la actual, la actual incluida. */
  readonly remaining: number;
  /** Estimación del total del recorrido. */
  readonly total: number;
  /** `answered / total`, acotado a `[0, 1]`. */
  readonly ratio: number;
  /** `true` si el total ya no puede variar al seguir respondiendo. */
  readonly deterministic: boolean;
}

/**
 * Progreso según el recorrido efectivo, no según el total de preguntas del
 * documento.
 */
export function progressFor(
  definition: FormDefinition,
  answers: AnswersMap,
  currentId: string | null,
): FormProgress {
  const reachable = reachableFrom(definition, answers, currentId);

  let answered = 0;
  for (const block of definition.blocks) {
    if (!isQuestionBlock(block)) continue;
    if (block.id === currentId) continue;
    if (hasAnswer(answers, block.id)) answered += 1;
  }

  const remaining = reachable.questions.length;
  const total = answered + remaining;
  const ratio = total === 0 ? 1 : Math.min(1, Math.max(0, answered / total));

  return { answered, remaining, total, ratio, deterministic: reachable.deterministic };
}

/**
 * Recorre el formulario desde el principio aplicando las respuestas dadas y
 * devuelve la secuencia de pantallas visitadas. Es lo que usan la exportación
 * CSV y los tests para comprobar un recorrido completo de una sola pasada.
 */
export function walkPath(definition: FormDefinition, answers: AnswersMap): ScreenRef[] {
  const path: ScreenRef[] = [];
  const limit = definition.blocks.length + 1;
  let current = firstScreen(definition);

  for (let step = 0; step <= limit; step += 1) {
    path.push(current);
    if (current.kind !== 'block') break;
    current = nextScreen(definition, answers, current.id);
  }

  return path;
}
