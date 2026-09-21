/**
 * Errores de dominio de la experiencia pública.
 *
 * Mismo patrón y mismo contrato de cuerpo que `@/server/forms/errors` y
 * `@/server/media/errores` (`{ error: { code, message, details? } }`, mensajes
 * en español), pero con su propio juego de códigos y **sin depender de ellos**:
 * quien responde un formulario no es un usuario autenticado y sus fallos no se
 * parecen a los del panel.
 *
 * Ningún mensaje puede llevar trazas, SQL ni nada de la sesión de otra persona:
 * lo que no sea un error de dominio sale como `ERROR_INTERNO` con texto genérico
 * y el detalle se queda en el log del servidor.
 */

export const RESPONSES_ERROR_CODES = [
  'NO_ENCONTRADO',
  'DATOS_INVALIDOS',
  'FORMULARIO_NO_DISPONIBLE',
  'CUPO_EXCEDIDO',
  'SESION_NO_ENCONTRADA',
  'SESION_COMPLETADA',
  'DEMASIADAS_PETICIONES',
  'ERROR_INTERNO',
] as const;

export type ResponsesErrorCode = (typeof RESPONSES_ERROR_CODES)[number];

/** Estado HTTP de cada código. Única fuente de verdad de la correspondencia. */
const HTTP_STATUS_BY_CODE: Readonly<Record<ResponsesErrorCode, number>> = {
  NO_ENCONTRADO: 404,
  DATOS_INVALIDOS: 400,
  /** 409 y no 404: el formulario existe, pero ahora mismo no admite respuestas. */
  FORMULARIO_NO_DISPONIBLE: 409,
  /** 403: el formulario o workspace ha superado el cupo de respuestas del mes. */
  CUPO_EXCEDIDO: 403,
  /**
   * 404 y no 401: no hay identidad que autenticar. La cookie caducó, se borró o
   * apunta a una sesión que ya no existe, y lo que procede es empezar de nuevo.
   */
  SESION_NO_ENCONTRADA: 404,
  SESION_COMPLETADA: 409,
  DEMASIADAS_PETICIONES: 429,
  ERROR_INTERNO: 500,
};

export function httpStatusFor(code: ResponsesErrorCode): number {
  return HTTP_STATUS_BY_CODE[code];
}

export type ResponsesErrorDetails = Readonly<Record<string, unknown>>;

export class ResponsesError extends Error {
  readonly code: ResponsesErrorCode;
  readonly status: number;
  readonly details: ResponsesErrorDetails | undefined;

  constructor(
    code: ResponsesErrorCode,
    message: string,
    details?: ResponsesErrorDetails,
  ) {
    super(message);
    this.name = 'ResponsesError';
    this.code = code;
    this.status = HTTP_STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function isResponsesError(value: unknown): value is ResponsesError {
  return value instanceof ResponsesError;
}

/* -------------------------------------------------------------------------- */
/* Constructores de conveniencia                                               */
/* -------------------------------------------------------------------------- */

export function formularioNoEncontrado(): ResponsesError {
  return new ResponsesError('NO_ENCONTRADO', 'Este formulario no existe.');
}

export function sesionNoEncontrada(): ResponsesError {
  return new ResponsesError(
    'SESION_NO_ENCONTRADA',
    'No hemos encontrado tu sesión de respuesta. Recarga la página para empezar de nuevo.',
  );
}

export function sesionCompletada(): ResponsesError {
  return new ResponsesError(
    'SESION_COMPLETADA',
    'Esta respuesta ya se ha enviado y no se puede modificar.',
  );
}

export function formularioNoDisponible(message?: string): ResponsesError {
  return new ResponsesError(
    'FORMULARIO_NO_DISPONIBLE',
    message ?? 'Este formulario no admite respuestas en este momento.',
  );
}

export function cupoExcedido(message?: string): ResponsesError {
  return new ResponsesError(
    'CUPO_EXCEDIDO',
    message ?? 'Este formulario no admite más respuestas este mes.',
  );
}

export function datosInvalidos(
  message: string,
  details?: ResponsesErrorDetails,
): ResponsesError {
  return new ResponsesError('DATOS_INVALIDOS', message, details);
}

export function demasiadasPeticiones(reintentarEnSegundos: number): ResponsesError {
  return new ResponsesError(
    'DEMASIADAS_PETICIONES',
    'Has hecho demasiadas peticiones seguidas. Espera unos segundos e inténtalo de nuevo.',
    { reintentarEnSegundos },
  );
}
