/**
 * Formas de datos de los resultados **tal y como viajan por HTTP**.
 *
 * Es una copia deliberada de `@/server/results/tipos` con las fechas como
 * `string`: allí son `Date`, pero después de `JSON.stringify` llegan al
 * navegador como cadenas ISO. Reutilizar el tipo del servidor dejaría compilar
 * un `.getTime()` que reventaría en tiempo de ejecución, y además arrastraría
 * `@/db` al bundle del cliente.
 *
 * El contrato de origen está en `src/server/results/tipos.ts`; cualquier cambio
 * allí debe reflejarse aquí. La misma decisión —y el mismo motivo— que en
 * `src/components/panel/tipos.ts`.
 */

import type { QuestionType } from '@/lib/forms';

export type { QuestionType };

/* -------------------------------------------------------------------------- */
/* Filtros                                                                     */
/* -------------------------------------------------------------------------- */

export const ESTADOS_RESULTADO = ['todas', 'completadas', 'abandonadas', 'en_curso'] as const;

export type EstadoResultado = (typeof ESTADOS_RESULTADO)[number];

/** Estado concreto de una sesión, ya clasificada por el servidor. */
export type EstadoSesion = 'completada' | 'abandonada' | 'en_curso';

/**
 * Filtros de la vista. Se aplican igual al resumen y a la tabla, así que lo que
 * se cuenta arriba es exactamente lo que se lista abajo.
 *
 * `desde` y `hasta` son fechas civiles `YYYY-MM-DD`, que es lo que produce un
 * `<input type="date">` y lo que el servidor interpreta en UTC.
 */
export interface FiltrosResultados {
  readonly versionId: string | null;
  readonly estado: EstadoResultado;
  readonly desde: string | null;
  readonly hasta: string | null;
  readonly page: number;
  readonly perPage: number;
}

export const PER_PAGE_POR_DEFECTO = 25;

export const FILTROS_INICIALES: FiltrosResultados = {
  versionId: null,
  estado: 'todas',
  desde: null,
  hasta: null,
  page: 1,
  perPage: PER_PAGE_POR_DEFECTO,
};

/** Opciones del selector de estado, en el orden en que se muestran. */
export const OPCIONES_ESTADO: readonly { value: EstadoResultado; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'completadas', label: 'Completadas' },
  { value: 'abandonadas', label: 'Abandonadas' },
  { value: 'en_curso', label: 'En curso' },
];

/* -------------------------------------------------------------------------- */
/* Documento                                                                   */
/* -------------------------------------------------------------------------- */

export interface ResumenSesiones {
  readonly iniciadas: number;
  readonly completadas: number;
  /** Derivadas en consulta, nunca almacenadas. */
  readonly abandonadas: number;
  readonly enCurso: number;
  /** En `[0, 1]`. */
  readonly tasaFinalizacion: number;
}

export interface AbandonoPregunta {
  readonly questionId: string;
  readonly titulo: string;
  readonly abandonos: number;
  readonly porcentaje: number;
}

export interface ValorDistribucion {
  readonly valor: string;
  readonly etiqueta: string;
  readonly recuento: number;
}

export interface MetricaPregunta {
  readonly questionId: string;
  readonly titulo: string;
  readonly tipo: QuestionType;
  readonly tiposMixtos: boolean;
  readonly respondidas: number;
  readonly enBlanco: number;
  readonly descartadas: number;
  readonly distribucion: readonly ValorDistribucion[] | null;
  readonly promedio: number | null;
  readonly promedioNormalizado: number | null;
  readonly escalas: readonly number[];
}

export interface FilaRespuesta {
  readonly sessionId: string;
  readonly versionId: string;
  readonly versionNumber: number | null;
  readonly estado: EstadoSesion;
  /** Fecha ISO. */
  readonly iniciada: string;
  readonly ultimaActividad: string;
  readonly completada: string | null;
  readonly respondidas: number;
  /** Texto ya legible por `questionId`. Las respuestas de texto van completas. */
  readonly respuestas: Readonly<Record<string, string>>;
}

export interface TablaRespuestas {
  readonly items: readonly FilaRespuesta[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

export interface VersionResumen {
  readonly id: string;
  readonly versionNumber: number;
  /** Fecha ISO. */
  readonly publishedAt: string;
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
  readonly versiones: readonly VersionResumen[];
  readonly filtros: {
    readonly versionId: string | null;
    readonly estado: EstadoResultado;
    readonly desde: string | null;
    readonly hasta: string | null;
    readonly page: number;
    readonly perPage: number;
  };
  readonly resumen: ResumenSesiones;
  readonly abandonoPorPregunta: readonly AbandonoPregunta[];
  readonly preguntas: readonly MetricaPregunta[];
  readonly tabla: TablaRespuestas;
  /** Fecha ISO del cálculo. El abandono depende de ella. */
  readonly generadoEn: string;
}
