/**
 * Métricas de resultados: resumen de sesiones, abandono derivado y
 * distribuciones y promedios por tipo de pregunta.
 *
 * Módulo **puro**. Recibe filas ya leídas y devuelve números; no conoce Drizzle
 * ni PostgreSQL. Esa separación es la que permite comprobar el cálculo del
 * abandono, las distribuciones y el rating normalizado sin `DATABASE_URL`.
 *
 * Dos decisiones que conviene tener presentes:
 *
 * - **El abandono se deriva**, aquí igual que en SQL: se reutiliza el predicado
 *   de `@/server/responses/abandono` en lugar de reimplementar el umbral. Si
 *   algún día cambian los 30 minutos, cambian en un solo sitio.
 * - **Con varias escalas de valoración en el alcance, `promedio` es `null`.**
 *   Promediar un 4 sobre 5 con un 4 sobre 10 no significa nada; el valor que sí
 *   significa algo es `promedioNormalizado`, que es exactamente para lo que
 *   existe `(valor - 1) / (escala - 1)`.
 */

import { safeNormalize, type QuestionDefinition } from '@/lib/forms';
import { estaAbandonada, type SesionParaAbandono } from '@/server/responses/abandono';

import {
  esValorVacio,
  etiquetaDeOpcion,
  indexarCatalogo,
  type Catalogo,
  type EntradaCatalogo,
} from './catalogo';
import type {
  AbandonoPregunta,
  EstadoSesion,
  MetricaPregunta,
  ResumenSesiones,
  ValorDistribucion,
} from './tipos';

/* -------------------------------------------------------------------------- */
/* Sesiones                                                                    */
/* -------------------------------------------------------------------------- */

/** Clasifica una sesión en los tres estados que muestra el panel. */
export function clasificarSesion(sesion: SesionParaAbandono, ahora: Date): EstadoSesion {
  if (sesion.completedAt !== null) return 'completada';
  return estaAbandonada(sesion, ahora) ? 'abandonada' : 'en_curso';
}

/**
 * Resumen a partir de las sesiones en memoria.
 *
 * Existe para poder comprobar el cálculo sin base de datos y para contrastarlo
 * contra el que hace PostgreSQL en `consultas.ts`: los dos tienen que dar lo
 * mismo, y el test de integración lo verifica.
 */
export function resumirSesiones(
  sesiones: readonly SesionParaAbandono[],
  ahora: Date,
): ResumenSesiones {
  let completadas = 0;
  let abandonadas = 0;

  for (const sesion of sesiones) {
    const estado = clasificarSesion(sesion, ahora);
    if (estado === 'completada') completadas += 1;
    else if (estado === 'abandonada') abandonadas += 1;
  }

  return construirResumen(sesiones.length, completadas, abandonadas);
}

/** Compone el resumen a partir de los tres recuentos, vengan de donde vengan. */
export function construirResumen(
  iniciadas: number,
  completadas: number,
  abandonadas: number,
): ResumenSesiones {
  return {
    iniciadas,
    completadas,
    abandonadas,
    enCurso: Math.max(0, iniciadas - completadas - abandonadas),
    tasaFinalizacion: iniciadas === 0 ? 0 : completadas / iniciadas,
  };
}

/* -------------------------------------------------------------------------- */
/* Abandono por pregunta                                                       */
/* -------------------------------------------------------------------------- */

/** Sesión abandonada, con la pantalla en la que se quedó. */
export interface AbandonoCrudo {
  readonly questionId: string | null;
  readonly abandonos: number;
}

/**
 * Desglose de abandono por pregunta.
 *
 * La pantalla en la que se quedó la sesión es `response_sessions.current_question_id`:
 * no hace falta ningún evento `abandoned` ni ningún job, que es justo lo que
 * evita PLAN.md · §2.9. Las sesiones sin pantalla conocida se agrupan aparte en
 * lugar de repartirse.
 */
export function desglosarAbandono(
  filas: readonly AbandonoCrudo[],
  catalogo: Catalogo,
): AbandonoPregunta[] {
  const titulos = new Map(catalogo.map((entrada) => [entrada.questionId, entrada.titulo]));

  const agregado = new Map<string, number>();
  for (const fila of filas) {
    const clave = fila.questionId ?? '';
    agregado.set(clave, (agregado.get(clave) ?? 0) + fila.abandonos);
  }

  const total = [...agregado.values()].reduce((suma, valor) => suma + valor, 0);
  const orden = new Map(catalogo.map((entrada, indice) => [entrada.questionId, indice]));

  return [...agregado.entries()]
    .map(([questionId, abandonos]) => ({
      questionId,
      titulo:
        questionId === ''
          ? 'Sin pantalla registrada'
          : (titulos.get(questionId) ?? `Pantalla «${questionId}»`),
      abandonos,
      porcentaje: total === 0 ? 0 : abandonos / total,
    }))
    .sort((a, b) => {
      if (b.abandonos !== a.abandonos) return b.abandonos - a.abandonos;
      const ordenA = orden.get(a.questionId) ?? Number.MAX_SAFE_INTEGER;
      const ordenB = orden.get(b.questionId) ?? Number.MAX_SAFE_INTEGER;
      return ordenA - ordenB;
    });
}

/* -------------------------------------------------------------------------- */
/* Distribuciones y promedios                                                  */
/* -------------------------------------------------------------------------- */

/** Fila de `answers` reducida a lo que necesitan las métricas. */
export interface RespuestaCruda {
  readonly versionId: string;
  readonly questionId: string;
  readonly valueJson: unknown;
}

interface EstadoPregunta {
  respondidas: number;
  enBlanco: number;
  descartadas: number;
  recuentos: Map<string, number>;
  etiquetas: Map<string, string>;
  sumaNumerica: number;
  numericas: number;
  sumaNormalizada: number;
  normalizadas: number;
  escalas: Set<number>;
}

function estadoInicial(): EstadoPregunta {
  return {
    respondidas: 0,
    enBlanco: 0,
    descartadas: 0,
    recuentos: new Map(),
    etiquetas: new Map(),
    sumaNumerica: 0,
    numericas: 0,
    sumaNormalizada: 0,
    normalizadas: 0,
    escalas: new Set(),
  };
}

/**
 * Acumulador incremental de métricas.
 *
 * Es incremental a propósito: las respuestas se recorren por lotes desde
 * PostgreSQL y nunca se cargan enteras en memoria. Lo único que crece aquí es
 * el número de **valores distintos**, no el de respuestas.
 */
export class AcumuladorMetricas {
  private readonly indice: ReadonlyMap<string, EntradaCatalogo>;
  private readonly estados = new Map<string, EstadoPregunta>();

  constructor(private readonly catalogo: Catalogo) {
    this.indice = indexarCatalogo(catalogo);
    for (const entrada of catalogo) {
      this.estados.set(entrada.questionId, estadoInicial());
    }
  }

  agregar(respuesta: RespuestaCruda): void {
    const entrada = this.indice.get(respuesta.questionId);
    const estado = this.estados.get(respuesta.questionId);
    if (entrada === undefined || estado === undefined) return;

    // Cada respuesta se interpreta con la definición de **su** versión.
    const pregunta = entrada.porVersion.get(respuesta.versionId);
    if (pregunta === undefined) {
      estado.descartadas += 1;
      return;
    }

    if (esValorVacio(respuesta.valueJson)) {
      estado.enBlanco += 1;
      return;
    }

    estado.respondidas += 1;
    this.contabilizar(estado, pregunta, respuesta.valueJson);
  }

  private contabilizar(
    estado: EstadoPregunta,
    pregunta: QuestionDefinition,
    valor: unknown,
  ): void {
    switch (pregunta.type) {
      case 'single_choice': {
        if (typeof valor !== 'string') return;
        anotar(estado, valor, etiquetaDeOpcion(pregunta, valor));
        return;
      }
      case 'multi_choice': {
        if (!Array.isArray(valor)) return;
        const elementos: readonly unknown[] = valor;
        for (const elemento of elementos) {
          if (typeof elemento !== 'string') continue;
          anotar(estado, elemento, etiquetaDeOpcion(pregunta, elemento));
        }
        return;
      }
      case 'scale': {
        if (typeof valor !== 'number' || !Number.isFinite(valor)) return;
        anotar(estado, String(valor), String(valor));
        estado.sumaNumerica += valor;
        estado.numericas += 1;
        return;
      }
      case 'rating': {
        if (typeof valor !== 'number' || !Number.isFinite(valor)) return;
        anotar(estado, String(valor), String(valor));
        estado.sumaNumerica += valor;
        estado.numericas += 1;
        estado.escalas.add(pregunta.scale);

        // `(valor - 1) / (escala - 1)`: calculado al leer, nunca almacenado.
        const normalizado = safeNormalize(valor, pregunta.scale);
        if (normalizado !== null) {
          estado.sumaNormalizada += normalizado;
          estado.normalizadas += 1;
        }
        return;
      }
      default:
        // Texto, correo y fecha no tienen distribución: se leen completos en la
        // tabla y en el CSV, sin análisis de ningún tipo (exclusión de PR.md).
        return;
    }
  }

  resultado(): MetricaPregunta[] {
    return this.catalogo.map((entrada) => {
      const estado = this.estados.get(entrada.questionId) ?? estadoInicial();
      const escalas = [...estado.escalas].sort((a, b) => a - b);
      const escalaUnica = escalas.length === 1;

      const promedio =
        (entrada.tipo === 'scale' || entrada.tipo === 'rating') &&
        estado.numericas > 0 &&
        (entrada.tipo === 'scale' || escalaUnica)
          ? estado.sumaNumerica / estado.numericas
          : null;

      const promedioNormalizado =
        entrada.tipo === 'rating' && estado.normalizadas > 0
          ? estado.sumaNormalizada / estado.normalizadas
          : null;

      return {
        questionId: entrada.questionId,
        titulo: entrada.titulo,
        tipo: entrada.tipo,
        tiposMixtos: entrada.tiposMixtos,
        respondidas: estado.respondidas,
        enBlanco: estado.enBlanco,
        descartadas: estado.descartadas,
        distribucion: distribucionDe(entrada, estado),
        promedio,
        promedioNormalizado,
        escalas,
      };
    });
  }
}

function anotar(estado: EstadoPregunta, clave: string, etiqueta: string): void {
  estado.recuentos.set(clave, (estado.recuentos.get(clave) ?? 0) + 1);
  estado.etiquetas.set(clave, etiqueta);
}

/**
 * Distribución con **ceros explícitos**: una opción que nadie ha elegido es un
 * dato, y omitirla haría que la lista cambiara de forma entre dos cargas.
 */
function distribucionDe(
  entrada: EntradaCatalogo,
  estado: EstadoPregunta,
): ValorDistribucion[] | null {
  const pregunta = entrada.preguntaReciente;

  const esperadas = clavesEsperadas(pregunta, estado);
  if (esperadas === null) return null;

  const vistas = new Set(esperadas.map((clave) => clave.valor));
  const extras = [...estado.recuentos.entries()]
    .filter(([clave]) => !vistas.has(clave))
    .map(([clave, recuento]) => ({
      valor: clave,
      etiqueta: estado.etiquetas.get(clave) ?? clave,
      recuento,
    }))
    .sort((a, b) => b.recuento - a.recuento || a.valor.localeCompare(b.valor));

  return [
    ...esperadas.map((clave) => ({
      valor: clave.valor,
      etiqueta: clave.etiqueta,
      recuento: estado.recuentos.get(clave.valor) ?? 0,
    })),
    ...extras,
  ];
}

/** Claves que la pregunta declara, en su orden natural. `null` si no hay. */
function clavesEsperadas(
  pregunta: QuestionDefinition,
  estado: EstadoPregunta,
): { valor: string; etiqueta: string }[] | null {
  switch (pregunta.type) {
    case 'single_choice':
    case 'multi_choice':
      return pregunta.choices.map((opcion) => ({ valor: opcion.value, etiqueta: opcion.label }));
    case 'scale': {
      const claves: { valor: string; etiqueta: string }[] = [];
      for (let valor = pregunta.min; valor <= pregunta.max; valor += pregunta.step) {
        claves.push({ valor: String(valor), etiqueta: String(valor) });
      }
      return claves;
    }
    case 'rating': {
      // Con varias escalas en el alcance manda la mayor, para que ningún valor
      // observado se quede fuera de la rejilla.
      const maxima = Math.max(pregunta.scale, ...estado.escalas);
      const claves: { valor: string; etiqueta: string }[] = [];
      for (let valor = 1; valor <= maxima; valor += 1) {
        claves.push({ valor: String(valor), etiqueta: String(valor) });
      }
      return claves;
    }
    default:
      return null;
  }
}
