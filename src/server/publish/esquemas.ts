/**
 * Cuerpo de `POST /api/forms/:id/publish`.
 *
 * El panel envía `{}` y esa es la llamada canónica: publicar es «congela lo que
 * hay en el borrador ahora mismo». `revision` es un seguro opcional para un
 * cliente que quiera asegurarse de estar publicando exactamente el documento que
 * tiene en pantalla; si se envía y no coincide, la ruta responde `409` igual que
 * un guardado en conflicto, en lugar de publicar los cambios de otra pestaña.
 */

import { z } from 'zod';

export const publishFormSchema = z
  .object({
    revision: z
      .number({ message: 'La revisión debe ser un número' })
      .int({ message: 'La revisión debe ser un número entero' })
      .min(1, { message: 'La revisión debe ser mayor que cero' })
      .optional(),
  })
  .strict();

export type PublishFormInput = z.infer<typeof publishFormSchema>;
