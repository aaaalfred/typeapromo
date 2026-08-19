/**
 * Proyección de un activo hacia el cliente.
 *
 * Lo que sale por la API son **URL públicas**, no claves de bucket: el editor no
 * necesita saber cómo se nombra un objeto y publicarlo ataría el formato de
 * clave al contrato de la API. Tampoco sale `staging_key`, que es una ruta de un
 * bucket privado.
 */

import type { MediaAsset } from '@/db/schema';
import type { AlmacenObjetos } from '@/lib/storage';

export interface VarianteVista {
  label: string;
  url: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
}

export interface ActivoVista {
  id: string;
  status: MediaAsset['status'];
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string | null;
  originalFilename: string | null;
  failureReason: string | null;
  /** URL del original procesado. `null` mientras el activo no está `ready`. */
  url: string | null;
  variantes: VarianteVista[];
  createdAt: string;
  readyAt: string | null;
}

export function aVista(asset: MediaAsset, almacen: AlmacenObjetos): ActivoVista {
  return {
    id: asset.id,
    status: asset.status,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    sha256: asset.sha256,
    originalFilename: asset.originalFilename,
    failureReason: asset.failureReason,
    url: asset.publicKey === null ? null : almacen.urlPublica(asset.publicKey),
    variantes: asset.variants.map((variante) => ({
      label: variante.label,
      url: almacen.urlPublica(variante.key),
      width: variante.width,
      height: variante.height,
      byteSize: variante.byteSize,
      mimeType: variante.mimeType,
    })),
    createdAt: asset.createdAt.toISOString(),
    readyAt: asset.readyAt === null ? null : asset.readyAt.toISOString(),
  };
}
