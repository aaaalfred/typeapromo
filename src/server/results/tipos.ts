/**
 * Formas de datos de los resultados (fase 8 de PLAN.md).
 *
 * Módulo **puro**: no importa `@/db` ni nada que abra el pool de PostgreSQL, de
 * modo que la interfaz pueda importar estos tipos con `import type` sin
 * arrastrar el servidor al bundle del navegador.
 *
 * Las fechas viajan aquí como `Date`. Al cruzar HTTP se convierten en cadenas
 * ISO, y por eso `src/components/resultados/tipos.ts` mantiene una copia con
 * `string` — la misma decisión, y el mismo motivo, que en el panel.
 */

import type { QuestionType } from '@/lib/forms';

/* -------------------------------------------------------------------------- */
/* Filtros                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Estado de sesión por el que se puede filtrar.
 *
 * `abandonadas` **no** es una columna: es el predicado derivado de
 * `@/server/responses/abandono` (sin `completed_at` y con más de 30 minutos de
 * inactividad). `en_curso` es su complemento entre las no completadas.
 */
export const ESTADOS_RESULTADO = ['todas', 'completadas', 'abandonadas', 'en_curso'] as const;

export type EstadoResultado = (typeof ESTADOS_RESULTADO)[number];

/** Estado concreto de una sesión, ya clasificada. */
export type EstadoSesion = 'completada' | 'abandonada' | 'en_curso';

/**
 * Filtros aplicados **tanto al resumen como a la tabla**. No hay dos universos:
 * lo que se cuenta arriba es exactamente lo que se lista abajo.
 */
export interface FiltrosResultados {
  /** Versión concreta, o `null` para todas las publicadas del formulario. */
  readonly versionId: string | null;
  readonly estado: EstadoResultado;
  /** Límite inferior sobre `started_at`, inclusive. */
  readonly desde: Date | null;
  /** Límite superior sobre `started_at`, inclusive. */
  readonly hasta: Date | null;
  readonly page: number;
  readonly perPage: number;
}

/* -------------------------------------------------------------------------- */
/* Resumen                                                                     */
/* -------------------------------------------------------------------------- */

export interface ResumenSesiones {
  /** Sesiones iniciadas dentro del filtro. */
  readonly iniciadas: number;
  readonly completadas: number;
  /** Derivadas en consulta, nunca almacenadas (PLAN.md · §2.9). */
  readonly abandonadas: number;
  /** Ni completadas ni abandonadas: siguen dentro de la ventana de actividad. */
  readonly enCurso: number;
  /** `completadas / iniciadas` en `[0, 1]`. `0` cuando no hay sesiones. */
  readonly tasaFinalizacion: number;
}

/** Una fila del desglose de abandono por pregunta. */
export interface AbandonoPregunta {
  readonly questionId: string;
  readonly titulo: string;
  /** Sesiones abandonadas cuya última pantalla era esta. */
  readonly abandonos: number;
  /** Proporción sobre el total de abandonos, en `[0, 1]`. */
  readonly porcentaje: number;
}

/* -------------------------------------------------------------------------- */
/* Métricas por pregunta                                                       */
/* -------------------------------------------------------------------------- */

export interface ValorDistribucion {
  /** Clave canónica del valor (el `value` de la opción, o el número en texto). */
  readonly valor: string;
  /** Etiqueta legible. Para las opciones, su `label` en la versión más reciente. */
  readonly etiqueta: string;
  readonly recuento: number;
}

/**
 * Métricas de una pregunta, agregadas sobre todas las versiones en alcance.
 *
 * Cada respuesta se interpreta contra el snapshot de **su propia versión**, que
 * es lo que permite mezclar versiones sin falsear nada: si en la versión 1 la
 * valoración tenía 5 estrellas y en la 2 tiene 10, el promedio en unidades
 * originales deja de tener sentido (`promedio` pasa a `null`) pero el
 * normalizado sigue siendo comparable.
 */
export interface MetricaPregunta {
  readonly questionId: string;
  readonly titulo: string;
  readonly tipo: QuestionType;
  /** `true` si el tipo de la pregunta cambió entre versiones del alcance. */
  readonly tiposMixtos: boolean;
  /** Respuestas con valor. */
  readonly respondidas: number;
  /** Respuestas guardadas en blanco (pregunta opcional pasada de largo). */
  readonly enBlanco: number;
  /** Respuestas cuya versión no define esta pregunta. Normalmente `0`. */
  readonly descartadas: number;
  /** Distribución para selección, escala y valoración; `null` para el resto. */
  readonly distribucion: readonly ValorDistribucion[] | null;
  /** Promedio en unidades originales (escala y valoración de escala única). */
  readonly promedio: number | null;
  /** Promedio normalizado a `[0, 1]`. Solo valoración. */
  readonly promedioNormalizado: number | null;
  /** Escalas de valoración observadas. Más de una implica `promedio === null`. */
  readonly escalas: readonly number[];
}

/* -------------------------------------------------------------------------- */
/* Tabla de respuestas individuales                                            */
/* -------------------------------------------------------------------------- */

export interface FilaRespuesta {
  readonly sessionId: string;
  readonly versionId: string;
  readonly versionNumber: number | null;
  readonly estado: EstadoSesion;
  readonly iniciada: Date;
  readonly ultimaActividad: Date;
  readonly completada: Date | null;
  readonly respondidas: number;
  /** Valor ya legible por `questionId`. Las respuestas de texto van completas. */
  readonly respuestas: Readonly<Record<string, string>>;
}

export interface TablaRespuestas {
  readonly items: readonly FilaRespuesta[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

/* -------------------------------------------------------------------------- */
/* Documento completo                                                          */
/* -------------------------------------------------------------------------- */

export interface VersionResumen {
  readonly id: string;
  readonly versionNumber: number;
  readonly publishedAt: Date;
  readonly esActiva: boolean;
}

export interface FormularioResumen {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
}

/** Cuerpo de `GET /api/forms/:id/results`. */
export interface Resultados {
  readonly form: FormularioResumen;
  /** Todas las versiones publicadas, para poblar el selector de la interfaz. */
  readonly versiones: readonly VersionResumen[];
  readonly filtros: FiltrosResultados;
  readonly resumen: ResumenSesiones;
  readonly abandonoPorPregunta: readonly AbandonoPregunta[];
  readonly preguntas: readonly MetricaPregunta[];
  readonly tabla: TablaRespuestas;
  /** Instante de cálculo. El abandono depende de él, así que se hace explícito. */
  readonly generadoEn: Date;
}
