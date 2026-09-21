/**
 * Errores de dominio del pipeline de media.
 *
 * Mismo patrón que `@/server/forms/errors`, pero con su propio juego de códigos
 * y **sin depender de él**: los dos módulos avanzan en paralelo y compartir la
 * enumeración los acoplaría sin ganar nada. La capa de servicio lanza; el borde
 * HTTP (`src/app/api/media`, `src/app/api/internal`) traduce.
 *
 * Ningún mensaje ni ningún `detalles` puede llevar trazas, SQL, claves de objeto
 * internas ni credenciales: lo que no sea un error de dominio sale como
 * `ERROR_INTERNO` con texto genérico y el detalle se queda en el log.
 */

export const MEDIA_ERROR_CODES = [
  'NO_AUTENTICADO',
  'NO_ENCONTRADO',
  'DATOS_INVALIDOS',
  'FORMATO_NO_ADMITIDO',
  'ARCHIVO_DEMASIADO_GRANDE',
  'IMAGEN_DEMASIADO_GRANDE',
  'ESTADO_INVALIDO',
  'ACTIVO_REFERENCIADO',
  'NO_CONFIGURADO',
  'ERROR_INTERNO',
] as const;

export type MediaErrorCode = (typeof MEDIA_ERROR_CODES)[number];

/** Estado HTTP de cada código. Única fuente de verdad de la correspondencia. */
const HTTP_STATUS_BY_CODE: Readonly<Record<MediaErrorCode, number>> = {
  NO_AUTENTICADO: 401,
  NO_ENCONTRADO: 404,
  DATOS_INVALIDOS: 400,
  FORMATO_NO_ADMITIDO: 415,
  ARCHIVO_DEMASIADO_GRANDE: 413,
  IMAGEN_DEMASIADO_GRANDE: 422,
  ESTADO_INVALIDO: 409,
  /** 409 y no 500: es un conflicto legítimo, no un fallo del servidor. */
  ACTIVO_REFERENCIADO: 409,
  NO_CONFIGURADO: 503,
  ERROR_INTERNO: 500,
};

export function httpStatusFor(code: MediaErrorCode): number {
  return HTTP_STATUS_BY_CODE[code];
}

export type MediaErrorDetails = Readonly<Record<string, unknown>>;

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  readonly status: number;
  readonly details: MediaErrorDetails | undefined;

  constructor(code: MediaErrorCode, message: string, details?: MediaErrorDetails) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    this.status = HTTP_STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function isMediaError(value: unknown): value is MediaError {
  return value instanceof MediaError;
}

/* -------------------------------------------------------------------------- */
/* Constructores de conveniencia                                               */
/* -------------------------------------------------------------------------- */

export function noAutenticado(): MediaError {
  return new MediaError('NO_AUTENTICADO', 'Necesitas iniciar sesión para continuar.');
}

export function activoNoEncontrado(): MediaError {
  return new MediaError('NO_ENCONTRADO', 'La imagen no existe.');
}

export function datosInvalidos(message: string, details?: MediaErrorDetails): MediaError {
  return new MediaError('DATOS_INVALIDOS', message, details);
}

export function formatoNoAdmitido(message: string, details?: MediaErrorDetails): MediaError {
  return new MediaError('FORMATO_NO_ADMITIDO', message, details);
}

export function archivoDemasiadoGrande(
  message: string,
  details?: MediaErrorDetails,
): MediaError {
  return new MediaError('ARCHIVO_DEMASIADO_GRANDE', message, details);
}

export function imagenDemasiadoGrande(
  message: string,
  details?: MediaErrorDetails,
): MediaError {
  return new MediaError('IMAGEN_DEMASIADO_GRANDE', message, details);
}

export function estadoInvalido(message: string, details?: MediaErrorDetails): MediaError {
  return new MediaError('ESTADO_INVALIDO', message, details);
}

export function almacenNoConfigurado(faltan: readonly string[]): MediaError {
  return new MediaError(
    'NO_CONFIGURADO',
    'El almacenamiento de imágenes no está configurado en el servidor.',
    { faltan: [...faltan] },
  );
}
