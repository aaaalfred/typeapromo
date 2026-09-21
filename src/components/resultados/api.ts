/**
 * Cliente HTTP de los resultados.
 *
 * Es la única pieza que conoce las URL de `/api/forms/:id/results` y
 * `/api/forms/:id/results.csv`. El manejo de errores no se reimplementa: se
 * reutiliza `ErrorApi` del panel, de modo que un fallo de red o un sobre
 * `{ error: { code, message } }` se comportan igual en las dos pantallas y los
 * mensajes en español del servidor se muestran tal cual.
 */

import {
  CODIGO_ERROR_HTTP,
  CODIGO_ERROR_RED,
  ErrorApi,
  MENSAJE_ERROR_RED,
  esCancelacion,
} from '@/components/panel/api';

import type { FiltrosResultados, Resultados } from './tipos';

export { ErrorApi, esCancelacion, esErrorApi, MENSAJE_ERROR_RED } from '@/components/panel/api';

/**
 * Traduce los filtros a la query que valida `resultsQuerySchema`.
 *
 * Las claves vacías se omiten para dejar actuar a los valores por defecto del
 * servidor: mandar `estado=todas` o `versionId=` no significa nada distinto de
 * no mandarlas, y ensucia la URL de la descarga.
 */
export function construirConsultaResultados(
  filtros: FiltrosResultados,
  opciones: { readonly conPaginacion?: boolean } = {},
): string {
  const { conPaginacion = true } = opciones;
  const parametros = new URLSearchParams();

  if (filtros.versionId !== null) parametros.set('versionId', filtros.versionId);
  if (filtros.estado !== 'todas') parametros.set('estado', filtros.estado);
  if (filtros.desde !== null && filtros.desde !== '') parametros.set('desde', filtros.desde);
  if (filtros.hasta !== null && filtros.hasta !== '') parametros.set('hasta', filtros.hasta);

  if (conPaginacion) {
    parametros.set('page', String(filtros.page));
    parametros.set('perPage', String(filtros.perPage));
  }

  return parametros.toString();
}

/** URL de la descarga CSV con los mismos filtros que se están viendo. */
export function urlCsvResultados(idFormulario: string, filtros: FiltrosResultados): string {
  // La paginación no se envía: el CSV exporta el filtro entero, no una página.
  const consulta = construirConsultaResultados(filtros, { conPaginacion: false });
  const base = `/api/forms/${encodeURIComponent(idFormulario)}/results.csv`;
  return consulta === '' ? base : `${base}?${consulta}`;
}

function mensajePorEstado(estado: number): string {
  if (estado === 401 || estado === 403) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión para continuar.';
  }
  return `El servidor ha respondido con un error inesperado (${String(estado)}).`;
}

interface ErrorDeApi {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

function extraerError(cuerpo: unknown): ErrorDeApi | null {
  if (typeof cuerpo !== 'object' || cuerpo === null || !('error' in cuerpo)) return null;

  const error: unknown = (cuerpo as { readonly error: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;

  const { code, message, details } = error as {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly details?: unknown;
  };

  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return { code, message, details };
}

/** Lee el cuerpo como JSON sin lanzar: un 404 servido en HTML devuelve `null`. */
async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return (await respuesta.json()) as unknown;
  } catch {
    return null;
  }
}

export async function obtenerResultados(
  idFormulario: string,
  filtros: FiltrosResultados,
  signal?: AbortSignal,
): Promise<Resultados> {
  const consulta = construirConsultaResultados(filtros);
  const ruta = `/api/forms/${encodeURIComponent(idFormulario)}/results?${consulta}`;

  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: 'GET',
      // La sesión va en una cookie `HttpOnly`; sin esto no viajaría.
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (causa) {
    if (esCancelacion(causa)) throw causa;
    throw new ErrorApi(MENSAJE_ERROR_RED, CODIGO_ERROR_RED, null);
  }

  const cuerpo = await leerJson(respuesta);

  if (!respuesta.ok) {
    const error = extraerError(cuerpo);
    if (error !== null) {
      throw new ErrorApi(error.message, error.code, respuesta.status, error.details);
    }
    throw new ErrorApi(mensajePorEstado(respuesta.status), CODIGO_ERROR_HTTP, respuesta.status);
  }

  return cuerpo as Resultados;
}
