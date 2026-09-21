'use client';

import type { AnswerValue, QuestionDefinition } from '@/lib/forms';

import { describedBy, idsDePantalla, useFormulario } from '../contexto';

/** Lee una respuesta como texto sin recurrir a aserciones de tipo. */
export function textoDe(valor: AnswerValue | undefined): string {
  return typeof valor === 'string' ? valor : '';
}

/**
 * Cableado común de un control de respuesta: valor actual, escritura y los
 * atributos ARIA que lo enlazan con el título, la descripción y el error de su
 * pantalla.
 *
 * Se centraliza porque la accesibilidad escrita once veces se rompe once veces.
 */
export function useControl(bloque: QuestionDefinition) {
  const { respuestas, establecerRespuesta, error, avanzar } = useFormulario();
  const ids = idsDePantalla(bloque.id);
  const tieneDescripcion = bloque.description !== undefined && bloque.description !== '';

  return {
    ids,
    error,
    avanzar,
    valor: respuestas[bloque.id],
    establecer: (nuevo: AnswerValue): void => {
      establecerRespuesta(bloque.id, nuevo);
    },
    /** Atributos que deben ir en el elemento que recibe el foco. */
    atributos: {
      id: ids.control,
      'aria-labelledby': ids.titulo,
      'aria-describedby': describedBy(
        tieneDescripcion ? ids.descripcion : null,
        error !== null ? ids.error : null,
      ),
      'aria-invalid': error !== null,
      'aria-required': bloque.required,
      'data-autofoco': 'true',
    },
  };
}
