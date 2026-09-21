/**
 * Decisiones de la publicación. **Lógica pura**: no toca la base de datos, así
 * que sus tests corren sin `DATABASE_URL`.
 *
 * Existe separado de `publicar.ts` por el mismo motivo que
 * `@/server/media/decisiones`: las dos reglas que más caro salen si se
 * equivocan —qué numero de versión toca y qué se le cuenta al usuario cuando la
 * validación falla— quedan escritas aparte y la transacción se limita a
 * ejecutarlas.
 */

import type { FormStatus } from '@/db/schema';
import type { ValidationError, ValidationReport, ValidationWarning } from '@/lib/forms';

/* -------------------------------------------------------------------------- */
/* Numeración                                                                  */
/* -------------------------------------------------------------------------- */

/** Primera versión de un formulario. `form_versions.version_number` empieza en 1. */
export const PRIMERA_VERSION = 1;

/**
 * Siguiente número de versión. Es correlativo **por formulario**, nunca global,
 * y el índice único `(form_id, version_number)` lo garantiza aunque dos
 * publicaciones simultáneas calculen el mismo candidato: la segunda choca y se
 * reintenta.
 */
export function siguienteNumeroDeVersion(maximoActual: number | null): number {
  if (maximoActual === null || maximoActual < PRIMERA_VERSION) return PRIMERA_VERSION;
  return maximoActual + 1;
}

/* -------------------------------------------------------------------------- */
/* Estado tras publicar                                                        */
/* -------------------------------------------------------------------------- */

export type DecisionPublicacion =
  | { readonly ok: true; readonly estado: Extract<FormStatus, 'published'> }
  | { readonly ok: false; readonly message: string };

/**
 * Publicar deja el formulario en `published` viniera de donde viniera, salvo
 * archivado.
 *
 * Volver a publicar un formulario **cerrado** lo reabre: es la forma natural de
 * decir «vuelvo a admitir respuestas con este contenido nuevo», y las respuestas
 * de las versiones anteriores siguen intactas porque cuelgan de su propia
 * versión. Un formulario **archivado** no se publica: su borrador es de solo
 * lectura y publicarlo sin desarchivar dejaría un estado incoherente.
 */
export function decidirPublicacion(estadoActual: FormStatus): DecisionPublicacion {
  if (estadoActual === 'archived') {
    return {
      ok: false,
      message: 'No se puede publicar un formulario archivado. Desarchívalo primero.',
    };
  }
  return { ok: true, estado: 'published' };
}

/* -------------------------------------------------------------------------- */
/* Traducción del informe de validación                                        */
/* -------------------------------------------------------------------------- */

/** Problema tal y como viaja dentro de `details` al cliente. */
export interface ProblemaPublicacion {
  readonly code: string;
  readonly message: string;
  /** Ruta dentro del documento, ya serializada (`blocks.3.choices`). */
  readonly path: string;
}

/** `details` de un `DATOS_INVALIDOS` de publicación. */
export interface DetallesPublicacion {
  readonly errors: readonly ProblemaPublicacion[];
  readonly warnings: readonly ProblemaPublicacion[];
}

function aProblema(issue: ValidationError | ValidationWarning): ProblemaPublicacion {
  return { code: issue.code, message: issue.message, path: issue.path.join('.') };
}

/**
 * Aplana el informe del validador a algo publicable por HTTP.
 *
 * Se conservan **los problemas concretos**, no un recuento: el editor tiene que
 * poder enseñar cuál es la regla rota y dónde está. Las advertencias viajan
 * aunque no bloqueen, porque son lo que el usuario quiere ver justo después de
 * corregir los errores.
 */
export function detallesDeValidacion(informe: ValidationReport): DetallesPublicacion {
  return {
    errors: informe.errors.map(aProblema),
    warnings: informe.warnings.map(aProblema),
  };
}

/** Resumen en español de por qué no se ha podido publicar. */
export function mensajeDeValidacion(informe: ValidationReport): string {
  const total = informe.errors.length;
  if (total === 1) {
    return 'El formulario tiene un problema que impide publicarlo.';
  }
  return `El formulario tiene ${String(total)} problemas que impiden publicarlo.`;
}
