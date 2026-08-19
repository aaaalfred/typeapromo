'use client';

import { cn } from '@/components/ui/cn';

import { ETIQUETA_ESTADO, type EstadoFormulario } from './tipos';

/**
 * Distintivo de estado.
 *
 * El color acompaña, pero no es el único portador de la información: la etiqueta
 * siempre lleva su texto («Borrador», «Publicado»…), de modo que funciona igual
 * en escala de grises y para quien no distinga los tonos.
 */
const CLASES_POR_ESTADO: Readonly<Record<EstadoFormulario, string>> = {
  draft: 'border-[color:var(--tp-borde)] text-[color:var(--tp-texto-suave)]',
  published: 'border-[color:var(--tp-exito)] text-[color:var(--tp-exito)]',
  closed: 'border-[color:var(--tp-borde)] text-[color:var(--tp-texto)]',
  archived: 'border-[color:var(--tp-borde)] text-[color:var(--tp-texto-suave)] opacity-80',
};

export interface PropsEtiquetaEstado {
  readonly estado: EstadoFormulario;
  readonly className?: string;
}

export function EtiquetaEstado({ estado, className }: PropsEtiquetaEstado) {
  return (
    <span
      data-estado={estado}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        CLASES_POR_ESTADO[estado],
        className,
      )}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}
