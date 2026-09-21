/**
 * Sesiones de respuesta: creación, reanudación, autosave y finalización.
 *
 * Cuatro invariantes sostienen este módulo:
 *
 * 1. **Cada sesión queda ligada a una versión concreta.** Todo —el documento que
 *    se pinta, el recorrido que calcula el motor y la fila de cada respuesta—
 *    cuelga de `response_sessions.version_id`. Publicar una segunda versión no
 *    puede alterar un recorrido, una etiqueta ni una respuesta de la primera,
 *    porque la primera sigue leyendo su propio snapshot inmutable. Al reanudar
 *    se sirve **la versión de la sesión**, no la activa.
 * 2. **El token nunca se guarda en claro.** En la fila solo hay `token_hash`
 *    (SHA-256); el valor viaja únicamente en la cookie `HttpOnly`.
 * 3. **Ninguna dirección IP entra aquí.** `response_sessions` no tiene columna
 *    de IP y este módulo no recibe ni una cabecera de red. El control de abuso
 *    vive aislado en `@/server/rate-limit`.
 * 4. **El autosave es idempotente.** El índice único `(session_id, question_id)`
 *    convierte reeditar una respuesta al retroceder en un `UPDATE`, nunca en una
 *    fila duplicada (`src/db/README.md`).
 *
 * Los eventos de `form_events` se registran **fuera de la transacción**, una vez
 * confirmada: un `INSERT` fallido dentro de una transacción de PostgreSQL la
 * aborta entera, y una métrica no puede tumbar una respuesta ya guardada.
 */

import { and, count, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { answers, formVersions, responseSessions } from '@/db/schema';
import {
  firstScreen,
  formDefinitionSchema,
  isQuestionBlock,
  nextScreen,
  progressFor,
  validateAnswer,
  type AnswerValue,
  type AnswersMap,
  type BlockDefinition,
  type FormDefinition,
  type FormProgress,
  type ScreenRef,
} from '@/lib/forms';
import type { DbHandle } from '@/server/forms/db';

import {
  ResponsesError,
  datosInvalidos,
  formularioNoDisponible,
  sesionCompletada,
  sesionNoEncontrada,
} from './errores';
import { registrarEvento } from './eventos';
import { idDePantalla, pantallaDesdeId } from './pantalla';
import type { FormularioDisponible } from './publico';
import { crearToken, hashDeToken, pareceToken } from './token';

/* -------------------------------------------------------------------------- */
/* Tipos de salida                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Lo que se le cuenta al navegador de una sesión.
 *
 * **No incluye el identificador de la sesión ni nada derivado del token.** El
 * cliente no necesita conocerlos: la cookie ya lo identifica y publicarlos solo
 * añadiría un valor correlacionable en el HTML.
 */
export interface VistaSesion {
  readonly respuestas: AnswersMap;
  readonly pantalla: ScreenRef;
  readonly completada: boolean;
  /** Versión a la que quedó ligada la sesión. Informativo. */
  readonly versionNumber: number;
  /** Progreso según el recorrido efectivo. Estimación: ver `progreso`. */
  readonly progreso: FormProgress;
}

/** Sesión ya resuelta contra su versión, para uso interno del servidor. */
export interface SesionCargada {
  readonly sessionId: string;
  readonly formId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly definicion: FormDefinition;
  readonly respuestas: AnswersMap;
  readonly pantalla: ScreenRef;
  readonly completada: boolean;
}

export interface SesionCreada {
  /** Valor en claro. Va a la cookie `HttpOnly` y a ningún otro sitio. */
  readonly token: string;
  readonly sesion: SesionCargada;
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `answers.value_json` es `NOT NULL`, pero una pregunta pasada en blanco se
 * registra como `null` **de JSON**, no como ausencia de fila: el motor necesita
 * distinguir «respondida en blanco» de «todavía no vista» para resolver su
 * bifurcación. El driver traduce un `null` de JavaScript a `NULL` de SQL, así
 * que el literal hay que escribirlo explícitamente.
 */
function valorPersistible(valor: AnswerValue): unknown {
  return valor === null ? sql`'null'::jsonb` : valor;
}

function aMapaDeRespuestas(
  filas: readonly { questionId: string; valueJson: unknown }[],
): AnswersMap {
  const mapa: Record<string, AnswerValue> = {};
  for (const fila of filas) {
    mapa[fila.questionId] = fila.valueJson as AnswerValue;
  }
  return mapa;
}

async function leerRespuestas(handle: DbHandle, sessionId: string): Promise<AnswersMap> {
  const filas = await handle
    .select({ questionId: answers.questionId, valueJson: answers.valueJson })
    .from(answers)
    .where(eq(answers.sessionId, sessionId));

  return aMapaDeRespuestas(filas);
}

/** Snapshot ilegible: fallo del servidor, nunca del visitante. */
function parseSnapshot(value: unknown): FormDefinition {
  const parsed = formDefinitionSchema.safeParse(value);
  if (!parsed.success) {
    throw new ResponsesError(
      'ERROR_INTERNO',
      'Este formulario no se puede mostrar ahora mismo. Inténtalo más tarde.',
    );
  }
  return parsed.data;
}

function progresoDe(
  definicion: FormDefinition,
  respuestas: AnswersMap,
  pantalla: ScreenRef,
): FormProgress {
  if (pantalla.kind !== 'block') {
    return { answered: 0, remaining: 0, total: 0, ratio: 1, deterministic: true };
  }
  return progressFor(definicion, respuestas, pantalla.id);
}

/** Proyección de una sesión hacia el navegador. */
export function aVistaSesion(sesion: SesionCargada): VistaSesion {
  return {
    respuestas: sesion.respuestas,
    pantalla: sesion.pantalla,
    completada: sesion.completada,
    versionNumber: sesion.versionNumber,
    progreso: progresoDe(sesion.definicion, sesion.respuestas, sesion.pantalla),
  };
}

/* -------------------------------------------------------------------------- */
/* Crear                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Crea una sesión ligada a la versión activa del formulario y devuelve el token
 * en claro **una sola vez**, para que el borde HTTP lo ponga en la cookie.
 */
export async function crearSesion(
  formulario: FormularioDisponible,
): Promise<SesionCreada> {
  // Comprobar límite mensual de respuestas según el plan del workspace
  const { comprobarLimiteRespuestas } = await import('@/server/billing/servicio');
  const verificacionPlan = await comprobarLimiteRespuestas(formulario.workspaceId);
  if (!verificacionPlan.permitido) {
    throw formularioNoDisponible(verificacionPlan.motivo);
  }

  const token = crearToken();
  const tokenHash = hashDeToken(token);
  const definicion = formulario.version.definition;
  const pantalla = firstScreen(definicion);

  const [fila] = await db
    .insert(responseSessions)
    .values({
      formId: formulario.formId,
      versionId: formulario.version.id,
      tokenHash,
      status: 'in_progress',
      currentQuestionId: idDePantalla(pantalla),
      answeredCount: 0,
    })
    .returning({ id: responseSessions.id });

  if (!fila) {
    throw new ResponsesError(
      'ERROR_INTERNO',
      'No se ha podido iniciar la sesión de respuesta. Inténtalo de nuevo.',
    );
  }

  const sesion: SesionCargada = {
    sessionId: fila.id,
    formId: formulario.formId,
    versionId: formulario.version.id,
    versionNumber: formulario.version.versionNumber,
    definicion,
    respuestas: {},
    pantalla,
    completada: false,
  };

  await registrarEvento(db, {
    formId: sesion.formId,
    versionId: sesion.versionId,
    sessionId: sesion.sessionId,
    type: 'started',
  });

  return { token, sesion };
}

/* -------------------------------------------------------------------------- */
/* Reanudar                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Carga la sesión del navegador a partir del token de la cookie.
 *
 * Devuelve `null` en vez de lanzar cuando no hay nada que reanudar: una cookie
 * caducada, borrada o de otro formulario es un caso normal, no un error, y lo
 * que procede es empezar de cero.
 *
 * La definición que se devuelve es la de **la versión de la sesión**, aunque
 * entretanto se haya publicado otra. Ese es el criterio de «hecho» de la fase.
 */
export async function cargarSesion(
  formId: string,
  token: string | undefined,
): Promise<SesionCargada | null> {
  if (!pareceToken(token)) return null;

  const [fila] = await db
    .select({
      sessionId: responseSessions.id,
      formId: responseSessions.formId,
      versionId: responseSessions.versionId,
      currentQuestionId: responseSessions.currentQuestionId,
      status: responseSessions.status,
      versionNumber: formVersions.versionNumber,
      definition: formVersions.definition,
    })
    .from(responseSessions)
    .innerJoin(formVersions, eq(formVersions.id, responseSessions.versionId))
    .where(
      and(
        eq(responseSessions.tokenHash, hashDeToken(token)),
        eq(responseSessions.formId, formId),
      ),
    )
    .limit(1);

  if (!fila) return null;

  const definicion = parseSnapshot(fila.definition);
  const respuestas = await leerRespuestas(db, fila.sessionId);

  return {
    sessionId: fila.sessionId,
    formId: fila.formId,
    versionId: fila.versionId,
    versionNumber: fila.versionNumber,
    definicion,
    respuestas,
    pantalla: pantallaDesdeId(definicion, fila.currentQuestionId),
    completada: fila.status === 'completed',
  };
}

/** Igual que `cargarSesion`, pero exige una sesión viva y sin completar. */
async function exigirSesionActiva(
  formId: string,
  token: string | undefined,
): Promise<SesionCargada> {
  const sesion = await cargarSesion(formId, token);
  if (sesion === null) throw sesionNoEncontrada();
  if (sesion.completada) throw sesionCompletada();
  return sesion;
}

/* -------------------------------------------------------------------------- */
/* Autosave                                                                    */
/* -------------------------------------------------------------------------- */

export interface EntradaRespuesta {
  readonly formId: string;
  readonly token: string | undefined;
  readonly questionId: string;
  /** Valor sin validar, tal cual llega del navegador. */
  readonly valor: unknown;
}

export interface ResultadoAvance {
  readonly sesion: SesionCargada;
  readonly vista: VistaSesion;
  /** `true` si el recorrido ha llegado a una pantalla final. */
  readonly terminado: boolean;
}

function bloqueDeRecorrido(
  definicion: FormDefinition,
  questionId: string,
): BlockDefinition {
  const bloque = definicion.blocks.find((candidato) => candidato.id === questionId);
  if (bloque === undefined) {
    throw datosInvalidos('Esa pregunta no pertenece a este formulario.', { questionId });
  }
  return bloque;
}

/**
 * Guarda la respuesta a una pregunta y calcula la siguiente pantalla.
 *
 * El destino lo decide **el motor en el servidor**, no el cliente: el navegador
 * puede pedir guardar cualquier pregunta, pero no puede elegir a dónde va el
 * recorrido ni saltarse una bifurcación.
 *
 * El `UPDATE` de la sesión y el `INSERT … ON CONFLICT` de la respuesta van en la
 * misma transacción: una respuesta guardada con la sesión apuntando a la
 * pantalla anterior haría que recargar la reenviara.
 */
export async function guardarRespuesta(
  entrada: EntradaRespuesta,
): Promise<ResultadoAvance> {
  const sesion = await exigirSesionActiva(entrada.formId, entrada.token);
  const bloque = bloqueDeRecorrido(sesion.definicion, entrada.questionId);

  // Los bloques sin respuesta (bienvenida, declaración) también «avanzan»: se
  // registran como `null` para que el motor los cuente como vistos.
  const validacion = validateAnswer(bloque, entrada.valor);
  if (!validacion.ok) {
    throw datosInvalidos('La respuesta no es válida.', {
      questionId: entrada.questionId,
      issues: validacion.issues,
    });
  }

  const valor = validacion.value;
  const guardaValor = isQuestionBlock(bloque);

  const resultado = await db.transaction(async (tx) => {
    if (guardaValor) {
      await tx
        .insert(answers)
        .values({
          sessionId: sesion.sessionId,
          formId: sesion.formId,
          versionId: sesion.versionId,
          questionId: entrada.questionId,
          questionType: bloque.type,
          valueJson: valorPersistible(valor),
        })
        .onConflictDoUpdate({
          target: [answers.sessionId, answers.questionId],
          set: {
            valueJson: valorPersistible(valor),
            questionType: bloque.type,
            updatedAt: sql`now()`,
          },
        });
    }

    const respuestas = await leerRespuestas(tx, sesion.sessionId);
    const siguiente = nextScreen(sesion.definicion, respuestas, entrada.questionId);

    const [agregado] = await tx
      .select({ total: count() })
      .from(answers)
      .where(eq(answers.sessionId, sesion.sessionId));

    await tx
      .update(responseSessions)
      .set({
        currentQuestionId: idDePantalla(siguiente),
        answeredCount: agregado?.total ?? 0,
        lastActivityAt: sql`now()`,
      })
      .where(eq(responseSessions.id, sesion.sessionId));

    return { respuestas, siguiente };
  });

  const actualizada: SesionCargada = {
    ...sesion,
    respuestas: resultado.respuestas,
    pantalla: resultado.siguiente,
  };

  await registrarEvento(db, {
    formId: sesion.formId,
    versionId: sesion.versionId,
    sessionId: sesion.sessionId,
    type: 'advanced',
    questionId: entrada.questionId,
    metadata: { blockType: bloque.type, hacia: idDePantalla(resultado.siguiente) },
  });

  return {
    sesion: actualizada,
    vista: aVistaSesion(actualizada),
    terminado: resultado.siguiente.kind !== 'block',
  };
}

/* -------------------------------------------------------------------------- */
/* Completar                                                                   */
/* -------------------------------------------------------------------------- */

export interface ResultadoCompletar {
  readonly vista: VistaSesion;
}

/**
 * Cierra la sesión.
 *
 * Es **idempotente**: una sesión ya completada devuelve su estado sin volver a
 * escribir ni a registrar el evento. La pantalla final puede recargarse, y con
 * una conexión inestable la petición puede llegar dos veces.
 */
export async function completarSesion(
  formId: string,
  token: string | undefined,
): Promise<ResultadoCompletar> {
  const sesion = await cargarSesion(formId, token);
  if (sesion === null) throw sesionNoEncontrada();

  if (sesion.completada) {
    return { vista: aVistaSesion(sesion) };
  }

  await db
    .update(responseSessions)
    .set({
      status: 'completed',
      completedAt: sql`now()`,
      lastActivityAt: sql`now()`,
    })
    .where(eq(responseSessions.id, sesion.sessionId));

  await registrarEvento(db, {
    formId: sesion.formId,
    versionId: sesion.versionId,
    sessionId: sesion.sessionId,
    type: 'completed',
    metadata: { respondidas: Object.keys(sesion.respuestas).length },
  });

  return { vista: aVistaSesion({ ...sesion, completada: true }) };
}
