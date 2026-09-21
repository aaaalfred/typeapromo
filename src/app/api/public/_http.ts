/**
 * Borde HTTP de la experiencia pública.
 *
 * Es la única capa que conoce `Request`, `Response`, cookies y códigos de
 * estado: `@/server/responses` lanza `ResponsesError` y aquí se traduce. Mismo
 * contrato de cuerpo que `/api/forms` y `/api/media`
 * (`{ error: { code, message, details? } }`, mensajes en español), implementado
 * aparte porque los códigos son otros.
 *
 * Aquí viven también las dos piezas que solo tienen sentido en el borde:
 *
 * - **La cookie de sesión.** Se lee de la petición y se escribe en la respuesta.
 *   Nunca sale de aquí hacia la capa de servicio, que solo recibe el token.
 * - **El límite de peticiones.** Se consume antes de tocar nada, con la IP
 *   hasheada con la sal de proceso (`@/server/rate-limit`). El resultado nunca
 *   se guarda junto a la respuesta ni se pasa a la sesión.
 *
 * Un fichero que no se llama `route.ts` no es una ruta para el App Router, así
 * que puede convivir en el árbol sin exponer ningún endpoint.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';

import {
  ResponsesError,
  datosInvalidos,
  demasiadasPeticiones,
  isResponsesError,
  nombreCookieSesion,
  opcionesBorradoCookie,
  opcionesCookieSesion,
  debeSerSegura,
  type ResponsesErrorCode,
  type ResponsesErrorDetails,
} from '@/server/responses';
import { consumirLimiteDePeticion, type AmbitoLimite } from '@/server/rate-limit';

export interface ApiErrorBody {
  readonly error: {
    readonly code: ResponsesErrorCode;
    readonly message: string;
    readonly details?: ResponsesErrorDetails;
  };
}

/**
 * Nada de la experiencia pública se cachea: la respuesta depende de una cookie
 * de sesión y una copia intermedia serviría el recorrido de otra persona.
 */
const NO_STORE = { 'cache-control': 'no-store' } as const;

export function jsonResponse<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function errorResponse(error: ResponsesError): NextResponse<ApiErrorBody> {
  const cabeceras: Record<string, string> = { ...NO_STORE };

  const reintentar = error.details?.['reintentarEnSegundos'];
  if (error.code === 'DEMASIADAS_PETICIONES' && typeof reintentar === 'number') {
    cabeceras['retry-after'] = String(reintentar);
  }

  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    },
    { status: error.status, headers: cabeceras },
  );
}

/**
 * Ejecuta el manejador y traduce cualquier fallo.
 *
 * Lo que no sea un `ResponsesError` se registra en el servidor y sale como
 * `ERROR_INTERNO` con mensaje genérico: un error de `pg` lleva la consulta —y a
 * veces la cadena de conexión— en el mensaje, y eso no puede cruzar el borde.
 */
export async function route(
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    if (isResponsesError(error)) return errorResponse(error);
    console.error('[api/public] error no controlado', error);
    return errorResponse(
      new ResponsesError('ERROR_INTERNO', 'Se ha producido un error inesperado.'),
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

/* -------------------------------------------------------------------------- */
/* Límite de peticiones                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Contabiliza la petición y lanza `429` si se ha pasado del cupo.
 *
 * Se llama **lo primero**, antes de leer el cuerpo o de consultar nada: el
 * objetivo es que una avalancha cueste una sola sentencia, no una transacción.
 */
export async function aplicarLimite(
  request: NextRequest,
  ambito: AmbitoLimite,
): Promise<void> {
  const resultado = await consumirLimiteDePeticion(ambito, request.headers);
  if (!resultado.permitido) {
    throw demasiadasPeticiones(resultado.reintentarEnSegundos);
  }
}

/* -------------------------------------------------------------------------- */
/* Cookie de sesión                                                            */
/* -------------------------------------------------------------------------- */

function cookieSegura(): boolean {
  return debeSerSegura(process.env.PUBLIC_BASE_URL);
}

/** Token de la cookie de este formulario, o `undefined` si no la hay. */
export function tokenDePeticion(request: NextRequest, formId: string): string | undefined {
  return request.cookies.get(nombreCookieSesion(formId))?.value;
}

/** Escribe la cookie `HttpOnly` con el token en claro. */
export function conCookieDeSesion<T>(
  respuesta: NextResponse<T>,
  formId: string,
  token: string,
): NextResponse<T> {
  respuesta.cookies.set(nombreCookieSesion(formId), token, opcionesCookieSesion(cookieSegura()));
  return respuesta;
}

/** Borra la cookie: sesión completada o token que ya no vale para nada. */
export function sinCookieDeSesion<T>(
  respuesta: NextResponse<T>,
  formId: string,
): NextResponse<T> {
  respuesta.cookies.set(nombreCookieSesion(formId), '', opcionesBorradoCookie(cookieSegura()));
  return respuesta;
}
