'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import type { ButtonStyle } from '@/lib/forms';

import { cn } from './cn';

/**
 * Botón del renderer.
 *
 * Las cuatro apariencias corresponden a `ThemeDefinition.buttonStyle`; la quinta
 * (`discreto`) es la acción secundaria — «Atrás» — y no depende del tema porque
 * nunca debe competir visualmente con la acción principal.
 *
 * Ningún color está escrito aquí: todos salen de las variables `--tp-*`.
 */
export const variantesBoton = cva(
  [
    'tp-foco inline-flex items-center justify-center gap-2 font-medium',
    'transition-[opacity,background-color,color,border-color] duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'select-none',
  ],
  {
    variants: {
      apariencia: {
        solid: [
          'bg-[var(--tp-boton)] text-[color:var(--tp-boton-texto)]',
          'rounded-[var(--tp-radio)] hover:opacity-90',
        ],
        outline: [
          'border-2 border-[color:var(--tp-boton)] bg-transparent text-[color:var(--tp-boton)]',
          'rounded-[var(--tp-radio)] hover:bg-[var(--tp-acento-suave)]',
        ],
        ghost: [
          'bg-transparent text-[color:var(--tp-boton)]',
          'rounded-[var(--tp-radio)] hover:bg-[var(--tp-acento-suave)]',
        ],
        pill: [
          'bg-[var(--tp-boton)] text-[color:var(--tp-boton-texto)]',
          'rounded-full hover:opacity-90',
        ],
        discreto: [
          'bg-transparent text-[color:var(--tp-texto-suave)]',
          'rounded-[var(--tp-radio)] hover:text-[color:var(--tp-texto)]',
        ],
      },
      tamano: {
        sm: 'px-3 py-1.5 text-[0.875em]',
        md: 'px-5 py-2.5 text-[1em]',
        lg: 'px-6 py-3 text-[1.0625em]',
      },
    },
    defaultVariants: { apariencia: 'solid', tamano: 'md' },
  },
);

export type AparienciaBoton = NonNullable<VariantProps<typeof variantesBoton>['apariencia']>;

export interface PropsBoton
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>,
    Pick<VariantProps<typeof variantesBoton>, 'tamano'> {
  /** Estilo de botón del tema. Se ignora cuando la jerarquía es secundaria. */
  readonly estiloTema?: ButtonStyle;
  readonly jerarquia?: 'principal' | 'secundaria';
  /** Muestra un indicador y deshabilita el botón. */
  readonly cargando?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

export const Boton = forwardRef<HTMLButtonElement, PropsBoton>(function Boton(
  {
    estiloTema = 'solid',
    jerarquia = 'principal',
    tamano,
    cargando = false,
    className,
    children,
    disabled,
    type = 'button',
    ...resto
  },
  ref,
) {
  const apariencia: AparienciaBoton = jerarquia === 'secundaria' ? 'discreto' : estiloTema;

  return (
    <button
      {...resto}
      ref={ref}
      type={type}
      disabled={disabled === true || cargando}
      aria-busy={cargando || undefined}
      className={cn(variantesBoton({ apariencia, tamano }), className)}
    >
      {cargando ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
});
