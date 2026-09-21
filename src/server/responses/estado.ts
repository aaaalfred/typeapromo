/**
 * Estado público de un formulario y su mensaje.
 *
 * Módulo **puro**: no importa `@/db` y por tanto no abre el pool al cargarse,
 * así que sus tests corren sin `DATABASE_URL`. `publico.ts` lo usa y lo
 * reexporta.
 */

import type { FormDefinition } from '@/lib/forms';

/**
 * Estado público del formulario:
 *
 * - `disponible`: admite respuestas.
 * - `cerrado`: se publicó y ya no admite respuestas; los resultados se conservan.
 * - `archivado`: retirado del panel; tampoco admite respuestas.
 * - `sin_publicar`: nunca ha tenido una versión activa. No hay nada que enseñar.
 */
export type EstadoPublico = 'disponible' | 'cerrado' | 'archivado' | 'sin_publicar';

export const MENSAJE_CERRADO_POR_DEFECTO =
  'Este formulario ya no admite respuestas. Gracias por tu interés.';

export const MENSAJE_ARCHIVADO_POR_DEFECTO = 'Este formulario ya no está disponible.';

export const MENSAJE_SIN_PUBLICAR =
  'Este formulario todavía no está disponible. Vuelve a intentarlo más tarde.';

/**
 * Estado público a partir del estado interno y de si hay versión activa.
 *
 * Solo `published` admite respuestas. Cualquier otra combinación —incluido el
 * caso teórico de un `draft` con versión activa— se trata como cerrada: ante la
 * duda, no se recogen respuestas.
 */
export function estadoPublicoDe(
  status: 'draft' | 'published' | 'closed' | 'archived',
  tieneVersionActiva: boolean,
): EstadoPublico {
  if (!tieneVersionActiva) return 'sin_publicar';
  if (status === 'published') return 'disponible';
  if (status === 'archived') return 'archivado';
  return 'cerrado';
}

/**
 * Mensaje que corresponde a cada estado, prefiriendo el configurado en el
 * documento publicado (`meta.closedMessage`), que es inmutable y se escribe en
 * el editor antes de publicar.
 */
export function mensajeDeEstado(
  estado: EstadoPublico,
  definicion: FormDefinition | null,
): string | null {
  if (estado === 'disponible') return null;
  if (estado === 'sin_publicar') return MENSAJE_SIN_PUBLICAR;

  const configurado = definicion?.meta.closedMessage;
  if (configurado !== undefined && configurado.trim() !== '') return configurado;

  return estado === 'archivado'
    ? MENSAJE_ARCHIVADO_POR_DEFECTO
    : MENSAJE_CERRADO_POR_DEFECTO;
}
