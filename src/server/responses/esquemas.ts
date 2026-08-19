/**
 * Contratos Zod de **entrada** de los endpoints públicos.
 *
 * Ninguno lleva token: la sesión se identifica con la cookie `HttpOnly` y las
 * rutas perdieron el segmento `:token` que proponía PR.md (PLAN.md · §2.1). Lo
 * que sí viaja en el cuerpo es el **identificador del formulario**, porque la
 * cookie es una por formulario y el servidor necesita saber cuál abrir.
 *
 * El valor de la respuesta llega como `unknown` a propósito: quien decide si es
 * admisible es `validateAnswer()` contra el bloque concreto de la versión de la
 * sesión, no un esquema genérico que tendría que duplicar esas reglas.
 */

import { z } from 'zod';

/** Slug público en la ruta. Mismo alfabeto que genera `@/server/forms/slug`. */
export const slugPublicoSchema = z
  .string()
  .trim()
  .min(1, { message: 'Falta la dirección del formulario' })
  .max(120, { message: 'La dirección del formulario es demasiado larga' })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'La dirección del formulario no es válida',
  });

/** Identificador de pregunta en la ruta. Se comprueba contra el documento después. */
export const questionIdSchema = z
  .string()
  .trim()
  .min(1, { message: 'Falta el identificador de la pregunta' })
  .max(64, { message: 'El identificador de la pregunta es demasiado largo' });

const formIdSchema = z.uuid({ message: 'Identificador de formulario inválido' });

/** `POST /api/public/forms/:slug/sessions` */
export const crearSesionSchema = z.object({}).strict();

/** `PUT /api/public/sessions/answers/:questionId` */
export const guardarRespuestaSchema = z
  .object({
    formId: formIdSchema,
    /** Valor tal cual lo emite el renderer. Se valida contra el bloque. */
    value: z.unknown(),
  })
  .strict();

export type GuardarRespuestaInput = z.infer<typeof guardarRespuestaSchema>;

/** `POST /api/public/sessions/complete` */
export const completarSesionSchema = z
  .object({ formId: formIdSchema })
  .strict();

export type CompletarSesionInput = z.infer<typeof completarSesionSchema>;
