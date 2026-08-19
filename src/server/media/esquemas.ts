/**
 * Contratos Zod del borde de media.
 *
 * Lo que valida el cliente aquí es solo la **intención** de subir: el MIME y el
 * tamaño declarados sirven para firmar la URL y para cortar pronto lo que ni
 * siquiera dice ser una imagen admitida. La verificación que cuenta ocurre en
 * `complete`, contra los bytes ya almacenados.
 */

import { z } from 'zod';

import { MIMES_ADMITIDOS, TAMANO_MAXIMO_BYTES, formatearMegas } from './reglas';

/** Identificador de activo. En base de datos es `uuid`, así que se exige UUID. */
export const assetIdSchema = z.uuid({
  message: 'El identificador de la imagen no es válido.',
});

/**
 * Nombre original. Se guarda solo para mostrarlo en el editor: **no** entra en
 * ninguna clave de objeto ni en ninguna ruta.
 */
const nombreArchivoSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .transform((valor) => valor.replace(/[\r\n\t]/g, ' '));

export const uploadIntentSchema = z.object({
  mimeType: z.enum(MIMES_ADMITIDOS, {
    message: 'Solo se admiten imágenes JPEG, PNG o WebP.',
  }),
  byteSize: z
    .number()
    .int('El tamaño debe ser un número entero de bytes.')
    .positive('El archivo está vacío.')
    .max(
      TAMANO_MAXIMO_BYTES,
      `El archivo supera el máximo de ${formatearMegas(TAMANO_MAXIMO_BYTES)}.`,
    ),
  filename: nombreArchivoSchema.optional(),
});

export type UploadIntentInput = z.infer<typeof uploadIntentSchema>;
