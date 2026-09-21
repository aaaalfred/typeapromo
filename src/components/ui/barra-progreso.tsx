'use client';

import { cn } from './cn';

/**
 * Barra de progreso.
 *
 * El valor no es «pregunta actual / total del documento» sino el recorrido
 * efectivo que calcula el motor: por eso admite `aproximado`, que marca los
 * casos en los que quedan bifurcaciones sin resolver y el total todavía puede
 * moverse (PLAN.md §2.7).
 */
export interface PropsBarraProgreso {
  /** Proporción completada, de 0 a 1. */
  readonly valor: number;
  /** `true` si el total es una estimación y puede cambiar al avanzar. */
  readonly aproximado?: boolean;
  readonly className?: string;
}

export function BarraProgreso({ valor, aproximado = false, className }: PropsBarraProgreso) {
  const porcentaje = Math.round(Math.min(1, Math.max(0, valor)) * 100);
  const texto = aproximado
    ? `${String(porcentaje)} % completado, aproximadamente`
    : `${String(porcentaje)} % completado`;

  return (
    <div
      role="progressbar"
      aria-label="Progreso del formulario"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={porcentaje}
      aria-valuetext={texto}
      className={cn('h-1 w-full overflow-hidden bg-[var(--tp-progreso-fondo)]', className)}
    >
      <div
        className="h-full bg-[var(--tp-acento)] transition-[width] duration-300 ease-out"
        style={{ width: `${String(porcentaje)}%` }}
      />
    </div>
  );
}
