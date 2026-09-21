'use client';

import { anchuraDeBarra, entero, porcentaje } from './formato';
import type { AbandonoPregunta } from './tipos';

/**
 * Abandono por pregunta: en qué pantalla se quedó cada sesión abandonada.
 *
 * La barra es decorativa (`aria-hidden`): la cifra y el porcentaje van escritos
 * al lado, así que quien no ve la barra no pierde ningún dato. El máximo se
 * toma de la fila más alta, no del total, porque comparar entre sí las pantallas
 * es justo lo que se viene a hacer aquí.
 */

export interface PropsAbandonoPreguntas {
  readonly filas: readonly AbandonoPregunta[];
}

export function AbandonoPreguntas({ filas }: PropsAbandonoPreguntas) {
  const maximo = filas.reduce((mayor, fila) => Math.max(mayor, fila.abandonos), 0);

  return (
    <section aria-labelledby="titulo-abandono" className="flex flex-col gap-3">
      <div>
        <h2 id="titulo-abandono" className="text-lg font-semibold">
          Abandono por pregunta
        </h2>
        <p className="mt-1 text-sm text-[color:var(--tp-texto-suave)]">
          Última pantalla de las sesiones sin terminar y sin actividad desde hace más de 30
          minutos.
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="rounded-[var(--tp-radio-superficie)] border border-dashed border-[color:var(--tp-borde)] p-4 text-sm text-[color:var(--tp-texto-suave)]">
          Ninguna sesión abandonada con estos filtros.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filas.map((fila) => (
            <li
              key={fila.questionId === '' ? 'sin-pantalla' : fila.questionId}
              className="rounded-[var(--tp-radio-superficie)] border border-[color:var(--tp-borde)] bg-[var(--tp-superficie)] p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{fila.titulo}</span>
                <span className="text-sm tabular-nums text-[color:var(--tp-texto-suave)]">
                  {entero(fila.abandonos)} · {porcentaje(fila.porcentaje)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--tp-progreso-fondo)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--tp-acento)]"
                  style={{ width: anchuraDeBarra(fila.abandonos, maximo) }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
