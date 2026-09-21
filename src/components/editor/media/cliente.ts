/**
 * Cliente del pipeline de media (fase 6) para el editor.
 *
 * El recorrido tiene tres pasos y ninguno se puede saltar:
 *
 *   1. `POST /api/media/upload-intent` reserva el activo en estado `uploading`
 *      y devuelve una URL `PUT` firmada contra el bucket privado.
 *   2. El navegador sube los bytes **directamente** a ese bucket. No pasan por
 *      la aplicación.
 *   3. `POST /api/media/:id/complete` verifica firma binaria, tamaño y
 *      dimensiones, procesa con Sharp y publica las variantes.
 *
 * El paso 2 se hace con `XMLHttpRequest` y no con `fetch` por una sola razón:
 * `fetch` no informa del progreso de subida, y una imagen de 8 MB sin barra de
 * progreso parece una aplicación colgada.
 */

import type { ActivoVista } from '@/server/media/vista';

export type { ActivoVista };

/** Cabeceras firmadas: hay que mandarlas exactamente como vienen. */
export interface InstruccionesDeSubida {
  readonly url: string;
  readonly method: 'PUT';
  readonly headers: Record<string, string>;
  readonly expiresAt: string;
}

interface RespuestaIntento {
  readonly asset: ActivoVista;
  readonly upload: InstruccionesDeSubida;
}

interface CuerpoError {
  readonly error?: { readonly code?: string; readonly message?: string };
}

/** Error con el mensaje que la API ya redacta en español. */
export class ErrorMedia extends Error {
  readonly codigo: string;
  readonly estado: number;

  constructor(mensaje: string, codigo: string, estado: number) {
    super(mensaje);
    this.name = 'ErrorMedia';
    this.codigo = codigo;
    this.estado = estado;
  }
}

async function leerError(respuesta: Response): Promise<ErrorMedia> {
  let cuerpo: CuerpoError | null = null;
  try {
    cuerpo = (await respuesta.json()) as CuerpoError;
  } catch {
    // Una respuesta que no es JSON (un 502 del proxy, una página de error de
    // Next) no debe convertirse en «undefined» delante del usuario.
    cuerpo = null;
  }

  return new ErrorMedia(
    cuerpo?.error?.message ?? 'No se ha podido completar la operación con la imagen.',
    cuerpo?.error?.code ?? 'ERROR_DESCONOCIDO',
    respuesta.status,
  );
}

async function pedirJson<T>(url: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(url, { ...init, credentials: 'same-origin' });
  if (!respuesta.ok) throw await leerError(respuesta);
  return (await respuesta.json()) as T;
}

export async function crearIntento(archivo: File): Promise<RespuestaIntento> {
  return pedirJson<RespuestaIntento>('/api/media/upload-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mimeType: archivo.type,
      byteSize: archivo.size,
      filename: archivo.name,
    }),
  });
}

/**
 * Sube los bytes al bucket privado.
 *
 * `content-length` viene en las cabeceras firmadas, pero **no se puede enviar a
 * mano**: es una cabecera prohibida y el navegador la calcula solo. Mandarla
 * provoca que se descarte con un aviso en consola; el resto sí van tal cual.
 */
export function subirBytes(
  instrucciones: InstruccionesDeSubida,
  archivo: File,
  alProgresar: (fraccion: number) => void,
  senal?: AbortSignal,
): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const peticion = new XMLHttpRequest();
    peticion.open(instrucciones.method, instrucciones.url, true);

    for (const [nombre, valor] of Object.entries(instrucciones.headers)) {
      if (nombre.toLowerCase() === 'content-length') continue;
      peticion.setRequestHeader(nombre, valor);
    }

    peticion.upload.addEventListener('progress', (evento) => {
      if (evento.lengthComputable && evento.total > 0) {
        alProgresar(evento.loaded / evento.total);
      }
    });

    peticion.addEventListener('load', () => {
      if (peticion.status >= 200 && peticion.status < 300) {
        alProgresar(1);
        resolver();
        return;
      }
      rechazar(
        new ErrorMedia(
          'El almacenamiento ha rechazado la imagen. Inténtalo de nuevo.',
          'SUBIDA_RECHAZADA',
          peticion.status,
        ),
      );
    });

    peticion.addEventListener('error', () => {
      rechazar(new ErrorMedia('No se ha podido conectar con el almacenamiento.', 'SIN_RED', 0));
    });

    peticion.addEventListener('abort', () => {
      rechazar(new ErrorMedia('Subida cancelada.', 'CANCELADA', 0));
    });

    senal?.addEventListener('abort', () => {
      peticion.abort();
    });

    peticion.send(archivo);
  });
}

export async function completarSubida(assetId: string): Promise<ActivoVista> {
  const { asset } = await pedirJson<{ asset: ActivoVista }>(
    `/api/media/${encodeURIComponent(assetId)}/complete`,
    { method: 'POST' },
  );
  return asset;
}

export async function obtenerActivo(assetId: string): Promise<ActivoVista> {
  const { asset } = await pedirJson<{ asset: ActivoVista; referencias: number }>(
    `/api/media/${encodeURIComponent(assetId)}`,
  );
  return asset;
}

/**
 * Pide el borrado físico del activo.
 *
 * Puede responder `409 ACTIVO_REFERENCIADO` si una versión publicada lo usa, y
 * eso **no es un fallo**: es el borrado seguro haciendo su trabajo. Quien llame
 * debe distinguirlo y decirlo, no tratarlo como un error genérico.
 */
export async function borrarActivo(assetId: string): Promise<void> {
  await pedirJson<unknown>(`/api/media/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
}
