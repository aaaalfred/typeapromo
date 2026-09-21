import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases condicionales y resuelve los conflictos de Tailwind quedándose
 * con la última. Sin esto, `cn('p-4', props.className)` no permitiría a quien
 * usa el componente cambiar el relleno desde fuera.
 */
export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases));
}
