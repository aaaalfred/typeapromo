/**
 * Procesado de imágenes con Sharp.
 *
 * Tres cosas y ninguna más: **quitar los metadatos**, **normalizar la
 * orientación** y **derivar WebP**. Sharp descarta EXIF, IPTC, XMP y el perfil
 * ICC salvo que se le pida `withMetadata()` explícitamente, cosa que aquí no se
 * hace nunca: la geolocalización de una foto no puede acabar en un bucket
 * público. `rotate()` sin argumentos aplica la orientación EXIF **antes** de
 * borrarla, para que la imagen publicada no salga tumbada.
 *
 * Defensa contra decompression bombs (PLAN.md · §2.8): `limitInputPixels` es la
 * **segunda** barrera. La primera está en `reglas.leerDimensiones`, que rechaza
 * por cabecera antes de llegar aquí. Sharp la mantiene por si el contenedor
 * miente sobre su propio tamaño.
 */

import sharp, { type SharpOptions } from 'sharp';

import type { MediaVariant } from '@/db/schema';

import {
  ANCHOS_VARIANTE,
  claveDeVariante,
  claveOriginalPublica,
  etiquetaDeVariante,
  type AnchoVariante,
} from './claves';
import { PIXELES_MAXIMOS, type Dimensiones } from './reglas';

/** Calidad de los WebP derivados. 82 es el punto habitual de corte visual. */
const CALIDAD_WEBP = 82;

/** MIME de todo lo que se publica. */
export const MIME_PUBLICADO = 'image/webp';

/** Objeto listo para subir al bucket público. */
export interface ObjetoProcesado {
  clave: string;
  etiqueta: string;
  cuerpo: Buffer;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
}

export interface ResultadoProcesado {
  /** Dimensiones reales del original según Sharp, ya con la rotación aplicada. */
  dimensiones: Dimensiones;
  /** Original recodificado a WebP sin metadatos. */
  original: ObjetoProcesado;
  /** Derivadas de 640 y 1920 px, en ese orden. */
  variantes: ObjetoProcesado[];
}

function opcionesDeEntrada(): SharpOptions {
  return {
    // Barrera dura del decodificador: por encima de esto Sharp lanza en vez de
    // reservar memoria.
    limitInputPixels: PIXELES_MAXIMOS,
    // Lectura secuencial: menos memoria residente con JPEG y PNG grandes.
    sequentialRead: true,
    failOn: 'error',
  };
}

/**
 * Recodifica el original y genera las variantes.
 *
 * `withoutEnlargement` evita ampliar: si el original mide 800 px, la variante
 * `w1920` sale a 800 px en lugar de interpolar píxeles que no existen. Las dos
 * etiquetas se publican siempre, aunque coincidan en tamaño, para que el cliente
 * pueda construir el `srcset` sin condicionales.
 */
export async function procesarImagen(
  assetId: string,
  sha256: string,
  bytes: Buffer,
): Promise<ResultadoProcesado> {
  // Las dimensiones que se guardan salen del búfer ya escrito, no de
  // `metadata()`: con `rotate()` aplicado, una foto vertical marcada con
  // orientación EXIF 6 tiene ancho y alto intercambiados respecto a la
  // cabecera, y lo que el editor necesita es la relación de aspecto real de lo
  // que se va a servir.
  const originalWebp = await sharp(bytes, opcionesDeEntrada())
    .rotate()
    .webp({ quality: CALIDAD_WEBP })
    .toBuffer({ resolveWithObject: true });

  const original: ObjetoProcesado = {
    clave: claveOriginalPublica(assetId, sha256),
    etiqueta: 'original',
    cuerpo: originalWebp.data,
    width: originalWebp.info.width,
    height: originalWebp.info.height,
    byteSize: originalWebp.data.byteLength,
    mimeType: MIME_PUBLICADO,
  };

  const variantes: ObjetoProcesado[] = [];
  for (const ancho of ANCHOS_VARIANTE) {
    variantes.push(await derivarVariante(assetId, sha256, bytes, ancho));
  }

  return {
    dimensiones: { width: originalWebp.info.width, height: originalWebp.info.height },
    original,
    variantes,
  };
}

async function derivarVariante(
  assetId: string,
  sha256: string,
  bytes: Buffer,
  ancho: AnchoVariante,
): Promise<ObjetoProcesado> {
  const salida = await sharp(bytes, opcionesDeEntrada())
    .rotate()
    .resize({ width: ancho, withoutEnlargement: true, fit: 'inside' })
    .webp({ quality: CALIDAD_WEBP })
    .toBuffer({ resolveWithObject: true });

  return {
    clave: claveDeVariante(assetId, sha256, ancho),
    etiqueta: etiquetaDeVariante(ancho),
    cuerpo: salida.data,
    width: salida.info.width,
    height: salida.info.height,
    byteSize: salida.data.byteLength,
    mimeType: MIME_PUBLICADO,
  };
}

/** Convierte una variante procesada a la forma que guarda `media_assets.variants`. */
export function aMediaVariant(objeto: ObjetoProcesado): MediaVariant {
  return {
    label: objeto.etiqueta,
    key: objeto.clave,
    width: objeto.width,
    height: objeto.height,
    byteSize: objeto.byteSize,
    mimeType: objeto.mimeType,
  };
}
