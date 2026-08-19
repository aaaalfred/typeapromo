'use client';

import type { ReactNode } from 'react';

import { Boton } from '@/components/ui/boton';

import { ETIQUETA_ESTADO_SESION, entero, formatearFecha } from './formato';
import type { FilaRespuesta, MetricaPregunta, TablaRespuestas } from './tipos';

/**
 * Tabla paginada de respuestas individuales.
 *
 * Las celdas de texto se pintan **completas**: se envuelven en varias líneas en
 * lugar de recortarse con puntos suspensivos. PR.md excluye explícitamente
 * cualquier análisis de las respuestas abiertas, y truncarlas en pantalla sería
 * la primera forma de perderlas.
 *
 * La tabla puede ser mucho más ancha que la pantalla cuando el formulario tiene
 * muchas preguntas, así que su contenedor es una región enfocable: quien navega
 * con teclado puede desplazarla horizontalmente con las flechas sin necesitar
 * ratón.
 */

export interface PropsTablaRespuestas {
  readonly tabla: TablaRespuestas;
  readonly preguntas: readonly MetricaPregunta[];
  /** `true` mientras hay una consulta en vuelo: la paginación se bloquea. */
  readonly actualizando: boolean;
  readonly onPagina: (pagina: number) => void;
}

export function TablaRespuestasIndividuales({
  tabla,
  preguntas,
  actualizando,
  onPagina,
}: PropsTablaRespuestas) {
  const primera = tabla.total === 0 ? 0 : (tabla.page - 1) * tabla.perPage + 1;
  const ultima = Math.min(tabla.total, tabla.page * tabla.perPage);

  return (
    <section aria-labelledby="titulo-tabla-respuestas" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-tabla-respuestas" className="text-lg font-semibold">
          Respuestas
        </h2>
        <p className="text-sm text-[color:var(--tp-texto-suave)]">
          {tabla.total === 0
            ? 'Ninguna sesión con estos filtros.'
            : `Mostrando ${entero(primera)}–${entero(ultima)} de ${entero(tabla.total)}.`}
        </p>
      </div>

      {tabla.items.length === 0 ? (
        <p className="rounded-[var(--tp-radio-superficie)] border border-dashed border-[color:var(--tp-borde)] p-6 text-center text-sm text-[color:var(--tp-texto-suave)]">
          No hay respuestas que mostrar. Prueba a ampliar el rango de fechas o a cambiar el estado.
        </p>
      ) : (
        <div
          role="region"
          // Nombre propio, distinto del de la sección que la contiene: dos
          // regiones anidadas con la misma etiqueta se leen como duplicados.
          aria-label="Tabla de respuestas"
          tabIndex={0}
          className="tp-foco overflow-x-auto rounded-[var(--tp-radio-superficie)] border border-[color:var(--tp-borde)]"
        >
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <caption className="sr-only">
              Respuestas individuales, una fila por sesión, con una columna por pregunta.
            </caption>
            <thead className="bg-[var(--tp-superficie)]">
              <tr>
                <Encabezado>Sesión</Encabezado>
                <Encabezado>Versión</Encabezado>
                <Encabezado>Estado</Encabezado>
                <Encabezado>Iniciada</Encabezado>
                <Encabezado>Última actividad</Encabezado>
                <Encabezado>Completada</Encabezado>
                <Encabezado>Respondidas</Encabezado>
                {preguntas.map((pregunta) => (
                  <Encabezado key={pregunta.questionId}>{pregunta.titulo}</Encabezado>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.items.map((fila) => (
                <Fila key={fila.sessionId} fila={fila} preguntas={preguntas} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tabla.pageCount > 1 ? (
        <nav aria-label="Paginación de respuestas" className="flex items-center justify-between gap-3">
          <Boton
            estiloTema="outline"
            tamano="sm"
            disabled={actualizando || tabla.page <= 1}
            onClick={() => {
              onPagina(tabla.page - 1);
            }}
          >
            Anterior
          </Boton>
          <p className="text-sm text-[color:var(--tp-texto-suave)]">
            Página {entero(tabla.page)} de {entero(tabla.pageCount)}
          </p>
          <Boton
            estiloTema="outline"
            tamano="sm"
            disabled={actualizando || tabla.page >= tabla.pageCount}
            onClick={() => {
              onPagina(tabla.page + 1);
            }}
          >
            Siguiente
          </Boton>
        </nav>
      ) : null}
    </section>
  );
}

function Encabezado({ children }: { readonly children: ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-[color:var(--tp-borde)] px-3 py-2 align-bottom font-medium whitespace-nowrap"
    >
      {children}
    </th>
  );
}

function Fila({
  fila,
  preguntas,
}: {
  readonly fila: FilaRespuesta;
  readonly preguntas: readonly MetricaPregunta[];
}) {
  return (
    <tr className="border-b border-[color:var(--tp-borde)] last:border-b-0">
      <th scope="row" className="px-3 py-2 font-mono text-xs font-normal whitespace-nowrap">
        <span title={fila.sessionId}>{fila.sessionId.slice(0, 8)}</span>
      </th>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
        {fila.versionNumber === null ? '—' : entero(fila.versionNumber)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{ETIQUETA_ESTADO_SESION[fila.estado]}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Fecha iso={fila.iniciada} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Fecha iso={fila.ultimaActividad} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Fecha iso={fila.completada} />
      </td>
      <td className="px-3 py-2 tabular-nums">{entero(fila.respondidas)}</td>
      {preguntas.map((pregunta) => (
        <td
          key={pregunta.questionId}
          className="max-w-96 min-w-40 px-3 py-2 align-top break-words whitespace-pre-wrap"
        >
          {fila.respuestas[pregunta.questionId] ?? ''}
        </td>
      ))}
    </tr>
  );
}

function Fecha({ iso }: { readonly iso: string | null }) {
  const legible = formatearFecha(iso);
  if (iso === null || legible === null) return <span>—</span>;
  return <time dateTime={iso}>{legible}</time>;
}
