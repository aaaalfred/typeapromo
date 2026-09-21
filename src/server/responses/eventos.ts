/**
 * Traza de recorrido en `form_events`, para las métricas de la fase 8.
 *
 * Se registran tres tipos: `started` al crear la sesión, `advanced` en cada
 * respuesta guardada y `completed` al terminar. **`abandoned` no se escribe
 * nunca**: PLAN.md · §2.9 lo deriva en consulta sobre `response_sessions`
 * (`completed_at IS NULL AND last_activity_at < now() - interval '30 minutes'`),
 * y materializarlo exigiría un job periódico que este stack no tiene.
 *
 * Los eventos **no llevan datos personales**: ni IP, ni token, ni el valor de la
 * respuesta. Solo qué pasó, en qué pregunta y cuándo. El valor ya está en
 * `answers`, que es la tabla que se exporta y se analiza; duplicarlo aquí sería
 * dispersar el dato sin ganar nada.
 *
 * **El fallo al registrar un evento no rompe la respuesta.** Una métrica perdida
 * es un inconveniente; una respuesta perdida por no poder anotarla es un fallo
 * de producto. Por eso `registrarEvento` traga su propio error y lo deja en el
 * log.
 */

import { formEvents, type FormEventType } from '@/db/schema';
import type { DbHandle } from '@/server/forms/db';

export interface EntradaEvento {
  readonly formId: string;
  readonly versionId: string;
  readonly sessionId: string;
  readonly type: Extract<FormEventType, 'started' | 'advanced' | 'completed'>;
  /** Pregunta implicada, cuando el evento la tiene. */
  readonly questionId?: string;
  /** Contexto adicional. Nunca datos personales ni valores de respuesta. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export async function registrarEvento(
  handle: DbHandle,
  entrada: EntradaEvento,
): Promise<void> {
  try {
    await handle.insert(formEvents).values({
      formId: entrada.formId,
      versionId: entrada.versionId,
      sessionId: entrada.sessionId,
      type: entrada.type,
      questionId: entrada.questionId ?? null,
      metadata: entrada.metadata ?? null,
    });
  } catch (error) {
    console.error('[api/public] no se ha podido registrar el evento', error);
  }
}
