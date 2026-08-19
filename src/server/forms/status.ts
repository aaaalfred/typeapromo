/**
 * Transiciones del ciclo de vida de un formulario.
 *
 * Módulo puro y sin dependencias: es la tabla de verdad de qué acciones son
 * legales en cada estado, y por eso es lo primero que cubren los tests.
 *
 * ```
 * draft ──publicar──▶ published ──cerrar──▶ closed
 *   │                     │                   │
 *   └────────── archivar ─┴───────────────────┘──▶ archived
 *                                                    │
 *                                            desarchivar
 *                                                    ▼
 *                              closed | published | draft (según historial)
 * ```
 *
 * `publicar` es de la fase 7 y no vive aquí: esta fase solo cierra y archiva.
 */

import type { FormStatus } from '@/db/schema';

export type { FormStatus };

/** Acciones de ciclo de vida que expone la fase 3. */
export type FormAction = 'close' | 'archive' | 'unarchive';

/**
 * Estado relevante del formulario para decidir la transición. Se pasa explícito
 * en lugar de la fila completa para que el módulo siga siendo puro.
 */
export interface FormStateContext {
  readonly status: FormStatus;
  /** `true` si el formulario tiene una versión publicada activa. */
  readonly hasActiveVersion: boolean;
  /** `true` si el formulario estaba cerrado antes de archivarse. */
  readonly wasClosed: boolean;
}

export type TransitionResult =
  | {
      readonly ok: true;
      readonly status: FormStatus;
      /** `false` cuando la acción es un no-op idempotente (ya estaba en destino). */
      readonly changed: boolean;
    }
  | { readonly ok: false; readonly message: string };

const NO_OP = (status: FormStatus): TransitionResult => ({ ok: true, status, changed: false });

/**
 * Estado al que vuelve un formulario archivado. Se reconstruye del historial
 * porque `archived` es un estado terminal que sustituye al anterior en la misma
 * columna: sin `closed_at` ni `active_version_id` no habría forma de saberlo.
 */
function restoredStatus(context: FormStateContext): FormStatus {
  if (context.wasClosed) return 'closed';
  return context.hasActiveVersion ? 'published' : 'draft';
}

/** Resuelve la transición o explica en español por qué no procede. */
export function applyTransition(
  context: FormStateContext,
  action: FormAction,
): TransitionResult {
  switch (action) {
    case 'close': {
      if (context.status === 'closed') return NO_OP('closed');
      if (context.status === 'published') return { ok: true, status: 'closed', changed: true };
      if (context.status === 'draft') {
        return {
          ok: false,
          message: 'No se puede cerrar un formulario que todavía no se ha publicado.',
        };
      }
      return {
        ok: false,
        message: 'No se puede cerrar un formulario archivado. Desarchívalo primero.',
      };
    }
    case 'archive': {
      if (context.status === 'archived') return NO_OP('archived');
      return { ok: true, status: 'archived', changed: true };
    }
    case 'unarchive': {
      if (context.status !== 'archived') return NO_OP(context.status);
      return { ok: true, status: restoredStatus(context), changed: true };
    }
  }
}

/**
 * `true` si el borrador admite escritura. Un formulario archivado es de solo
 * lectura: se desarchiva antes de volver a editarlo.
 */
export function canEditDraft(status: FormStatus): boolean {
  return status !== 'archived';
}

/** Mensaje único para el intento de editar un borrador de solo lectura. */
export const DRAFT_READ_ONLY_MESSAGE =
  'El formulario está archivado y su borrador es de solo lectura. Desarchívalo para editarlo.';
