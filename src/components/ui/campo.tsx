'use client';

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from './cn';

/**
 * Controles de texto del renderer.
 *
 * Comparten superficie, borde y anillo de foco con el resto de controles para
 * que un cambio de tema los mueva a todos a la vez.
 */
const CLASES_CAMPO = [
  'tp-foco w-full bg-[var(--tp-control-fondo)] text-[color:var(--tp-texto)]',
  'border border-[color:var(--tp-borde)] rounded-[var(--tp-radio-superficie)]',
  'px-4 py-3 text-[1.0625em] leading-normal',
  'placeholder:text-[color:var(--tp-texto-suave)] placeholder:opacity-70',
  'transition-colors duration-150',
  'aria-[invalid=true]:border-[color:var(--tp-error)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
];

export type PropsCampoTexto = InputHTMLAttributes<HTMLInputElement>;

export const CampoTexto = forwardRef<HTMLInputElement, PropsCampoTexto>(function CampoTexto(
  { className, type = 'text', ...resto },
  ref,
) {
  return <input {...resto} ref={ref} type={type} className={cn(CLASES_CAMPO, className)} />;
});

export type PropsAreaTexto = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const AreaTexto = forwardRef<HTMLTextAreaElement, PropsAreaTexto>(function AreaTexto(
  { className, ...resto },
  ref,
) {
  return <textarea {...resto} ref={ref} className={cn(CLASES_CAMPO, 'resize-y', className)} />;
});
