/**
 * Borde HTTP de media. Es la única capa que conoce `Request`, `Response` y
 * códigos de estado: la de servicio lanza `MediaError` y aquí se traduce.
 *
 * Mismo contrato de cuerpo de error que `/api/forms` (`{ error: { code,
 * message, details? } }`) para que el cliente tenga una sola forma que manejar,
 * pero implementado aparte: los códigos son distintos y compartir el módulo
 * ataría dos dominios que evolucionan por separado.
 */

import { NextResponse } from 'next/server';
import type { z } from 'zod';

import {
  MediaError,
  datosInvalidos,
  isMediaError,
  type MediaErrorCode,
  type MediaErrorDetails,
} from './errores';

export interface ApiErrorBody {
  readonly error: {
    readonly code: MediaErrorCode;
    readonly message: string;
    readonly details?: MediaErrorDetails;
  };
}

/** Nada de lo que sale de aquí se cachea: son datos de panel y URL firmadas. */
const NO_STORE = { 'cache-control': 'no-store' } as const;

export function jsonResponse<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function errorResponse(error: MediaError): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    },
    { status: error.status, headers: NO_STORE },
  );
}

/**
 * Ejecuta el manejador y traduce cualquier fallo.
 *
 * Lo que no sea un `MediaError` se registra en el servidor y sale como
 * `ERROR_INTERNO` con mensaje genérico: un error del SDK de S3 lleva el
 * endpoint, el bucket y a veces la firma en el mensaje, y eso no cruza el borde.
 */
export async function route(
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    if (isMediaError(error)) return errorResponse(error);
    console.error('[api/media] error no controlado', error);
    return errorResponse(
      new MediaError('ERROR_INTERNO', 'Se ha producido un error inesperado.'),
    );
  }
}

/** Lee el cuerpo JSON. Un cuerpo vacío equivale a `{}`. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.trim().length === 0) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw datosInvalidos('El cuerpo de la petición no es JSON válido.');
  }
}

/** Valida con Zod y traduce el fallo a `DATOS_INVALIDOS` con el detalle por campo. */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw datosInvalidos('Los datos enviados no son válidos.', {
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}
