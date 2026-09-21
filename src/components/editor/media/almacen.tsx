'use client';

/**
 * Estado de los activos que el editor tiene entre manos.
 *
 * Resuelve tres necesidades que no se pueden separar sin duplicar peticiones:
 *
 * - **Precarga**: al abrir el editor, el documento ya referencia imágenes. Se
 *   piden todas de una vez, porque la previsualización pinta el bloque que el
 *   usuario seleccione, no solo aquel cuyo panel esté abierto.
 * - **Subida**: un único sitio que conoce los tres pasos del pipeline.
 * - **Resolución**: `resolverMedia` es la costura que el renderer ya define; el
 *   editor se limita a rellenarla con lo que hay aquí.
 *
 * Una decisión que conviene entender: el documento **solo** recibe el
 * identificador cuando el activo está `ready`. Mientras sube, la vista previa
 * vive en el propio selector con una URL `blob:`. Así el borrador nunca
 * referencia una imagen a medias, que es lo que acabaría guardado si el usuario
 * cierra la pestaña a mitad de una subida.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { MediaResuelta, ResolverMedia } from '@/components/formulario';
import { collectAssetIds, type FormDefinition } from '@/lib/forms';

import {
  completarSubida,
  crearIntento,
  obtenerActivo,
  subirBytes,
  ErrorMedia,
  type ActivoVista,
} from './cliente';

export type EstadoActivo =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'listo'; readonly activo: ActivoVista }
  | { readonly fase: 'error'; readonly mensaje: string };

export interface ProgresoSubida {
  /** 0 a 1 mientras viajan los bytes. */
  readonly fraccion: number;
  /** `true` cuando los bytes ya están y el servidor procesa con Sharp. */
  readonly procesando: boolean;
}

export interface AlmacenMedia {
  readonly entradas: ReadonlyMap<string, EstadoActivo>;
  /** Sube un archivo y devuelve el identificador solo si acaba en `ready`. */
  readonly subir: (
    archivo: File,
    alProgresar: (progreso: ProgresoSubida) => void,
    senal?: AbortSignal,
  ) => Promise<ActivoVista>;
  /** Pide un activo que todavía no esté en el almacén. */
  readonly asegurar: (assetId: string) => void;
  readonly resolverMedia: ResolverMedia;
}

const ContextoAlmacen = createContext<AlmacenMedia | null>(null);

export function useAlmacenMedia(): AlmacenMedia {
  const almacen = useContext(ContextoAlmacen);
  if (almacen === null) {
    throw new Error('useAlmacenMedia necesita un <ProveedorAlmacenMedia> por encima.');
  }
  return almacen;
}

/** Convierte un activo publicado en algo que el renderer pueda pintar. */
function aMediaResuelta(activo: ActivoVista): MediaResuelta | null {
  if (activo.url === null) return null;
  return {
    url: activo.url,
    ...(activo.width === null ? {} : { ancho: activo.width }),
    ...(activo.height === null ? {} : { alto: activo.height }),
  };
}

export interface PropsProveedorAlmacenMedia {
  /** Documento de partida: de aquí salen los activos que hay que precargar. */
  readonly definicionInicial: FormDefinition;
  readonly children: ReactNode;
}

export function ProveedorAlmacenMedia({
  definicionInicial,
  children,
}: PropsProveedorAlmacenMedia) {
  const [entradas, setEntradas] = useState<ReadonlyMap<string, EstadoActivo>>(new Map());

  // Identificadores ya pedidos. En una ref y no en el estado: sirve para no
  // repetir peticiones, y meterlo en el estado provocaría un render por cada
  // una sin cambiar nada de lo que se ve.
  const pedidos = useRef<Set<string>>(new Set());

  const escribir = useCallback((assetId: string, estado: EstadoActivo) => {
    setEntradas((previo) => {
      const siguiente = new Map(previo);
      siguiente.set(assetId, estado);
      return siguiente;
    });
  }, []);

  const cargar = useCallback(
    async (assetId: string): Promise<void> => {
      escribir(assetId, { fase: 'cargando' });
      try {
        escribir(assetId, { fase: 'listo', activo: await obtenerActivo(assetId) });
      } catch (error) {
        escribir(assetId, {
          fase: 'error',
          mensaje:
            error instanceof ErrorMedia
              ? error.message
              : 'No se ha podido cargar la imagen.',
        });
      }
    },
    [escribir],
  );

  const asegurar = useCallback(
    (assetId: string): void => {
      if (pedidos.current.has(assetId)) return;
      pedidos.current.add(assetId);
      void cargar(assetId);
    },
    [cargar],
  );

  // Precarga inicial. Depende del documento **de partida**, no del actual: lo
  // que se añada después entra por `subir`, que ya deja el activo en el almacén.
  useEffect(() => {
    for (const assetId of collectAssetIds(definicionInicial)) {
      asegurar(assetId);
    }
  }, [definicionInicial, asegurar]);

  const subir = useCallback(
    async (
      archivo: File,
      alProgresar: (progreso: ProgresoSubida) => void,
      senal?: AbortSignal,
    ): Promise<ActivoVista> => {
      const { asset, upload } = await crearIntento(archivo);

      alProgresar({ fraccion: 0, procesando: false });
      await subirBytes(
        upload,
        archivo,
        (fraccion) => {
          alProgresar({ fraccion, procesando: false });
        },
        senal,
      );

      // Sharp puede tardar en una imagen grande; sin este aviso la barra se
      // queda al 100 % y parece que se ha quedado colgada.
      alProgresar({ fraccion: 1, procesando: true });
      const listo = await completarSubida(asset.id);

      pedidos.current.add(listo.id);
      escribir(listo.id, { fase: 'listo', activo: listo });
      return listo;
    },
    [escribir],
  );

  const resolverMedia = useMemo<ResolverMedia>(() => {
    return (assetId: string) => {
      const entrada = entradas.get(assetId);
      if (entrada === undefined || entrada.fase !== 'listo') return null;
      return aMediaResuelta(entrada.activo);
    };
  }, [entradas]);

  const valor = useMemo<AlmacenMedia>(
    () => ({ entradas, subir, asegurar, resolverMedia }),
    [entradas, subir, asegurar, resolverMedia],
  );

  return <ContextoAlmacen.Provider value={valor}>{children}</ContextoAlmacen.Provider>;
}
