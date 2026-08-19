/**
 * Utilidades HTTP compartidas por las rutas de `/api/forms`.
 *
 * Es la única capa que conoce `Request`, `Response` y códigos de estado: la capa
 * de servicio (`@/server/forms`) lanza errores de dominio y aquí se traducen.
 *
 * Un fichero que no se llama `route.ts` no es una ruta para el App Router, así
 * que puede convivir en el mismo directorio sin exponer ningún endpoint.
 */

import { NextResponse } from 'next/server';
import type { z } from 'zod';

import {
  FormsError,
  datosInvalidos,
  isFormsError,
  type FormsErrorCode,
  type FormsErrorDetails,
} from '@/server/forms';

/** Cuerpo de error de la API. Estable: forma parte del contrato con el cliente. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: FormsErrorCode;
    readonly message: string;
    readonly details?: FormsErrorDetails;
  };
}

/** Los datos del panel no se cachean nunca. */
const NO_STORE = { 'cache-control': 'no-store' } as const;

export function jsonResponse<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function errorResponse(error: FormsError): NextResponse<ApiErrorBody> {
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
 * Lo que no sea un `FormsError` se registra en el servidor y sale como
 * `ERROR_INTERNO` con un mensaje genérico: un error de `pg` lleva la consulta —y
 * a veces la cadena de conexión— en el mensaje, y eso no puede cruzar el borde.
 */
export async function route(
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    if (isFormsError(error)) {
      return errorResponse(error);
    }
    console.error('[api/forms] error no controlado', error);
    return errorResponse(
      new FormsError('ERROR_INTERNO', 'Se ha producido un error inesperado.'),
    );
  }
}

/**
 * Lee el cuerpo JSON. Un cuerpo vacío equivale a `{}`: las acciones sin
 * parámetros (`/close`) se pueden invocar sin enviar nada.
 */
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
