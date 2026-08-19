'use client';

import { useCallback, useEffect, useState } from 'react';

import { Aviso } from '@/components/panel/aviso';
import { EstadoVacio } from '@/components/panel/estados';

import { AbandonoPreguntas } from './abandono-preguntas';
import { esCancelacion, esErrorApi, obtenerResultados, urlCsvResultados } from './api';
import { Distribuciones } from './distribuciones';
import { EsqueletoResultados } from './esqueleto';
import { FiltrosResultadosPanel } from './filtros-resultados';
import { formatearFecha, plural } from './formato';
import { ResumenResultados } from './resumen-resultados';
import { TablaRespuestasIndividuales } from './tabla-respuestas';
import { FILTROS_INICIALES, type FiltrosResultados, type Resultados } from './tipos';

/**
 * Pantalla de resultados de un formulario.
 *
 * Es un componente de cliente y no una página resuelta en el servidor por la
 * misma razón que el listado: los filtros se cambian sin recargar y, sobre todo,
 * un fallo de red tiene que **verse** dentro del panel con un botón de
 * reintentar, en lugar de acabar en la pantalla de error genérica de Next.
 *
 * Los tres estados que no son «aquí están los datos» —cargando, vacío y error—
 * se pintan de verdad. Una pantalla en blanco es indistinguible de una avería, y
 * es justo el momento en el que hay que decir algo.
 *
 * El resumen y la tabla salen de la **misma** consulta y del mismo instante: el
 * abandono se deriva de «ahora», y calcular las cifras de arriba con una hora y
 * las de abajo con otra produciría totales que no cuadran entre sí.
 */

export interface PropsPanelResultados {
  readonly formularioId: string;
  /** Título conocido antes de la primera respuesta, para no titular en blanco. */
  readonly tituloInicial?: string;
}

/** Resultado de la última consulta resuelta, etiquetado con su clave. */
interface EstadoConsulta {
  readonly clave: string;
  readonly datos: Resultados | null;
  readonly error: string | null;
}

/** Identidad de una consulta. `recarga` la cambia para forzar un refresco igual. */
function claveDeConsulta(filtros: FiltrosResultados, recarga: number): string {
  return JSON.stringify([filtros, recarga]);
}

function mensajeDeError(causa: unknown): string {
  if (esErrorApi(causa)) return causa.message;
  return 'Se ha producido un error inesperado. Inténtalo de nuevo.';
}

export function PanelResultados({ formularioId, tituloInicial }: PropsPanelResultados) {
  const [filtros, setFiltros] = useState<FiltrosResultados>(FILTROS_INICIALES);
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<EstadoConsulta | null>(null);

  const clave = claveDeConsulta(filtros, recarga);

  const recargar = useCallback(() => {
    setRecarga((valor) => valor + 1);
  }, []);

  useEffect(() => {
    const control = new AbortController();
    let vigente = true;

    obtenerResultados(formularioId, filtros, control.signal)
      .then((datos) => {
        if (vigente) setResultado({ clave, datos, error: null });
      })
      .catch((causa: unknown) => {
        if (!vigente || esCancelacion(causa)) return;
        setResultado({ clave, datos: null, error: mensajeDeError(causa) });
      });

    return () => {
      vigente = false;
      control.abort();
    };
  }, [clave, filtros, formularioId]);

  // Carga **derivada**: mientras el resultado guardado no lleve la clave actual,
  // hay una consulta en vuelo. Sin booleano aparte que subir y bajar por cada
  // camino, incluido el del error, que es donde se olvida.
  const cargando = resultado === null || resultado.clave !== clave;
  const datos = resultado?.datos ?? null;
  const error = resultado !== null && resultado.clave === clave ? resultado.error : null;
  const primeraCarga = datos === null && cargando;

  const titulo = datos?.form.title ?? tituloInicial ?? 'Resultados';
  const hayVersiones = datos !== null && datos.versiones.length > 0;
  const generadoEn = formatearFecha(datos?.generadoEn ?? null);

  return (
    <section aria-labelledby="titulo-resultados" className="flex flex-col gap-6">
      <header>
        <h1 id="titulo-resultados" className="text-2xl font-semibold tracking-tight">
          Resultados
        </h1>
        <p className="mt-1 text-sm text-[color:var(--tp-texto-suave)]">
          {titulo}
          {datos === null ? '' : ` · /f/${datos.form.slug}`}
        </p>
      </header>

      <p role="status" className="text-sm text-[color:var(--tp-texto-suave)]">
        {error !== null
          ? 'No se han podido cargar los resultados.'
          : primeraCarga
            ? 'Cargando resultados…'
            : `${plural(datos?.resumen.iniciadas ?? 0, 'sesión', 'sesiones')}${
                cargando ? ' · actualizando…' : ''
              }${generadoEn === null ? '' : ` · calculado a las ${generadoEn}`}`}
      </p>

      {error !== null ? (
        <Aviso
          titulo="No se han podido cargar los resultados"
          etiquetaAccion="Reintentar"
          onAccion={recargar}
        >
          {error}
        </Aviso>
      ) : primeraCarga || datos === null ? (
        <EsqueletoResultados />
      ) : !hayVersiones ? (
        <EstadoVacio
          titulo="Todavía no hay nada que medir"
          descripcion="Este formulario no tiene ninguna versión publicada, así que no puede haber respuestas. Publícalo y las sesiones aparecerán aquí."
        />
      ) : (
        <>
          <FiltrosResultadosPanel
            filtros={filtros}
            versiones={datos.versiones}
            urlCsv={urlCsvResultados(formularioId, filtros)}
            onCambio={setFiltros}
          />

          <ResumenResultados resumen={datos.resumen} />

          <AbandonoPreguntas filas={datos.abandonoPorPregunta} />

          <Distribuciones preguntas={datos.preguntas} />

          <TablaRespuestasIndividuales
            tabla={datos.tabla}
            preguntas={datos.preguntas}
            actualizando={cargando}
            onPagina={(pagina) => {
              setFiltros((actual) => ({ ...actual, page: pagina }));
            }}
          />
        </>
      )}
    </section>
  );
}
