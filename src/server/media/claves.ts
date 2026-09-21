/**
 * Construcción de claves de objeto. **Lógica pura**, sin base de datos ni SDK.
 *
 * PR.md exige dos propiedades distintas y hay que no confundirlas:
 *
 * - **Impredecibles.** Un tercero no debe poder adivinar la URL de una imagen a
 *   partir del formulario, del nombre del archivo ni de la fecha. El prefijo es
 *   el UUID del activo, que PostgreSQL genera con `gen_random_uuid()`; en
 *   staging se le añade además un sufijo aleatorio, porque esa clave se firma y
 *   se entrega al navegador antes de que el objeto exista.
 * - **Inmutables.** El segundo tramo es el prefijo del SHA-256 del original, así
 *   que unos bytes distintos producen otra clave. Eso es lo que hace correcto
 *   servir el bucket público con `Cache-Control: immutable`: una imagen editada
 *   nunca reutiliza la clave de la anterior.
 *
 * El nombre original del archivo **no entra jamás** en la clave: llega del
 * cliente y traería acentos, barras y `../`.
 */

import { randomBytes } from 'node:crypto';

/** Etiquetas de las variantes derivadas. Se publican siempre las dos. */
export const ANCHOS_VARIANTE = [640, 1920] as const;
export type AnchoVariante = (typeof ANCHOS_VARIANTE)[number];

/** Etiqueta de la variante, tal y como se guarda en `media_assets.variants`. */
export function etiquetaDeVariante(ancho: AnchoVariante): string {
  return `w${ancho}`;
}

/** Prefijo del hash que entra en la clave. 16 hex = 64 bits: sobra. */
const LONGITUD_HASH_EN_CLAVE = 16;

/** Prefijo de todas las claves del bucket público. */
const PREFIJO_PUBLICO = 'media';

/** Prefijo de todas las claves del bucket privado. */
const PREFIJO_STAGING = 'staging';

/**
 * Clave temporal en el bucket privado.
 *
 * El sufijo aleatorio evita que conocer el identificador del activo baste para
 * escribir sobre su objeto de staging, y hace que reintentar una carga fallida
 * nunca choque con los bytes de la anterior.
 */
export function claveDeStaging(assetId: string, aleatorio?: string): string {
  const sufijo = aleatorio ?? randomBytes(12).toString('hex');
  return `${PREFIJO_STAGING}/${assetId}/${sufijo}`;
}

/** Prefijo común de todas las claves públicas de un activo. */
export function prefijoPublico(assetId: string, sha256: string): string {
  return `${PREFIJO_PUBLICO}/${assetId}/${sha256.slice(0, LONGITUD_HASH_EN_CLAVE)}`;
}

/** Clave del original ya procesado (WebP a tamaño completo, sin EXIF). */
export function claveOriginalPublica(assetId: string, sha256: string): string {
  return `${prefijoPublico(assetId, sha256)}/original.webp`;
}

/** Clave de una variante derivada. */
export function claveDeVariante(
  assetId: string,
  sha256: string,
  ancho: AnchoVariante,
): string {
  return `${prefijoPublico(assetId, sha256)}/${etiquetaDeVariante(ancho)}.webp`;
}

/**
 * Todas las claves públicas de un activo. Es lo que hay que borrar para no
 * dejar objetos huérfanos cuando el activo se elimina o el procesado falla a
 * mitad.
 */
export function clavesPublicas(assetId: string, sha256: string): string[] {
  return [
    claveOriginalPublica(assetId, sha256),
    ...ANCHOS_VARIANTE.map((ancho) => claveDeVariante(assetId, sha256, ancho)),
  ];
}
