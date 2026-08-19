/**
 * Soporte de la interfaz de reglas de lógica.
 *
 * No decide nada: la tabla de operadores aplicables, la evaluación y la
 * validación viven en `@/lib/forms`. Aquí solo se traduce a lo que necesita un
 * formulario de tres desplegables —qué operadores ofrecer, qué control pintar
 * para el valor y qué destinos son legales— para que el editor no pueda
 * proponer una combinación que el validador vaya a rechazar después.
 */

import {
  OPERATORS_BY_QUESTION_TYPE,
  isQuestionBlock,
  isUnaryOperator,
  type FormDefinition,
  type LogicOperator,
  type LogicValue,
  type QuestionDefinition,
  type RuleTarget,
} from '@/lib/forms';

/* -------------------------------------------------------------------------- */
/* Vocabulario                                                                 */
/* -------------------------------------------------------------------------- */

/** Redacción en español de cada operador, pensada para leerse en una frase. */
export const ETIQUETAS_DE_OPERADOR: Readonly<Record<LogicOperator, string>> = {
  equals: 'es igual a',
  not_equals: 'no es igual a',
  contains: 'contiene',
  not_contains: 'no contiene',
  greater_than: 'es mayor que',
  greater_or_equal: 'es mayor o igual que',
  less_than: 'es menor que',
  less_or_equal: 'es menor o igual que',
  is_selected: 'tiene seleccionada',
  is_not_selected: 'no tiene seleccionada',
  is_empty: 'está vacía',
  is_not_empty: 'no está vacía',
};

/** Operadores admitidos por el tipo de la pregunta de origen. */
export function operadoresPara(pregunta: QuestionDefinition): readonly LogicOperator[] {
  return OPERATORS_BY_QUESTION_TYPE[pregunta.type];
}

/** Control que hay que pintar para el operando derecho de la regla. */
export type FormaDeValor = 'ninguno' | 'texto' | 'numero' | 'fecha' | 'opcion' | 'opciones';

export function formaDeValor(
  pregunta: QuestionDefinition,
  operador: LogicOperator,
): FormaDeValor {
  if (isUnaryOperator(operador)) return 'ninguno';
  switch (pregunta.type) {
    case 'scale':
    case 'rating':
      return 'numero';
    case 'date':
      return 'fecha';
    case 'single_choice':
      return 'opcion';
    case 'multi_choice':
      return 'opciones';
    default:
      return 'texto';
  }
}

/**
 * Valor inicial coherente al crear la regla o al cambiar de operador.
 *
 * Es lo que evita el estado intermedio inválido más común: pasar de «está
 * vacía» a «es igual a» dejando el valor en `null`, que el validador marca como
 * `RULE_VALUE_REQUIRED` en cuanto se toca.
 */
export function valorPorDefecto(
  pregunta: QuestionDefinition,
  operador: LogicOperator,
): LogicValue {
  switch (formaDeValor(pregunta, operador)) {
    case 'ninguno':
      return null;
    case 'numero':
      return pregunta.type === 'rating' ? 1 : pregunta.type === 'scale' ? pregunta.min : 0;
    case 'fecha':
      return new Date().toISOString().slice(0, 10);
    case 'opcion':
      return pregunta.type === 'single_choice' ? (pregunta.choices[0]?.value ?? '') : '';
    case 'opciones':
      return pregunta.type === 'multi_choice' && pregunta.choices[0] !== undefined
        ? [pregunta.choices[0].value]
        : [];
    case 'texto':
      return '';
  }
}

/** Rango numérico admisible del operando derecho, para acotar el control. */
export function rangoNumerico(
  pregunta: QuestionDefinition,
): { readonly min: number; readonly max: number; readonly step: number } | null {
  if (pregunta.type === 'rating') return { min: 1, max: pregunta.scale, step: 1 };
  if (pregunta.type === 'scale') {
    return { min: pregunta.min, max: pregunta.max, step: pregunta.step };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Orígenes y destinos                                                         */
/* -------------------------------------------------------------------------- */

/** Preguntas del documento, en orden de recorrido. Son los únicos orígenes válidos. */
export function preguntasDe(definicion: FormDefinition): readonly QuestionDefinition[] {
  return definicion.blocks.filter(isQuestionBlock);
}

/** Opción de un desplegable de destino. */
export interface DestinoDisponible {
  readonly target: RuleTarget;
  /** Clave estable para el `value` del `<select>`. */
  readonly clave: string;
  readonly etiqueta: string;
}

/** Serializa un destino para poder ir y volver de un `<select>`. */
export function claveDeDestino(target: RuleTarget): string {
  return `${target.kind}:${target.id}`;
}

/** Deshace `claveDeDestino`. Devuelve `null` si la clave no es reconocible. */
export function destinoDesdeClave(clave: string): RuleTarget | null {
  const separador = clave.indexOf(':');
  if (separador < 0) return null;
  const kind = clave.slice(0, separador);
  const id = clave.slice(separador + 1);
  if (id === '') return null;
  if (kind === 'block') return { kind: 'block', id };
  if (kind === 'end_screen') return { kind: 'end_screen', id };
  return null;
}

/**
 * Destinos legales de una regla que sale de `origenId`: **solo hacia adelante**
 * (los bloques posteriores) y cualquier pantalla final, que siempre es terminal.
 *
 * Ofrecer únicamente lo legal es más honesto que dejar elegir y luego culpar al
 * usuario con `RULE_TARGET_BACKWARD`.
 */
export function destinosDisponibles(
  definicion: FormDefinition,
  origenId: string,
): readonly DestinoDisponible[] {
  const posicion = definicion.blocks.findIndex((bloque) => bloque.id === origenId);
  const destinos: DestinoDisponible[] = [];

  if (posicion >= 0) {
    for (const bloque of definicion.blocks.slice(posicion + 1)) {
      const target: RuleTarget = { kind: 'block', id: bloque.id };
      destinos.push({ target, clave: claveDeDestino(target), etiqueta: bloque.title });
    }
  }

  for (const pantalla of definicion.endScreens) {
    const target: RuleTarget = { kind: 'end_screen', id: pantalla.id };
    destinos.push({
      target,
      clave: claveDeDestino(target),
      etiqueta: `Pantalla final · ${pantalla.title}`,
    });
  }

  return destinos;
}

/** Reglas de un origen, ordenadas por prioridad ascendente (la que gana, primero). */
export function reglasDe(definicion: FormDefinition, origenId: string) {
  return definicion.rules
    .filter((regla) => regla.sourceQuestionId === origenId)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Frase legible de una regla, para la lista y para los mensajes de diagnóstico.
 * Se apoya en las etiquetas de las opciones, no en sus valores internos.
 */
export function describirValor(pregunta: QuestionDefinition, valor: LogicValue): string {
  if (valor === null) return '';
  if (Array.isArray(valor)) {
    return valor.map((elemento) => describirValor(pregunta, elemento)).join(', ');
  }
  if (typeof valor === 'string' && (pregunta.type === 'single_choice' || pregunta.type === 'multi_choice')) {
    const opcion = pregunta.choices.find((candidata) => candidata.value === valor);
    return opcion?.label ?? valor;
  }
  return String(valor);
}
