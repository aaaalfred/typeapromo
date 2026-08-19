/**
 * Errores de dominio de la capa de formularios.
 *
 * La capa de servicio nunca construye respuestas HTTP: lanza `FormsError` con un
 * código estable y un mensaje **en español** apto para mostrarse al usuario. El
 * borde HTTP (`src/app/api/forms`) traduce el código a un estado y serializa el
 * cuerpo.
 *
 * Ningún mensaje ni ningún `details` puede contener trazas, SQL ni la cadena de
 * conexión: lo que no sea un error de dominio se convierte en `ERROR_INTERNO`
 * con un mensaje genérico, y el detalle real se queda en el log del servidor.
 */

/** Códigos estables devueltos al cliente. Son parte del contrato de la API. */
export const FORMS_ERROR_CODES = [
  'NO_AUTENTICADO',
  'NO_ENCONTRADO',
  'DATOS_INVALIDOS',
  'CONFLICTO_REVISION',
  'TRANSICION_INVALIDA',
  'SLUG_EN_USO',
  'ERROR_INTERNO',
] as const;

export type FormsErrorCode = (typeof FORMS_ERROR_CODES)[number];

/** Estado HTTP de cada código. Única fuente de verdad de la correspondencia. */
const HTTP_STATUS_BY_CODE: Readonly<Record<FormsErrorCode, number>> = {
  NO_AUTENTICADO: 401,
  NO_ENCONTRADO: 404,
  DATOS_INVALIDOS: 400,
  CONFLICTO_REVISION: 409,
  TRANSICION_INVALIDA: 409,
  SLUG_EN_USO: 409,
  ERROR_INTERNO: 500,
};

export function httpStatusFor(code: FormsErrorCode): number {
  return HTTP_STATUS_BY_CODE[code];
}

/** Datos adicionales seguros de publicar (revisión del servidor, campos inválidos…). */
export type FormsErrorDetails = Readonly<Record<string, unknown>>;

export class FormsError extends Error {
  readonly code: FormsErrorCode;
  readonly status: number;
  readonly details: FormsErrorDetails | undefined;

  constructor(code: FormsErrorCode, message: string, details?: FormsErrorDetails) {
    super(message);
    this.name = 'FormsError';
    this.code = code;
    this.status = HTTP_STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function isFormsError(value: unknown): value is FormsError {
  return value instanceof FormsError;
}

/* -------------------------------------------------------------------------- */
/* Constructores de conveniencia                                               */
/* -------------------------------------------------------------------------- */

export function noAutenticado(): FormsError {
  return new FormsError('NO_AUTENTICADO', 'Necesitas iniciar sesión para continuar.');
}

export function formularioNoEncontrado(): FormsError {
  return new FormsError('NO_ENCONTRADO', 'El formulario no existe.');
}

export function borradorNoEncontrado(): FormsError {
  return new FormsError('NO_ENCONTRADO', 'El formulario no tiene borrador.');
}

export function datosInvalidos(message: string, details?: FormsErrorDetails): FormsError {
  return new FormsError('DATOS_INVALIDOS', message, details);
}

/**
 * Conflicto de concurrencia optimista del borrador. El cuerpo lleva siempre la
 * revisión del servidor para que el cliente pueda recargar y reintentar.
 */
export function conflictoDeRevision(
  revisionEnviada: number,
  revisionServidor: number,
): FormsError {
  return new FormsError(
    'CONFLICTO_REVISION',
    'El borrador ha cambiado en otra pestaña o dispositivo. Recarga para no perder cambios.',
    { revisionEnviada, revisionServidor },
  );
}

export function transicionInvalida(message: string, details?: FormsErrorDetails): FormsError {
  return new FormsError('TRANSICION_INVALIDA', message, details);
}
