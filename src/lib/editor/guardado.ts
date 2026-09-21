/**
 * Cliente del guardado de borrador.
 *
 * Traduce `PUT /api/forms/:id/draft` a un resultado **discriminado** en el que
 * el conflicto de revisión es un estado de primera clase y no un error
 * genérico: es el criterio de «hecho» de la fase 3 (dos pestañas editando el
 * mismo borrador producen un 409 limpio en la segunda) y el editor tiene que
 * poder distinguirlo para no sobrescribir nunca en silencio.
 *
 * Nada de esto conoce React: así el ciclo de autoguardado se puede probar sin
 * montar el editor entero.
 */

import type { FormDefinition } from '@/lib/forms';

/* -------------------------------------------------------------------------- */
/* Contrato                                                                    */
/* -------------------------------------------------------------------------- */

/** Resultado de un intento de guardado. */
export type ResultadoGuardado =
  | {
      readonly estado: 'guardado';
      /** Revisión nueva del servidor. La siguiente petición debe enviar esta. */
      readonly revision: number;
      readonly guardadoEn: Date;
    }
  | {
      readonly estado: 'conflicto';
      readonly revisionEnviada: number;
      readonly revisionServidor: number;
      readonly mensaje: string;
    }
  | {
      readonly estado: 'error';
      readonly mensaje: string;
      /** Código de dominio de la API, si vino uno. */
      readonly codigo: string | null;
    };

/** Firma que espera el hook de autoguardado. Facilita inyectar un doble en tests. */
export type GuardarBorrador = (
  formularioId: string,
  revision: number,
  definicion: FormDefinition,
  señal?: AbortSignal,
) => Promise<ResultadoGuardado>;

const MENSAJE_RED =
  'No se ha podido contactar con el servidor. Los cambios siguen aquí; se reintentará al seguir editando.';

/* -------------------------------------------------------------------------- */
/* Lectura defensiva de la respuesta                                           */
/* -------------------------------------------------------------------------- */

function comoRegistro(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : null;
}

function entero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

async function cuerpoJson(respuesta: Response): Promise<Record<string, unknown> | null> {
  try {
    return comoRegistro(await respuesta.json());
  } catch {
    return null;
  }
}

/**
 * Extrae el resultado de una respuesta ya recibida.
 * Se separa de `guardarBorrador` para poder probar el análisis del 409 sin red.
 */
export async function interpretarRespuesta(
  respuesta: Response,
  revisionEnviada: number,
): Promise<ResultadoGuardado> {
  const cuerpo = await cuerpoJson(respuesta);

  if (respuesta.ok) {
    const borrador = comoRegistro(cuerpo?.draft);
    const revision = entero(borrador?.revision);
    if (revision === null) {
      return {
        estado: 'error',
        mensaje: 'El servidor ha aceptado el guardado pero no ha devuelto la revisión.',
        codigo: null,
      };
    }
    const marca = borrador?.updatedAt;
    const guardadoEn = typeof marca === 'string' ? new Date(marca) : new Date();
    return {
      estado: 'guardado',
      revision,
      guardadoEn: Number.isNaN(guardadoEn.getTime()) ? new Date() : guardadoEn,
    };
  }

  const error = comoRegistro(cuerpo?.error);
  const codigo = typeof error?.code === 'string' ? error.code : null;
  const mensaje =
    typeof error?.message === 'string' && error.message !== ''
      ? error.message
      : `El servidor ha respondido ${String(respuesta.status)}.`;

  if (respuesta.status === 409 && codigo === 'CONFLICTO_REVISION') {
    const detalles = comoRegistro(error?.details);
    return {
      estado: 'conflicto',
      revisionEnviada: entero(detalles?.revisionEnviada) ?? revisionEnviada,
      revisionServidor: entero(detalles?.revisionServidor) ?? revisionEnviada + 1,
      mensaje,
    };
  }

  return { estado: 'error', mensaje, codigo };
}

/* -------------------------------------------------------------------------- */
/* Petición                                                                    */
/* -------------------------------------------------------------------------- */

/** Guarda el borrador con control de revisión optimista. */
export const guardarBorrador: GuardarBorrador = async (
  formularioId,
  revision,
  definicion,
  señal,
) => {
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api/forms/${encodeURIComponent(formularioId)}/draft`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revision, definition: definicion }),
      ...(señal === undefined ? {} : { signal: señal }),
    });
  } catch (excepcion) {
    if (excepcion instanceof DOMException && excepcion.name === 'AbortError') throw excepcion;
    return { estado: 'error', mensaje: MENSAJE_RED, codigo: null };
  }

  return interpretarRespuesta(respuesta, revision);
};
