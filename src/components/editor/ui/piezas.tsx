'use client';

/**
 * Piezas de estructura del chrome del editor: botones, secciones y avisos.
 *
 * El botón del editor **no** es `components/ui/boton`. Aquel se pinta con las
 * variables `--tp-*`, que solo existen dentro del elemento raíz del renderer;
 * fuera de él quedaría sin fondo. Que sean dos componentes distintos es
 * intencionado: uno pertenece al formulario del usuario y el otro a la
 * aplicación.
 */

import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cn } from '@/components/ui/cn';
import type { Aviso } from '@/lib/editor';

/* -------------------------------------------------------------------------- */
/* Botón                                                                       */
/* -------------------------------------------------------------------------- */

const VARIANTES_BOTON = {
  principal:
    'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700',
  secundario:
    'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800',
  discreto:
    'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white',
  peligro:
    'text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50',
} as const;

export type VarianteBoton = keyof typeof VARIANTES_BOTON;

export interface PropsBotonEditor extends ComponentPropsWithRef<'button'> {
  readonly variante?: VarianteBoton;
  readonly tamano?: 'sm' | 'md';
}

export function BotonEditor({
  variante = 'secundario',
  tamano = 'md',
  className,
  type = 'button',
  ...resto
}: PropsBotonEditor) {
  return (
    <button
      {...resto}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
        'disabled:cursor-not-allowed disabled:opacity-60',
        tamano === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        VARIANTES_BOTON[variante],
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Sección                                                                     */
/* -------------------------------------------------------------------------- */

export interface PropsSeccion {
  readonly titulo: string;
  readonly descripcion?: string;
  readonly acciones?: ReactNode;
  readonly children: ReactNode;
}

export function Seccion({ titulo, descripcion, acciones, children }: PropsSeccion) {
  return (
    <section className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-4 last:border-b-0 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{titulo}</h3>
          {descripcion === undefined ? null : (
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{descripcion}</p>
          )}
        </div>
        {acciones}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Avisos                                                                      */
/* -------------------------------------------------------------------------- */

const TONOS = {
  error: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
  advertencia:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  informacion:
    'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
} as const;

export type TonoAviso = keyof typeof TONOS;

export interface PropsCajaAviso {
  readonly tono: TonoAviso;
  readonly children: ReactNode;
  readonly className?: string;
}

export function CajaAviso({ tono, children, className }: PropsCajaAviso) {
  return (
    <div
      role={tono === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border px-3 py-2 text-xs leading-relaxed', TONOS[tono], className)}
    >
      {children}
    </div>
  );
}

/**
 * Lista de avisos del validador de publicación.
 *
 * Se pinta tal cual junto al elemento afectado: los mensajes ya vienen
 * redactados en español desde `lib/forms/validate.ts` y reescribirlos aquí
 * abriría la puerta a que el editor dijera una cosa y la publicación otra.
 */
export function ListaDeAvisos({ avisos }: { readonly avisos: readonly Aviso[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="flex list-none flex-col gap-1.5">
      {avisos.map((aviso, indice) => (
        <li key={`${aviso.codigo}-${String(indice)}`}>
          <CajaAviso tono={aviso.gravedad === 'error' ? 'error' : 'advertencia'}>
            {aviso.mensaje}
          </CajaAviso>
        </li>
      ))}
    </ul>
  );
}
