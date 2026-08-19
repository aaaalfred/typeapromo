/**
 * Cliente HTTP de la experiencia pública.
 *
 * Es la única pieza del navegador que conoce las URL de `/api/public`. Tres
 * reglas, heredadas del cliente del panel:
 *
 * 1. **Los mensajes de error de la API se muestran tal cual.** Ya vienen en
 *    español; reescribirlos aquí solo escondería el motivo real.
 * 2. **Un fallo de red no es silencio.** `fetch` rechaza sin respuesta cuando no
 *    hay conexión, y eso se convierte en un error con mensaje propio para que el
 *    renderer lo enseñe y quien responde pueda reintentar sin perder nada.
 * 3. **Nada de tokens.** No hay ningún identificador de sesión en estas
 *    llamadas: viaja la cookie `HttpOnly`, que el navegador adjunta solo porque
 *    se pide `credentials: 'same-origin'`.
 */

import type { AnswerValue, FormProgress, ScreenRef } from '@/lib/forms';

/** Estado de la sesión tal y como viaja por HTTP. */
export interface SesionPublica {
  readonly respuestas: Readonly<Record<string, AnswerValue | undefined>>;
  readonly pantalla: ScreenRef;
  readonly completada: boolean;
  readonly versionNumber: number;
  readonly progreso: FormProgress;
}

export const MENSAJE_ERROR_RED =
  'No se ha podido guardar tu respuesta. Comprueba tu conexión e inténtalo de nuevo.';

/** Error normalizado. Todo lo que sale de este módulo falla así. */
export class ErrorPublico extends Error {
  readonly codigo: string;
  readonly estadoHttp: number | null;

  constructor(mensaje: string, codigo: string, estadoHttp: number | null) {
    super(mensaje);
    this.name = 'ErrorPublico';
    this.codigo = codigo;
    this.estadoHttp = estadoHttp;
  }
}

interface CuerpoError {
  readonly code: string;
  readonly message: string;
}

function extraerError(cuerpo: unknown): CuerpoError | null {
  if (typeof cuerpo !== 'object' || cuerpo === null || !('error' in cuerpo)) return null;

  const error: unknown = (cuerpo as { readonly error: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;

  const { code, message } = error as { readonly code?: unknown; readonly message?: unknown };
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return { code, message };
}

async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return (await respuesta.json()) as unknown;
  } catch {
    return null;
  }
}

async function peticion<T>(
  ruta: string,
  metodo: 'POST' | 'PUT',
  cuerpo: unknown,
): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      // La sesión va en una cookie `HttpOnly`; sin esto no viajaría.
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorPublico(MENSAJE_ERROR_RED, 'ERROR_DE_RED', null);
  }

  const datos = await leerJson(respuesta);

  if (!respuesta.ok) {
    const error = extraerError(datos);
    if (error !== null) {
      throw new ErrorPublico(error.message, error.code, respuesta.status);
    }
    throw new ErrorPublico(
      'El servidor ha respondido con un error inesperado. Inténtalo de nuevo.',
      'ERROR_HTTP',
      respuesta.status,
    );
  }

  return datos as T;
}

/* -------------------------------------------------------------------------- */
/* Operaciones                                                                 */
/* -------------------------------------------------------------------------- */

export interface RespuestaCrearSesion {
  readonly sesion: SesionPublica;
  readonly reanudada: boolean;
}

export async function crearSesionPublica(slug: string): Promise<RespuestaCrearSesion> {
  return peticion<RespuestaCrearSesion>(
    `/api/public/forms/${encodeURIComponent(slug)}/sessions`,
    'POST',
    {},
  );
}

export interface RespuestaGuardar {
  readonly sesion: SesionPublica;
  readonly terminado: boolean;
}

export async function guardarRespuestaPublica(
  formId: string,
  questionId: string,
  valor: AnswerValue,
): Promise<RespuestaGuardar> {
  return peticion<RespuestaGuardar>(
    `/api/public/sessions/answers/${encodeURIComponent(questionId)}`,
    'PUT',
    { formId, value: valor },
  );
}

export async function completarSesionPublica(
  formId: string,
): Promise<{ readonly sesion: SesionPublica }> {
  return peticion<{ readonly sesion: SesionPublica }>(
    '/api/public/sessions/complete',
    'POST',
    { formId },
  );
}
