/**
 * Resolución de activos de media.
 *
 * El renderer nunca sabe **de dónde** sale la URL de una imagen: recibe una
 * función. Es una de las tres costuras que permiten que el mismo componente
 * sirva a la previsualización del editor (activos del borrador, algunos todavía
 * subiéndose) y a la experiencia pública (activos ya publicados en el bucket
 * público de R2), sin ninguna condición dentro del render.
 */

/** Activo resuelto y listo para pintar. */
export interface MediaResuelta {
  /** URL de lectura pública, o `blob:` mientras el editor previsualiza. */
  readonly url: string;
  /** Texto alternativo. Cadena vacía marca la imagen como decorativa. */
  readonly alt?: string;
  readonly ancho?: number;
  readonly alto?: number;
}

/** Traduce un `mediaAssetId` del documento a un activo pintable. */
export type ResolverMedia = (assetId: string) => MediaResuelta | null;

/**
 * Resolutor por defecto: no hay activos. Es lo correcto en tests y en cualquier
 * consumidor que aún no tenga el pipeline de media (fase 6) conectado.
 */
export const SIN_MEDIA: ResolverMedia = () => null;

/** Resuelve un identificador opcional sin obligar a comprobarlo en cada bloque. */
export function resolverOpcional(
  resolver: ResolverMedia,
  assetId: string | undefined,
): MediaResuelta | null {
  return assetId === undefined ? null : resolver(assetId);
}
