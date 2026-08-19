'use client';

import {
  ETIQUETA_TIPO_PREGUNTA,
  anchuraDeBarra,
  decimal,
  entero,
  porcentaje,
} from './formato';
import type { MetricaPregunta } from './tipos';

/**
 * Distribuciones y promedios por pregunta.
 *
 * Qué se muestra depende del tipo, y esa es toda la lógica:
 *
 * - **Selección, escala y valoración** tienen distribución, con ceros
 *   explícitos: una opción que nadie ha elegido es un dato, y esconderla haría
 *   que la lista cambiara de forma entre dos cargas.
 * - **Escala y valoración** tienen además promedio. En valoración se muestra
 *   también el normalizado `(valor - 1) / (escala - 1)`, que es lo único
 *   comparable cuando el alcance mezcla una versión de 5 estrellas con otra de
 *   10. Con varias escalas a la vez el promedio en unidades originales
 *   desaparece a propósito: promediar un 4 sobre 5 con un 4 sobre 10 no
 *   significa nada.
 * - **Texto, correo y fecha** no se agregan. Se leen completos en la tabla de
 *   abajo, sin análisis de sentimiento ni de IA (exclusión explícita de PR.md).
 */

export interface PropsDistribuciones {
  readonly preguntas: readonly MetricaPregunta[];
}

export function Distribuciones({ preguntas }: PropsDistribuciones) {
  return (
    <section aria-labelledby="titulo-distribuciones" className="flex flex-col gap-3">
      <h2 id="titulo-distribuciones" className="text-lg font-semibold">
        Preguntas
      </h2>

      {preguntas.length === 0 ? (
        <p className="rounded-[var(--tp-radio-superficie)] border border-dashed border-[color:var(--tp-borde)] p-4 text-sm text-[color:var(--tp-texto-suave)]">
          Las versiones en el filtro no contienen ninguna pregunta.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {preguntas.map((pregunta) => (
            <li key={pregunta.questionId}>
              <TarjetaPregunta pregunta={pregunta} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TarjetaPregunta({ pregunta }: { readonly pregunta: MetricaPregunta }) {
  const total = (pregunta.distribucion ?? []).reduce((suma, valor) => suma + valor.recuento, 0);
  const maximo = (pregunta.distribucion ?? []).reduce(
    (mayor, valor) => Math.max(mayor, valor.recuento),
    0,
  );

  return (
    <article
      data-pregunta={pregunta.questionId}
      className="rounded-[var(--tp-radio-superficie)] border border-[color:var(--tp-borde)] bg-[var(--tp-superficie)] p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-medium">{pregunta.titulo}</h3>
        <span className="text-xs text-[color:var(--tp-texto-suave)]">
          {ETIQUETA_TIPO_PREGUNTA[pregunta.tipo]}
          {pregunta.tiposMixtos ? ' · el tipo cambió entre versiones' : ''}
        </span>
      </header>

      <p className="mt-1 text-sm text-[color:var(--tp-texto-suave)]">
        {entero(pregunta.respondidas)} respondidas · {entero(pregunta.enBlanco)} en blanco
        {pregunta.descartadas > 0
          ? ` · ${entero(pregunta.descartadas)} de versiones que no tenían esta pregunta`
          : ''}
      </p>

      <Promedios pregunta={pregunta} />

      {pregunta.distribucion === null ? (
        <p className="mt-3 text-sm text-[color:var(--tp-texto-suave)]">
          Las respuestas de este tipo se leen completas en la tabla de respuestas.
        </p>
      ) : pregunta.distribucion.length === 0 ? (
        <p className="mt-3 text-sm text-[color:var(--tp-texto-suave)]">
          Todavía no hay valores que distribuir.
        </p>
      ) : (
        <dl className="mt-3 flex flex-col gap-2">
          {pregunta.distribucion.map((valor) => (
            <div key={valor.valor} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
              <dt className="text-sm">{valor.etiqueta}</dt>
              <dd className="text-sm tabular-nums text-[color:var(--tp-texto-suave)]">
                {entero(valor.recuento)}
                {total > 0 ? ` · ${porcentaje(valor.recuento / total)}` : ''}
              </dd>
              <dd
                aria-hidden="true"
                className="col-span-2 h-2 w-full overflow-hidden rounded-full bg-[var(--tp-progreso-fondo)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--tp-acento)]"
                  style={{ width: anchuraDeBarra(valor.recuento, maximo) }}
                />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

/** Promedios de escala y valoración. No se pinta nada para el resto de tipos. */
function Promedios({ pregunta }: { readonly pregunta: MetricaPregunta }) {
  const esNumerica = pregunta.tipo === 'scale' || pregunta.tipo === 'rating';
  if (!esNumerica) return null;

  const variasEscalas = pregunta.escalas.length > 1;

  return (
    <p className="mt-2 text-sm">
      <span className="font-medium">Promedio: </span>
      <span className="tabular-nums">{decimal(pregunta.promedio)}</span>
      {pregunta.tipo === 'rating' ? (
        <>
          <span className="font-medium"> · Normalizado: </span>
          <span className="tabular-nums">{decimal(pregunta.promedioNormalizado)}</span>
          {variasEscalas ? (
            <span className="text-[color:var(--tp-texto-suave)]">
              {' '}
              · escalas mezcladas ({pregunta.escalas.map((escala) => String(escala)).join(', ')}
              ): solo el normalizado es comparable.
            </span>
          ) : null}
        </>
      ) : null}
    </p>
  );
}
