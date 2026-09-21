/**
 * Mensajes de validación en la interfaz.
 *
 * La autoridad sobre qué es una respuesta válida es `validateAnswer()` de
 * `@/lib/forms`: aquí no se reimplementa ninguna regla. Lo que se añade es la
 * **redacción en español** de los casos frecuentes, porque los mensajes que zod
 * genera por defecto (`Too small`, `Invalid input`) no son presentables.
 *
 * El orden es deliberado: primero los mensajes redactados; después, como red de
 * seguridad, el resultado de `validateAnswer` para cualquier caso que no se haya
 * previsto. Así una regla nueva en el contrato nunca pasa desapercibida.
 */

import {
  EMAIL_PATTERN,
  isEmptyAnswer,
  validateAnswer,
  type AnswerValue,
  type QuestionDefinition,
} from '@/lib/forms';

const PLURAL = (cantidad: number, singular: string, plural: string): string =>
  cantidad === 1 ? singular : plural;

function mensajeDeTexto(valor: string, bloque: QuestionDefinition): string | null {
  if (bloque.type !== 'short_text' && bloque.type !== 'long_text') return null;
  const minimo = bloque.validation?.minLength;
  const maximo = bloque.validation?.maxLength;
  const patron = bloque.validation?.pattern;

  if (minimo !== undefined && valor.length < minimo) {
    return `Escribe al menos ${String(minimo)} ${PLURAL(minimo, 'carácter', 'caracteres')}.`;
  }
  if (maximo !== undefined && valor.length > maximo) {
    return `No puede superar ${String(maximo)} ${PLURAL(maximo, 'carácter', 'caracteres')}.`;
  }
  if (patron !== undefined) {
    let expresion: RegExp | null = null;
    try {
      expresion = new RegExp(patron);
    } catch {
      // Un patrón corrupto en el documento no debe impedir responder: lo detecta
      // el validador de publicación, no el participante.
      expresion = null;
    }
    if (expresion !== null && !expresion.test(valor)) {
      return 'El formato no es válido.';
    }
  }
  return null;
}

function mensajeEspecifico(bloque: QuestionDefinition, valor: AnswerValue): string | null {
  switch (bloque.type) {
    case 'short_text':
    case 'long_text':
      return typeof valor === 'string' ? mensajeDeTexto(valor, bloque) : null;

    case 'email':
      return typeof valor === 'string' && !EMAIL_PATTERN.test(valor)
        ? 'Introduce un correo electrónico válido.'
        : null;

    case 'date': {
      if (typeof valor !== 'string') return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return 'Introduce una fecha válida.';
      const minimo = bloque.validation?.min;
      const maximo = bloque.validation?.max;
      if (minimo !== undefined && valor < minimo) return `La fecha no puede ser anterior a ${minimo}.`;
      if (maximo !== undefined && valor > maximo) return `La fecha no puede ser posterior a ${maximo}.`;
      return null;
    }

    case 'multi_choice': {
      if (!Array.isArray(valor)) return null;
      const minimo = bloque.minSelections;
      const maximo = bloque.maxSelections;
      if (minimo !== undefined && valor.length < minimo) {
        return `Selecciona al menos ${String(minimo)} ${PLURAL(minimo, 'opción', 'opciones')}.`;
      }
      if (maximo !== undefined && valor.length > maximo) {
        return `Selecciona como mucho ${String(maximo)} ${PLURAL(maximo, 'opción', 'opciones')}.`;
      }
      return null;
    }

    case 'single_choice':
    case 'scale':
    case 'rating':
      return null;
  }
}

/**
 * Mensaje de error de una respuesta, o `null` si es válida.
 *
 * Una pregunta no obligatoria dejada en blanco **siempre** es válida: es la
 * forma de saltarla.
 */
export function mensajeDeError(
  bloque: QuestionDefinition,
  valor: AnswerValue | undefined,
): string | null {
  const normalizado: AnswerValue = valor ?? null;

  if (isEmptyAnswer(normalizado)) {
    return bloque.required ? 'Esta pregunta es obligatoria.' : null;
  }

  const especifico = mensajeEspecifico(bloque, normalizado);
  if (especifico !== null) return especifico;

  const resultado = validateAnswer(bloque, normalizado);
  if (resultado.ok) return null;
  return resultado.issues[0]?.message ?? 'La respuesta no es válida.';
}

/** Valor inicial de un bloque cuando la sesión todavía no tiene respuesta. */
export function valorInicial(bloque: QuestionDefinition): AnswerValue {
  return bloque.type === 'multi_choice' ? [] : null;
}
