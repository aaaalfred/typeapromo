/**
 * Capa de servicio de los resultados.
 *
 * Aquí no hay HTTP: las funciones reciben filtros ya validados y lanzan
 * `FormsError` con un código de dominio, igual que la fase 3. Traducirlo a un
 * estado y a un cuerpo es responsabilidad de `src/app/api/forms/[id]/results*`.
 *
 * La regla que gobierna todo el módulo: **las respuestas se leen por versión,
 * contra el snapshot de `form_versions`**. Nunca contra el borrador. Es lo que
 * hace que publicar de nuevo no mueva un solo resultado histórico, y por eso el
 * catálogo de preguntas se construye a partir de los snapshots y no del
 * documento vivo.
 */

import { FormsError, formularioNoEncontrado } from '@/server/forms/errors';

import {
  construirCatalogo,
  textoDeRespuesta,
  type Catalogo,
  type VersionEnAlcance,
} from './catalogo';
import {
  BOM_UTF8,
  COLUMNAS_METADATOS,
  filaCsv,
  nombreArchivoCsv,
} from './csv';
import {
  abandonoPorPantalla,
  cargarContexto,
  condicionDeSesiones,
  contarSesiones,
  paginaDeSesiones,
  recorrerRespuestas,
  recorrerSesiones,
  respuestasDeSesiones,
  resumirEnBaseDeDatos,
  type ContextoResultados,
  type FilaSesion,
} from './consultas';
import {
  AcumuladorMetricas,
  clasificarSesion,
  desglosarAbandono,
} from './metricas';
import type {
  EstadoSesion,
  FilaRespuesta,
  FiltrosResultados,
  Resultados,
} from './tipos';

/** Etiqueta legible de cada estado de sesión. Se usa en la tabla y en el CSV. */
export const ETIQUETA_ESTADO_SESION: Readonly<Record<EstadoSesion, string>> = {
  completada: 'Completada',
  abandonada: 'Abandonada',
  en_curso: 'En curso',
};

function versionNoEncontrada(): FormsError {
  return new FormsError('NO_ENCONTRADO', 'La versión indicada no existe en este formulario.');
}

function sinVersiones(): FormsError {
  return new FormsError(
    'NO_ENCONTRADO',
    'El formulario todavía no tiene ninguna versión publicada, así que no hay resultados.',
  );
}

/**
 * Versiones dentro del alcance del filtro.
 *
 * Sin filtro de versión entran **todas**, y el catálogo las une por
 * identificador de pregunta. Es la lectura por defecto porque la pregunta que
 * suele hacerse el equipo —«¿qué han contestado?»— no distingue de qué versión
 * viene cada respuesta; el selector está ahí para cuando sí importa.
 */
function alcanceDeVersiones(
  contexto: ContextoResultados,
  versionId: string | null,
): readonly VersionEnAlcance[] {
  if (versionId === null) return contexto.versiones;

  const conocida = contexto.metadatos.some((version) => version.id === versionId);
  if (!conocida) throw versionNoEncontrada();

  return contexto.versiones.filter((version) => version.id === versionId);
}

/* -------------------------------------------------------------------------- */
/* Resumen completo                                                            */
/* -------------------------------------------------------------------------- */

export async function obtenerResultados(
  formId: string,
  filtros: FiltrosResultados,
  workspaceId?: string,
): Promise<Resultados> {
  const contexto = await cargarContexto(formId, workspaceId);
  if (contexto === null) throw formularioNoEncontrado();

  const versiones = alcanceDeVersiones(contexto, filtros.versionId);
  const catalogo = construirCatalogo(versiones);

  // Un único instante para toda la respuesta: el abandono depende de «ahora», y
  // calcular el resumen con una hora y la tabla con otra produciría cifras que
  // no cuadran entre sí por unos milisegundos.
  const ahora = new Date();
  const condicion = condicionDeSesiones(formId, filtros, ahora);

  const [resumen, filasAbandono, total] = await Promise.all([
    resumirEnBaseDeDatos(condicion, ahora),
    abandonoPorPantalla(condicion, ahora),
    contarSesiones(condicion),
  ]);

  const acumulador = new AcumuladorMetricas(catalogo);
  for await (const lote of recorrerRespuestas(condicion)) {
    for (const respuesta of lote) acumulador.agregar(respuesta);
  }

  const sesiones = await paginaDeSesiones(condicion, filtros.page, filtros.perPage);
  const items = await componerFilas(sesiones, catalogo, contexto, ahora);

  return {
    form: {
      id: contexto.form.id,
      slug: contexto.form.slug,
      title: contexto.form.title,
      status: contexto.form.status,
    },
    versiones: contexto.metadatos,
    filtros,
    resumen,
    abandonoPorPregunta: desglosarAbandono(filasAbandono, catalogo),
    preguntas: acumulador.resultado(),
    tabla: {
      items,
      total,
      page: filtros.page,
      perPage: filtros.perPage,
      pageCount: Math.max(1, Math.ceil(total / filtros.perPage)),
    },
    generadoEn: ahora,
  };
}

/** Convierte un lote de sesiones en filas de tabla, con sus respuestas resueltas. */
async function componerFilas(
  sesiones: readonly FilaSesion[],
  catalogo: Catalogo,
  contexto: ContextoResultados,
  ahora: Date,
): Promise<FilaRespuesta[]> {
  const porSesion = await respuestasDeSesiones(sesiones.map((sesion) => sesion.id));
  const numeroDeVersion = new Map(
    contexto.metadatos.map((version) => [version.id, version.versionNumber]),
  );
  const definiciones = new Map(catalogo.map((entrada) => [entrada.questionId, entrada.porVersion]));

  return sesiones.map((sesion) => {
    const respuestas: Record<string, string> = {};
    for (const respuesta of porSesion.get(sesion.id) ?? []) {
      const pregunta = definiciones.get(respuesta.questionId)?.get(respuesta.versionId) ?? null;
      respuestas[respuesta.questionId] = textoDeRespuesta(pregunta, respuesta.valueJson);
    }

    return {
      sessionId: sesion.id,
      versionId: sesion.versionId,
      versionNumber: numeroDeVersion.get(sesion.versionId) ?? null,
      estado: clasificarSesion(sesion, ahora),
      iniciada: sesion.startedAt,
      ultimaActividad: sesion.lastActivityAt,
      completada: sesion.completedAt,
      respondidas: sesion.answeredCount,
      respuestas,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Exportación CSV                                                             */
/* -------------------------------------------------------------------------- */

export interface ExportacionCsv {
  readonly nombreArchivo: string;
  readonly versionId: string;
  readonly versionNumber: number;
  /** Trozos de texto ya serializados, listos para el cuerpo de la respuesta. */
  readonly trozos: AsyncGenerator<string>;
}

/**
 * Prepara la exportación de **una** versión.
 *
 * «Una columna por pregunta» solo tiene sentido dentro de una versión: dos
 * snapshots distintos pueden tener preguntas distintas, y mezclarlos produciría
 * una tabla con huecos que nadie sabe interpretar. Si no se indica versión se
 * exporta la activa, y a falta de activa la última publicada.
 */
export async function prepararCsv(
  formId: string,
  filtros: FiltrosResultados,
  workspaceId?: string,
): Promise<ExportacionCsv> {
  const contexto = await cargarContexto(formId, workspaceId);
  if (contexto === null) throw formularioNoEncontrado();
  if (contexto.metadatos.length === 0) throw sinVersiones();

  const version = resolverVersionCsv(contexto, filtros.versionId);

  // El filtro se reescribe con la versión resuelta: las filas exportadas y las
  // columnas de la cabecera vienen así del mismo sitio, sin poder discrepar.
  const filtrosDeVersion: FiltrosResultados = { ...filtros, versionId: version.id };
  const catalogo = construirCatalogo([version]);

  return {
    nombreArchivo: nombreArchivoCsv(contexto.form.slug, version.versionNumber),
    versionId: version.id,
    versionNumber: version.versionNumber,
    trozos: emitirCsv(formId, filtrosDeVersion, catalogo, contexto),
  };
}

function resolverVersionCsv(
  contexto: ContextoResultados,
  versionId: string | null,
): VersionEnAlcance {
  if (versionId !== null) {
    const elegida = contexto.versiones.find((version) => version.id === versionId);
    if (elegida === undefined) throw versionNoEncontrada();
    return elegida;
  }

  const activa = contexto.versiones.find(
    (version) => version.id === contexto.form.activeVersionId,
  );
  if (activa !== undefined) return activa;

  const ultima = [...contexto.versiones].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  if (ultima === undefined) throw sinVersiones();
  return ultima;
}

/**
 * Encabezados de las columnas de pregunta.
 *
 * Dos preguntas pueden llamarse igual; en ese caso se desambigua con el
 * identificador estable en lugar de dejar dos columnas indistinguibles.
 */
export function encabezadosDePreguntas(catalogo: Catalogo): string[] {
  const repetidos = new Set<string>();
  const vistos = new Set<string>();
  for (const entrada of catalogo) {
    if (vistos.has(entrada.titulo)) repetidos.add(entrada.titulo);
    vistos.add(entrada.titulo);
  }
  return catalogo.map((entrada) =>
    repetidos.has(entrada.titulo) ? `${entrada.titulo} (${entrada.questionId})` : entrada.titulo,
  );
}

/**
 * Genera el CSV **en streaming**.
 *
 * Nunca hay más de un lote de sesiones —y sus respuestas— en memoria: se emite
 * la cabecera, y después un trozo de texto por lote leído con paginación por
 * clave. Es un requisito explícito de PLAN.md, no una optimización.
 */
async function* emitirCsv(
  formId: string,
  filtros: FiltrosResultados,
  catalogo: Catalogo,
  contexto: ContextoResultados,
): AsyncGenerator<string> {
  const ahora = new Date();
  const condicion = condicionDeSesiones(formId, filtros, ahora);
  const numeroDeVersion = new Map(
    contexto.metadatos.map((version) => [version.id, version.versionNumber]),
  );
  const definiciones = new Map(catalogo.map((entrada) => [entrada.questionId, entrada.porVersion]));

  // El BOM va una sola vez y antes que nada: es lo que hace que Excel abra el
  // fichero como UTF-8 y los acentos no se rompan.
  yield BOM_UTF8 + filaCsv([...COLUMNAS_METADATOS, ...encabezadosDePreguntas(catalogo)]);

  for await (const lote of recorrerSesiones(condicion)) {
    const porSesion = await respuestasDeSesiones(lote.map((sesion) => sesion.id));

    let bloque = '';
    for (const sesion of lote) {
      // Cada respuesta se resuelve con la definición de **su** versión.
      const valores = new Map<string, string>();
      for (const respuesta of porSesion.get(sesion.id) ?? []) {
        const pregunta = definiciones.get(respuesta.questionId)?.get(respuesta.versionId) ?? null;
        valores.set(respuesta.questionId, textoDeRespuesta(pregunta, respuesta.valueJson));
      }

      bloque += filaCsv([
        sesion.id,
        String(numeroDeVersion.get(sesion.versionId) ?? ''),
        ETIQUETA_ESTADO_SESION[clasificarSesion(sesion, ahora)],
        sesion.startedAt.toISOString(),
        sesion.lastActivityAt.toISOString(),
        sesion.completedAt === null ? '' : sesion.completedAt.toISOString(),
        String(sesion.answeredCount),
        ...catalogo.map((entrada) => valores.get(entrada.questionId) ?? ''),
      ]);
    }

    yield bloque;
  }
}
