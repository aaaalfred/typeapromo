/**
 * Catálogo de preguntas de un conjunto de versiones.
 *
 * Las respuestas se leen **por versión**, contra el snapshot inmutable de
 * `form_versions`, nunca contra el borrador actual: eso es lo que hace que
 * publicar de nuevo no mueva ni un resultado histórico. Pero el panel quiere
 * ver una sola tabla aunque haya varias versiones en el rango, así que hace
 * falta un catálogo que:
 *
 * 1. una las preguntas por su identificador estable, que sobrevive a las
 *    publicaciones;
 * 2. conserve la **definición concreta de cada versión**, porque es la única
 *    que sabe interpretar una respuesta suya (las etiquetas de una opción o la
 *    escala de una valoración pueden haber cambiado);
 * 3. tome el título y el tipo visibles de la versión **más reciente**, que es
 *    el vocabulario con el que quien mira el panel piensa hoy.
 *
 * Módulo **puro**: no toca la base de datos.
 */

import {
  isQuestionBlock,
  type FormDefinition,
  type QuestionDefinition,
  type QuestionType,
} from '@/lib/forms';

/** Versión publicada dentro del alcance de la consulta, ya parseada. */
export interface VersionEnAlcance {
  readonly id: string;
  readonly versionNumber: number;
  readonly definition: FormDefinition;
}

/** Una pregunta vista a través de todas las versiones en las que aparece. */
export interface EntradaCatalogo {
  readonly questionId: string;
  /** Título de la versión más reciente que contiene la pregunta. */
  readonly titulo: string;
  /** Tipo de la versión más reciente. */
  readonly tipo: QuestionType;
  /** `true` si el tipo cambió entre versiones del alcance. */
  readonly tiposMixtos: boolean;
  /** Definición de la versión más reciente. Manda en etiquetas y en orden. */
  readonly preguntaReciente: QuestionDefinition;
  /** Definición por versión: interpreta cada respuesta con su propio contrato. */
  readonly porVersion: ReadonlyMap<string, QuestionDefinition>;
}

export type Catalogo = readonly EntradaCatalogo[];

interface EntradaMutable {
  questionId: string;
  titulo: string;
  tipo: QuestionType;
  tipos: Set<QuestionType>;
  preguntaReciente: QuestionDefinition;
  porVersion: Map<string, QuestionDefinition>;
  orden: number;
}

/**
 * Construye el catálogo recorriendo las versiones de la más antigua a la más
 * reciente, de forma que la última en escribir —la más nueva— sea la que fija
 * título, tipo, etiquetas y posición.
 */
export function construirCatalogo(versiones: readonly VersionEnAlcance[]): Catalogo {
  const acumulado = new Map<string, EntradaMutable>();

  const ordenadas = [...versiones].sort((a, b) => a.versionNumber - b.versionNumber);

  for (const version of ordenadas) {
    let posicion = 0;
    for (const bloque of version.definition.blocks) {
      if (!isQuestionBlock(bloque)) continue;

      const existente = acumulado.get(bloque.id);
      if (existente === undefined) {
        acumulado.set(bloque.id, {
          questionId: bloque.id,
          titulo: bloque.title,
          tipo: bloque.type,
          tipos: new Set([bloque.type]),
          preguntaReciente: bloque,
          porVersion: new Map([[version.id, bloque]]),
          orden: posicion,
        });
      } else {
        existente.titulo = bloque.title;
        existente.tipo = bloque.type;
        existente.tipos.add(bloque.type);
        existente.preguntaReciente = bloque;
        existente.porVersion.set(version.id, bloque);
        existente.orden = posicion;
      }
      posicion += 1;
    }
  }

  return [...acumulado.values()]
    .sort((a, b) => (a.orden === b.orden ? a.questionId.localeCompare(b.questionId) : a.orden - b.orden))
    .map((entrada) => ({
      questionId: entrada.questionId,
      titulo: entrada.titulo,
      tipo: entrada.tipo,
      tiposMixtos: entrada.tipos.size > 1,
      preguntaReciente: entrada.preguntaReciente,
      porVersion: entrada.porVersion,
    }));
}

/** Índice por identificador, para no recorrer el catálogo en cada respuesta. */
export function indexarCatalogo(catalogo: Catalogo): ReadonlyMap<string, EntradaCatalogo> {
  return new Map(catalogo.map((entrada) => [entrada.questionId, entrada]));
}

/* -------------------------------------------------------------------------- */
/* Lectura de valores                                                          */
/* -------------------------------------------------------------------------- */

/** `true` si el valor persistido cuenta como «pasada en blanco». */
export function esValorVacio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === 'string') return valor.trim().length === 0;
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

/** Etiqueta de una opción según la definición dada; el valor crudo si no existe. */
export function etiquetaDeOpcion(pregunta: QuestionDefinition, valor: string): string {
  if (pregunta.type !== 'single_choice' && pregunta.type !== 'multi_choice') return valor;
  return pregunta.choices.find((opcion) => opcion.value === valor)?.label ?? valor;
}

/** Separador entre las opciones de una selección múltiple, en tabla y en CSV. */
export const SEPARADOR_MULTIPLE = '; ';

/**
 * Texto legible de una respuesta, **completo y sin recortar**.
 *
 * Las respuestas de texto salen tal cual: PR.md excluye explícitamente
 * cualquier análisis de sentimiento o de IA sobre ellas, y truncarlas sería la
 * primera forma de perderlas.
 *
 * `pregunta` es la definición de la versión de esa respuesta. Cuando es `null`
 * —la versión no conocía la pregunta— se serializa el valor bruto en lugar de
 * inventarse una interpretación.
 */
export function textoDeRespuesta(pregunta: QuestionDefinition | null, valor: unknown): string {
  if (esValorVacio(valor)) return '';

  if (Array.isArray(valor)) {
    const elementos: readonly unknown[] = valor;
    return elementos
      .map((elemento) => {
        const texto = escalarATexto(elemento);
        return pregunta === null ? texto : etiquetaDeOpcion(pregunta, texto);
      })
      .join(SEPARADOR_MULTIPLE);
  }

  if (typeof valor === 'string') {
    return pregunta === null ? valor : etiquetaDeOpcion(pregunta, valor);
  }

  return escalarATexto(valor);
}

/** Último recurso: cualquier valor a texto sin perder información. */
function escalarATexto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (valor === null || valor === undefined) return '';
  const serializado = JSON.stringify(valor);
  return typeof serializado === 'string' ? serializado : '';
}
