'use client';

import { AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { Boton } from '@/components/ui/boton';
import { cn } from '@/components/ui/cn';

/**
 * Aviso persistente del panel: es lo que hace que un fallo se **vea**.
 *
 * Un error se anuncia con `role="alert"` para que el lector de pantalla lo lea
 * en cuanto aparece, sin esperar a que el foco pase por encima. La acción de
 * reintentar es opcional y va dentro del propio aviso, no en otro rincón de la
 * pantalla: quien lo lee ya tiene ahí la salida.
 */
export interface PropsAviso {
  readonly tono?: 'error' | 'informacion';
  readonly titulo: string;
  readonly children?: ReactNode;
  /** Texto y acción del botón de recuperación. Sin él no se pinta ningún botón. */
  readonly etiquetaAccion?: string;
  readonly onAccion?: () => void;
  readonly className?: string;
}

export function Aviso({
  tono = 'error',
  titulo,
  children,
  etiquetaAccion,
  onAccion,
  className,
}: PropsAviso) {
  const esError = tono === 'error';
  const Icono = esError ? AlertTriangle : Info;

  return (
    <div
      role={esError ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-3 rounded-[var(--tp-radio-superficie)] border p-4 text-sm sm:flex-row sm:items-start',
        esError
          ? 'border-[color:var(--tp-error)] bg-[var(--tp-error-suave)]'
          : 'border-[color:var(--tp-borde)] bg-[var(--tp-superficie)]',
        className,
      )}
    >
      <Icono
        aria-hidden="true"
        className={cn('mt-0.5 size-5 shrink-0', esError && 'text-[color:var(--tp-error)]')}
      />
      <div className="flex-1">
        <p className="font-medium">{titulo}</p>
        {children === undefined ? null : (
          <div className="mt-1 text-[color:var(--tp-texto-suave)]">{children}</div>
        )}
      </div>
      {etiquetaAccion !== undefined && onAccion !== undefined ? (
        <Boton tamano="sm" estiloTema="outline" onClick={onAccion} className="self-start">
          {etiquetaAccion}
        </Boton>
      ) : null}
    </div>
  );
}
