/**
 * Resolución de los activos de una versión publicada.
 *
 * El renderer no sabe de dónde sale la URL de una imagen: recibe una función
 * (`ResolverMedia`). En la experiencia pública el mapa se calcula **en el
 * servidor**, al pintar la página, y viaja ya resuelto al cliente. Así el
 * navegador nunca pide activos por identificador y no hace falta un endpoint
 * público que traduzca identificadores a URL.
 *
 * **Nunca lanza.** Si el almacenamiento no está configurado —o falla— se
 * devuelve un mapa vacío: un formulario sin logo se sigue pudiendo responder, y
 * caerse entero por una imagen sería el peor intercambio posible.
 */

import type { MediaResuelta } from '@/components/formulario';
import type { FormDefinition } from '@/lib/forms';
import { collectAssetIds, isUuid } from '@/server/forms/media-refs';

/** Mapa serializable de `mediaAssetId` a activo pintable. */
export type MapaDeMedios = Readonly<Record<string, MediaResuelta>>;

/** Variante preferida: WebP de 1920 px de ancho, la mayor que genera el pipeline. */
const VARIANTE_PREFERIDA = 'w1920';

/**
 * Elige qué URL sirve para un activo listo: la variante grande si existe, y si
 * no el original procesado.
 */
function aMediaResuelta(activo: {
  readonly url: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly variantes: readonly {
    label: string;
    url: string;
    width: number;
    height: number;
  }[];
}): MediaResuelta | null {
  const preferida =
    activo.variantes.find((variante) => variante.label === VARIANTE_PREFERIDA) ??
    activo.variantes[0];

  if (preferida !== undefined) {
    return { url: preferida.url, ancho: preferida.width, alto: preferida.height };
  }
  if (activo.url === null) return null;

  return {
    url: activo.url,
    ...(activo.width === null ? {} : { ancho: activo.width }),
    ...(activo.height === null ? {} : { alto: activo.height }),
  };
}

/**
 * Resuelve todos los activos referenciados por un documento.
 *
 * `@/server/media` se importa de forma diferida: arrastra el SDK de S3 y
 * `sharp`, y no tiene sentido cargarlos para un formulario sin ni una imagen.
 */
export async function resolverMediosDeDocumento(
  definicion: FormDefinition,
): Promise<MapaDeMedios> {
  const identificadores = collectAssetIds(definicion).filter(isUuid);
  if (identificadores.length === 0) return {};

  try {
    const { obtenerActivos } = await import('@/server/media/consulta');
    const activos = await obtenerActivos(identificadores);

    const mapa: Record<string, MediaResuelta> = {};
    for (const activo of activos) {
      if (activo.status !== 'ready') continue;
      const resuelta = aMediaResuelta(activo);
      if (resuelta !== null) mapa[activo.id] = resuelta;
    }
    return mapa;
  } catch (error) {
    console.error('[/f] no se han podido resolver las imágenes del formulario', error);
    return {};
  }
}
