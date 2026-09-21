/**
 * Cliente HTTP del panel.
 *
 * Es la única pieza que conoce las URL de `/api/forms`. Dos reglas que sostienen
 * todo lo demás:
 *
 * 1. **Los mensajes de error de la API se muestran tal cual.** Ya vienen en
 *    español dentro de `{ error: { code, message, details? } }`. Reescribirlos
 *    aquí solo conseguiría empeorarlos y esconder el motivo real.
 * 2. **Un fallo de red no es silencio.** `fetch` rechaza sin respuesta cuando no
 *    hay conexión; ese caso se convierte en un `ErrorApi` con código propio para
 *    que la interfaz pueda decir «no se ha podido conectar» y ofrecer reintentar.
 *
 * Las respuestas que no son JSON (un 404 de Next servido como HTML, por ejemplo)
 * también acaban en `ErrorApi`: no hay ninguna ruta por la que un fallo se
 * convierta en `undefined`.
 */

import type { FiltroListado, PaginaFormularios, RespuestaFormulario } from './tipos';

/** Código sintético para el fallo de transporte: no lo emite el servidor. */
export const CODIGO_ERROR_RED = 'ERROR_DE_RED';
/** Código sintético para una respuesta de error que no sigue el contrato. */
export const CODIGO_ERROR_HTTP = 'ERROR_HTTP';

export const MENSAJE_ERROR_RED =
  'No se ha podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';

/** Error normalizado de la API. Todo lo que sale de este módulo falla así. */
export class ErrorApi extends Error {
  /** Código de dominio (`NO_ENCONTRADO`, `TRANSICION_INVALIDA`…) o sintético. */
  readonly codigo: string;
  /** Estado HTTP, o `null` si la petición ni siquiera llegó a salir. */
  readonly estadoHttp: number | null;
  readonly detalles: unknown;

  constructor(mensaje: string, codigo: string, estadoHttp: number | null, detalles?: unknown) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.codigo = codigo;
    this.estadoHttp = estadoHttp;
    this.detalles = detalles;
  }
}

export function esErrorApi(valor: unknown): valor is ErrorApi {
  return valor instanceof ErrorApi;
}

/** `true` para la cancelación de un `AbortController`: no es un fallo que mostrar. */
export function esCancelacion(valor: unknown): boolean {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'name' in valor &&
    (valor as { readonly name?: unknown }).name === 'AbortError'
  );
}

/* -------------------------------------------------------------------------- */
/* Traducción de respuestas                                                    */
/* -------------------------------------------------------------------------- */

/** Mensaje de reserva cuando el cuerpo del error no sigue el contrato. */
function mensajePorEstado(estado: number): string {
  if (estado === 401 || estado === 403) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión para continuar.';
  }
  if (estado === 404) {
    return 'El servidor no reconoce esta operación. Puede que todavía no esté disponible en esta versión.';
  }
  return `El servidor ha respondido con un error inesperado (${String(estado)}).`;
}

interface ErrorDeApi {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

/** Extrae `{ error: { code, message } }` si el cuerpo lo trae; `null` si no. */
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

/** Lee el cuerpo como JSON sin lanzar: un 404 en HTML devuelve `null`. */
async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return (await respuesta.json()) as unknown;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Petición base                                                               */
/* -------------------------------------------------------------------------- */

interface OpcionesPeticion {
  readonly metodo?: 'GET' | 'POST' | 'PATCH';
  readonly cuerpo?: unknown;
  readonly signal?: AbortSignal;
}

async function peticion<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, signal } = opciones;

  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      // La sesión va en una cookie `HttpOnly`; sin esto no viajaría.
      credentials: 'same-origin',
      headers:
        cuerpo === undefined
          ? { accept: 'application/json' }
          : { accept: 'application/json', 'content-type': 'application/json' },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (causa) {
    // Cancelar una petición en vuelo no es un error de red: se propaga tal cual
    // para que quien la cancele pueda ignorarla.
    if (esCancelacion(causa)) throw causa;
    throw new ErrorApi(MENSAJE_ERROR_RED, CODIGO_ERROR_RED, null);
  }

  const cuerpoRespuesta = await leerJson(respuesta);

  if (!respuesta.ok) {
    const error = extraerError(cuerpoRespuesta);
    if (error !== null) {
      throw new ErrorApi(error.message, error.code, respuesta.status, error.details);
    }
    throw new ErrorApi(mensajePorEstado(respuesta.status), CODIGO_ERROR_HTTP, respuesta.status);
  }

  return cuerpoRespuesta as T;
}

/* -------------------------------------------------------------------------- */
/* Operaciones                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Traduce el filtro de la interfaz a la query que valida `listFormsQuerySchema`.
 * `'todos'` no envía `status`: el servidor ya excluye los archivados por defecto.
 */
export function construirConsultaListado(filtro: FiltroListado): string {
  const parametros = new URLSearchParams();
  const busqueda = filtro.q.trim();
  if (busqueda.length > 0) parametros.set('q', busqueda);
  if (filtro.estado !== 'todos') parametros.set('status', filtro.estado);
  parametros.set('perPage', '50');
  return parametros.toString();
}

export async function listarFormularios(
  filtro: FiltroListado,
  signal?: AbortSignal,
): Promise<PaginaFormularios> {
  return peticion<PaginaFormularios>(`/api/forms?${construirConsultaListado(filtro)}`, {
    ...(signal === undefined ? {} : { signal }),
  });
}

export async function crearFormulario(
  titulo: string,
  slug?: string,
): Promise<RespuestaFormulario> {
  const cuerpo: { title: string; slug?: string } = { title: titulo };
  if (slug && slug.trim().length > 0) {
    cuerpo.slug = slug.trim();
  }
  return peticion<RespuestaFormulario>('/api/forms', {
    metodo: 'POST',
    cuerpo,
  });
}

export async function actualizarMetadatosFormulario(
  id: string,
  metadatos: { title?: string; slug?: string; archived?: boolean },
): Promise<RespuestaFormulario> {
  return peticion<RespuestaFormulario>(`/api/forms/${encodeURIComponent(id)}`, {
    metodo: 'PATCH',
    cuerpo: metadatos,
  });
}

export async function duplicarFormulario(id: string): Promise<RespuestaFormulario> {
  return peticion<RespuestaFormulario>(`/api/forms/${encodeURIComponent(id)}/duplicate`, {
    metodo: 'POST',
    cuerpo: {},
  });
}

export async function cerrarFormulario(id: string): Promise<RespuestaFormulario> {
  return peticion<RespuestaFormulario>(`/api/forms/${encodeURIComponent(id)}/close`, {
    metodo: 'POST',
    cuerpo: {},
  });
}

/** Archiva (`true`) o desarchiva (`false`) mediante `PATCH { archived }`. */
export async function archivarFormulario(
  id: string,
  archivado: boolean,
): Promise<RespuestaFormulario> {
  return peticion<RespuestaFormulario>(`/api/forms/${encodeURIComponent(id)}`, {
    metodo: 'PATCH',
    cuerpo: { archived: archivado },
  });
}

/**
 * Publica el formulario.
 *
 * `POST /api/forms/:id/publish` es de la **fase 7** y todavía no existe: hoy el
 * servidor responde con el 404 de Next, que este cliente convierte en un
 * `ErrorApi` visible como cualquier otro. La llamada está escrita contra el
 * contrato definitivo (PR.md · «Interfaces HTTP»), así que el botón empezará a
 * funcionar sin tocar nada en cuanto la ruta aterrice.
 */
export async function publicarFormulario(id: string): Promise<RespuestaFormulario> {
  return peticion<RespuestaFormulario>(`/api/forms/${encodeURIComponent(id)}/publish`, {
    metodo: 'POST',
    cuerpo: {},
  });
}
