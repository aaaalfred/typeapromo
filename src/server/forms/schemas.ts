/**
 * Contratos Zod de **entrada** de la API de formularios.
 *
 * El documento en sí no se redefine aquí: se reutiliza `formDefinitionSchema` de
 * `@/lib/forms`, que es el contrato único compartido con el editor y con la
 * experiencia pública. Este fichero solo describe los sobres que lo envuelven
 * (cuerpos de petición y parámetros de consulta).
 *
 * Todos los mensajes están en español: viajan tal cual al cliente dentro de
 * `details` cuando la validación falla.
 */

import { z } from 'zod';

import { formDefinitionSchema } from '@/lib/forms';

import {
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
  esSlugReservado,
} from './slug';

/** Estados admitidos como filtro del listado. Copia literal del enum de PostgreSQL. */
export const FORM_STATUSES = ['draft', 'published', 'closed', 'archived'] as const;

export const formStatusSchema = z.enum(FORM_STATUSES, {
  message: 'Estado de formulario desconocido',
});

/** Identificador de formulario en la ruta. */
export const formIdSchema = z.uuid({ message: 'Identificador de formulario inválido' });

const titleSchema = z
  .string({ message: 'El título es obligatorio' })
  .trim()
  .min(1, { message: 'El título no puede estar vacío' })
  .max(300, { message: 'El título no puede superar los 300 caracteres' });

export const slugInputSchema = z
  .string({ message: 'El slug debe ser una cadena de texto' })
  .trim()
  .toLowerCase()
  .min(SLUG_MIN_LENGTH, {
    message: `El slug debe tener al menos ${String(SLUG_MIN_LENGTH)} caracteres`,
  })
  .max(SLUG_MAX_LENGTH, {
    message: `El slug no puede superar los ${String(SLUG_MAX_LENGTH)} caracteres`,
  })
  .regex(SLUG_PATTERN, {
    message: 'El slug solo puede contener letras minúsculas, números y guiones simples',
  })
  .refine((val) => !esSlugReservado(val), {
    message: 'Esa dirección no está disponible porque es una palabra reservada del sistema',
  });

/* -------------------------------------------------------------------------- */
/* POST /api/forms                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `definition` es opcional: sin ella se crea el documento mínimo publicable de
 * `createDefaultFormDefinition`. `slug` también lo es; si se envía, se sanea y
 * se desambigua igual que el derivado del título.
 */
export const createFormSchema = z
  .object({
    title: titleSchema,
    slug: slugInputSchema.optional(),
    definition: formDefinitionSchema.optional(),
  })
  .strict();

export type CreateFormInput = z.infer<typeof createFormSchema>;

/* -------------------------------------------------------------------------- */
/* PATCH /api/forms/:id                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Metadatos del formulario. `archived` es el interruptor de archivado y
 * desarchivado; cerrar tiene ruta propia porque no es un metadato.
 *
 * Renombrar toca también `meta.title` del borrador e **incrementa la revisión**:
 * el título es un dato del documento, no una etiqueta suelta. Un editor abierto
 * recibirá un `409` limpio en su siguiente guardado, que es exactamente el
 * comportamiento previsto y no una sobrescritura silenciosa.
 */
export const updateFormSchema = z
  .object({
    title: titleSchema.optional(),
    slug: slugInputSchema.optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'No hay ningún metadato que actualizar',
  });

export type UpdateFormInput = z.infer<typeof updateFormSchema>;

/* -------------------------------------------------------------------------- */
/* PUT /api/forms/:id/draft                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `revision` es la que el cliente leyó. El servidor solo escribe si sigue siendo
 * la suya; si no, responde `409` con la revisión real (`src/db/README.md`).
 */
export const saveDraftSchema = z
  .object({
    revision: z
      .number({ message: 'Falta la revisión del borrador' })
      .int({ message: 'La revisión debe ser un número entero' })
      .min(1, { message: 'La revisión debe ser mayor que cero' }),
    definition: formDefinitionSchema,
  })
  .strict();

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;

/* -------------------------------------------------------------------------- */
/* POST /api/forms/:id/duplicate                                               */
/* -------------------------------------------------------------------------- */

export const duplicateFormSchema = z
  .object({
    /** Título de la copia. Por defecto, «<título original> (copia)». */
    title: titleSchema.optional(),
  })
  .strict();

export type DuplicateFormInput = z.infer<typeof duplicateFormSchema>;

/* -------------------------------------------------------------------------- */
/* GET /api/forms                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Booleano de query string. `z.coerce.boolean()` no sirve: convertiría `'0'` y
 * `'false'` en `true`, que es justo lo contrario de lo que espera quien escribe
 * la URL.
 */
const queryBooleanSchema = z
  .enum(['0', '1', 'true', 'false'], { message: 'Se esperaba 0, 1, true o false' })
  .transform((value) => value === '1' || value === 'true');

export const LIST_SORTS = ['updated', 'created', 'title'] as const;

export const listFormsQuerySchema = z
  .object({
    /** Búsqueda por título o slug, sin distinguir mayúsculas. */
    q: z.string().trim().max(200, { message: 'La búsqueda es demasiado larga' }).optional(),
    status: formStatusSchema.optional(),
    /** Los archivados quedan fuera salvo que se pidan explícitamente. */
    includeArchived: queryBooleanSchema.optional(),
    page: z.coerce
      .number({ message: 'La página debe ser un número' })
      .int({ message: 'La página debe ser un número entero' })
      .min(1, { message: 'La página empieza en 1' })
      .default(1),
    perPage: z.coerce
      .number({ message: 'El tamaño de página debe ser un número' })
      .int({ message: 'El tamaño de página debe ser un número entero' })
      .min(1, { message: 'El tamaño de página mínimo es 1' })
      .max(100, { message: 'El tamaño de página máximo es 100' })
      .default(20),
    sort: z.enum(LIST_SORTS, { message: 'Criterio de orden desconocido' }).default('updated'),
  })
  .strict();

export type ListFormsQuery = z.infer<typeof listFormsQuerySchema>;

/**
 * Traduce los parámetros de una URL al objeto que valida `listFormsQuerySchema`.
 * Omitir las claves ausentes (en lugar de pasarlas como `null`) es lo que deja
 * actuar a los valores por defecto de zod.
 */
export function listFormsQueryFromSearchParams(params: URLSearchParams): unknown {
  const raw: Record<string, string> = {};
  for (const key of ['q', 'status', 'includeArchived', 'page', 'perPage', 'sort']) {
    const value = params.get(key);
    if (value !== null && value !== '') {
      raw[key] = value;
    }
  }
  return raw;
}
