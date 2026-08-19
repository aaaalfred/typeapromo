/**
 * Traducción entre la `ScreenRef` del motor y la columna
 * `response_sessions.current_question_id`.
 *
 * La columna es un `text` y guarda el **identificador estable de la pantalla
 * actual**, sea un bloque del recorrido o una pantalla final. Los dos espacios
 * de identificadores no pueden chocar: el validador de publicación rechaza el
 * documento con `ID_COLLISION` si un bloque y una pantalla final comparten `id`,
 * y solo se responden versiones publicadas.
 *
 * `null` significa «el recorrido terminó y el documento no declara ninguna
 * pantalla final» (`ScreenRef` de tipo `complete`). No hay ambigüedad con «sin
 * empezar» porque la sesión nace con la primera pantalla ya escrita.
 *
 * Módulo **puro**.
 */

import type { FormDefinition, ScreenRef } from '@/lib/forms';

/** Identificador que se persiste para una pantalla. */
export function idDePantalla(pantalla: ScreenRef): string | null {
  return pantalla.kind === 'complete' ? null : pantalla.id;
}

/**
 * Resuelve el identificador guardado contra el documento **de la versión de la
 * sesión**, no contra el borrador. Un identificador que ya no exista en esa
 * versión (imposible salvo corrupción) cae a la primera pantalla en lugar de
 * dejar la sesión sin sitio donde continuar.
 */
export function pantallaDesdeId(
  definicion: FormDefinition,
  id: string | null,
): ScreenRef {
  if (id === null) return { kind: 'complete' };

  if (definicion.blocks.some((bloque) => bloque.id === id)) {
    return { kind: 'block', id };
  }
  if (definicion.endScreens.some((pantalla) => pantalla.id === id)) {
    return { kind: 'end_screen', id };
  }

  const primero = definicion.blocks[0];
  return primero === undefined ? { kind: 'complete' } : { kind: 'block', id: primero.id };
}
