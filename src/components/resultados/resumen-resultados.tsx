'use client';

import { decimal, entero, porcentaje } from './formato';
import type { ResumenSesiones } from './tipos';

/**
 * Resumen de participación.
 *
 * Las cuatro cifras y la tasa se pintan como una lista de descripciones y no
 * como una rejilla de `<div>`: cada número tiene un nombre asociado en el árbol
 * de accesibilidad, así que un lector de pantalla lee «Completadas, 31» en vez
 * de un 31 suelto.
 *
 * «Abandonadas» lleva siempre su definición al lado. No es una columna de la
 * base de datos: es una consulta —sin fecha de finalización y con más de 30
 * minutos sin actividad— y una sesión puede salir de ese conjunto si quien
 * respondía vuelve a la pestaña.
 */

export interface PropsResumenResultados {
  readonly resumen: ResumenSesiones;
}

interface Cifra {
  readonly clave: string;
  readonly etiqueta: string;
  readonly valor: string;
  readonly detalle?: string;
}

export function ResumenResultados({ resumen }: PropsResumenResultados) {
  const cifras: readonly Cifra[] = [
    {
      clave: 'iniciadas',
      etiqueta: 'Sesiones iniciadas',
      valor: entero(resumen.iniciadas),
    },
    {
      clave: 'completadas',
      etiqueta: 'Completadas',
      valor: entero(resumen.completadas),
    },
    {
      clave: 'abandonadas',
      etiqueta: 'Abandonadas',
      valor: entero(resumen.abandonadas),
      detalle: 'Sin terminar y sin actividad desde hace más de 30 minutos.',
    },
    {
      clave: 'en-curso',
      etiqueta: 'En curso',
      valor: entero(resumen.enCurso),
      detalle: 'Sin terminar, pero con actividad reciente.',
    },
    {
      clave: 'tasa',
      etiqueta: 'Tasa de finalización',
      valor: porcentaje(resumen.tasaFinalizacion),
      detalle:
        resumen.iniciadas === 0
          ? 'Todavía no hay sesiones que medir.'
          : `${entero(resumen.completadas)} de ${entero(resumen.iniciadas)} · ${decimal(
              resumen.tasaFinalizacion,
            )} en proporción.`,
    },
  ];

  return (
    <section aria-labelledby="titulo-resumen-resultados" className="flex flex-col gap-3">
      <h2 id="titulo-resumen-resultados" className="text-lg font-semibold">
        Resumen
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cifras.map((cifra) => (
          <div
            key={cifra.clave}
            data-cifra={cifra.clave}
            className="rounded-[var(--tp-radio-superficie)] border border-[color:var(--tp-borde)] bg-[var(--tp-superficie)] p-4"
          >
            <dt className="text-sm text-[color:var(--tp-texto-suave)]">{cifra.etiqueta}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{cifra.valor}</dd>
            {cifra.detalle === undefined ? null : (
              <dd className="mt-1 text-xs text-[color:var(--tp-texto-suave)]">{cifra.detalle}</dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
