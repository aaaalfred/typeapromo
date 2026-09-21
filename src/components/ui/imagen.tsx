'use client';

import type { ImgHTMLAttributes } from 'react';

import { cn } from './cn';

/**
 * Imagen de un activo de media.
 *
 * Es un `<img>` deliberado y no `next/image`: las URLs llegan del bucket público
 * de R2, son remotas, impredecibles y ya vienen redimensionadas por el pipeline
 * (WebP de 640 y 1920 px), de modo que el optimizador de Next no aportaría nada
 * y obligaría a declarar dominios remotos en la configuración.
 *
 * Concentrar el elemento aquí permite además que la excepción de lint viva en un
 * único fichero en lugar de repartida por todo el renderer.
 */
export interface PropsImagen extends ImgHTMLAttributes<HTMLImageElement> {
  readonly src: string;
  /** Texto alternativo. Cadena vacía marca la imagen como decorativa. */
  readonly alt: string;
}

export function Imagen({ className, alt, loading = 'lazy', ...resto }: PropsImagen) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...resto}
      alt={alt}
      loading={loading}
      decoding="async"
      className={cn('block max-w-full object-cover', className)}
    />
  );
}
