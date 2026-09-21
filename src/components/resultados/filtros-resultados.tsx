'use client';

import { Download } from 'lucide-react';
import { useId } from 'react';

import { CampoTexto } from '@/components/ui/campo';

import { etiquetaDeVersion } from './formato';
import {
  OPCIONES_ESTADO,
  type EstadoResultado,
  type FiltrosResultados,
  type VersionResumen,
} from './tipos';

/**
 * Filtros por versión, estado y rango de fechas, más la descarga del CSV.
 *
 * Los cuatro controles son nativos (`select`, `input type="date"`) y llevan su
 * `<label>` asociado: se recorren con tabulador, se abren con teclado y los
 * anuncia cualquier lector de pantalla sin ayuda. Cambiar cualquiera de ellos
 * dispara la consulta al momento; no hay botón de «aplicar» que se pueda olvidar
 * pulsar.
 *
 * La descarga es un enlace real, no un `fetch`: el navegador se encarga del
 * fichero en streaming y quien mira la página puede abrirla en otra pestaña o
 * copiar la dirección. Lleva **los mismos filtros** que se están viendo, salvo
 * la versión, que el servidor resuelve a una sola —una columna por pregunta solo
 * significa algo dentro de un snapshot—.
 */

export interface PropsFiltrosResultados {
  readonly filtros: FiltrosResultados;
  readonly versiones: readonly VersionResumen[];
  readonly urlCsv: string;
  readonly onCambio: (filtros: FiltrosResultados) => void;
}

export function FiltrosResultadosPanel({
  filtros,
  versiones,
  urlCsv,
  onCambio,
}: PropsFiltrosResultados) {
  const idVersion = useId();
  const idEstado = useId();
  const idDesde = useId();
  const idHasta = useId();

  const clasesControl =
    'tp-foco mt-1.5 w-full rounded-[var(--tp-radio-superficie)] border border-[color:var(--tp-borde)] bg-[var(--tp-control-fondo)] px-4 py-3 text-[color:var(--tp-texto)]';

  return (
    <section aria-labelledby="titulo-filtros-resultados" className="flex flex-col gap-3">
      <h2 id="titulo-filtros-resultados" className="sr-only">
        Filtros de resultados
      </h2>

      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(evento) => {
          // Los filtros se aplican al cambiar: enviar no debe recargar la página.
          evento.preventDefault();
        }}
      >
        <div>
          <label htmlFor={idVersion} className="block text-sm font-medium">
            Versión
          </label>
          <select
            id={idVersion}
            name="versionId"
            value={filtros.versionId ?? ''}
            className={clasesControl}
            onChange={(evento) => {
              const valor = evento.target.value;
              onCambio({ ...filtros, versionId: valor === '' ? null : valor, page: 1 });
            }}
          >
            <option value="">Todas las versiones</option>
            {versiones.map((version) => (
              <option key={version.id} value={version.id}>
                {etiquetaDeVersion(version.versionNumber, version.esActiva)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={idEstado} className="block text-sm font-medium">
            Estado
          </label>
          <select
            id={idEstado}
            name="estado"
            value={filtros.estado}
            className={clasesControl}
            onChange={(evento) => {
              const valor = evento.target.value as EstadoResultado;
              onCambio({ ...filtros, estado: valor, page: 1 });
            }}
          >
            {OPCIONES_ESTADO.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={idDesde} className="block text-sm font-medium">
            Desde
          </label>
          <CampoTexto
            id={idDesde}
            type="date"
            name="desde"
            value={filtros.desde ?? ''}
            className="mt-1.5"
            onChange={(evento) => {
              const valor = evento.target.value;
              onCambio({ ...filtros, desde: valor === '' ? null : valor, page: 1 });
            }}
          />
        </div>

        <div>
          <label htmlFor={idHasta} className="block text-sm font-medium">
            Hasta
          </label>
          <CampoTexto
            id={idHasta}
            type="date"
            name="hasta"
            value={filtros.hasta ?? ''}
            className="mt-1.5"
            onChange={(evento) => {
              const valor = evento.target.value;
              onCambio({ ...filtros, hasta: valor === '' ? null : valor, page: 1 });
            }}
          />
        </div>
      </form>

      <p className="text-sm text-[color:var(--tp-texto-suave)]">
        El rango se aplica sobre la fecha de inicio de la sesión, en UTC.{' '}
        <a
          href={urlCsv}
          download
          className="tp-foco inline-flex items-center gap-1.5 rounded-[var(--tp-radio)] font-medium text-[color:var(--tp-acento)] underline underline-offset-2"
        >
          <Download aria-hidden="true" className="size-4" />
          Descargar CSV
        </a>
      </p>
    </section>
  );
}
