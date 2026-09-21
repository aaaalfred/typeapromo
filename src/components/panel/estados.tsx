'use client';

import { FileText, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Estados de la lista que no son «aquí van las filas».
 *
 * Los tres —cargando, vacío y sin resultados— se pintan de verdad. Devolver
 * `null` cuando no hay datos deja una pantalla en blanco imposible de
 * distinguir de un fallo, y es justo el momento en el que hace falta decir algo.
 */

/** Esqueleto de carga. Anunciado para que no sea un cambio silencioso. */
export function EsqueletoListado({ filas = 3 }: { readonly filas?: number }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando formularios…</span>
      {Array.from({ length: filas }, (_valor, indice) => (
        <div
          key={indice}
          aria-hidden="true"
          className="h-28 animate-pulse rounded-[var(--tp-radio-superficie)] border border-[color:var(--tp-borde)] bg-[var(--tp-control-fondo)]"
        />
      ))}
    </div>
  );
}

export interface PropsEstadoVacio {
  readonly titulo: string;
  readonly descripcion: string;
  readonly variante?: 'sin-formularios' | 'sin-resultados';
  readonly children?: ReactNode;
}

export function EstadoVacio({
  titulo,
  descripcion,
  variante = 'sin-formularios',
  children,
}: PropsEstadoVacio) {
  const Icono = variante === 'sin-resultados' ? SearchX : FileText;

  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--tp-radio-superficie)] border border-dashed border-[color:var(--tp-borde)] px-6 py-14 text-center">
      <Icono aria-hidden="true" className="size-8 text-[color:var(--tp-texto-suave)]" />
      <h3 className="text-base font-semibold">{titulo}</h3>
      <p className="max-w-md text-sm text-[color:var(--tp-texto-suave)]">{descripcion}</p>
      {children}
    </div>
  );
}
