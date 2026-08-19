'use client';

/**
 * Selector de imagen del editor: subir, ver, reemplazar y quitar.
 *
 * Sustituye al selector de reserva que pedía pegar un identificador a mano.
 * Cumple el contrato `PropsSelectorMedia`, así que se enchufa sin tocar ni el
 * panel de propiedades ni el de tema.
 *
 * Tres decisiones que conviene conocer:
 *
 * 1. **El documento solo recibe el identificador cuando el activo está
 *    `ready`.** Durante la subida la vista previa sale de una URL `blob:` que
 *    vive aquí. Si el usuario cierra la pestaña a media subida, el borrador no
 *    se queda apuntando a una imagen que no existe.
 *
 * 2. **«Quitar» desengancha, no borra.** El borrado físico lo gobierna
 *    `media_asset_refs`: una imagen que use una versión publicada no se puede
 *    borrar mientras esa versión exista, y el `DELETE` responde `409` con razón.
 *    Lo que retira los activos sin ninguna referencia es el cron de limpieza,
 *    tras siete días. Poner aquí un botón de borrar sería poner un botón que a
 *    veces falla por diseño.
 *
 * 3. **La validación previa no sustituye a la del servidor**, que decide con la
 *    firma binaria de los bytes ya subidos. Esta solo evita el viaje cuando el
 *    archivo ni siquiera dice ser admisible.
 */

import { ImageUp, Loader2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

// `reglas` es lógica pura y sin dependencias: se importa para no mantener dos
// versiones de los límites de producto, una en el servidor y otra aquí.
import { MIMES_ADMITIDOS, TAMANO_MAXIMO_BYTES, formatearMegas } from '@/server/media/reglas';

import type { PropsSelectorMedia } from '../contexto-media';
import { BotonEditor } from '../ui/piezas';

import { useAlmacenMedia, type ProgresoSubida } from './almacen';
import { ErrorMedia } from './cliente';

const ACEPTADOS = MIMES_ADMITIDOS.join(',');

type Fase =
  | { readonly tipo: 'reposo' }
  | { readonly tipo: 'subiendo'; readonly progreso: ProgresoSubida }
  | { readonly tipo: 'error'; readonly mensaje: string };

/** Comprobación barata en el cliente; la que manda es la del servidor. */
function motivoDeRechazo(archivo: File): string | null {
  if (!(MIMES_ADMITIDOS as readonly string[]).includes(archivo.type)) {
    return 'Solo se admiten imágenes JPEG, PNG o WebP.';
  }
  if (archivo.size === 0) return 'El archivo está vacío.';
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return `La imagen ocupa ${formatearMegas(archivo.size)} y el máximo son ${formatearMegas(TAMANO_MAXIMO_BYTES)}.`;
  }
  return null;
}

function porcentaje(fraccion: number): number {
  return Math.round(fraccion * 100);
}

export function SelectorMediaSubida({ etiqueta, assetId, alCambiar, ayuda }: PropsSelectorMedia) {
  const { entradas, asegurar, subir } = useAlmacenMedia();

  const [fase, setFase] = useState<Fase>({ tipo: 'reposo' });
  const [urlLocal, setUrlLocal] = useState<string | null>(null);

  const entradaArchivo = useRef<HTMLInputElement | null>(null);
  const abortar = useRef<AbortController | null>(null);
  const idAyuda = useId();
  const idEstado = useId();

  const entrada = assetId === undefined ? undefined : entradas.get(assetId);

  // Un activo que aparece en el documento pero no está en el almacén —al
  // deshacer un cambio, por ejemplo— se pide aquí.
  useEffect(() => {
    if (assetId !== undefined) asegurar(assetId);
  }, [assetId, asegurar]);

  // Las URL `blob:` no se liberan solas: sin esto, cada reemplazo deja retenidos
  // los bytes de la anterior mientras la pestaña siga abierta.
  useEffect(() => {
    return () => {
      if (urlLocal !== null) URL.revokeObjectURL(urlLocal);
    };
  }, [urlLocal]);

  useEffect(() => {
    return () => {
      abortar.current?.abort();
    };
  }, []);

  const elegir = useCallback(
    async (archivo: File): Promise<void> => {
      const rechazo = motivoDeRechazo(archivo);
      if (rechazo !== null) {
        setFase({ tipo: 'error', mensaje: rechazo });
        return;
      }

      const vistaPrevia = URL.createObjectURL(archivo);
      setUrlLocal((anterior) => {
        if (anterior !== null) URL.revokeObjectURL(anterior);
        return vistaPrevia;
      });

      const controlador = new AbortController();
      abortar.current = controlador;
      setFase({ tipo: 'subiendo', progreso: { fraccion: 0, procesando: false } });

      try {
        const activo = await subir(
          archivo,
          (progreso) => {
            setFase({ tipo: 'subiendo', progreso });
          },
          controlador.signal,
        );
        setFase({ tipo: 'reposo' });
        alCambiar(activo.id);
      } catch (error) {
        setFase({
          tipo: 'error',
          mensaje: error instanceof ErrorMedia ? error.message : 'No se ha podido subir la imagen.',
        });
      } finally {
        abortar.current = null;
      }
    },
    [subir, alCambiar],
  );

  const subiendo = fase.tipo === 'subiendo';

  // Mientras sube manda la vista previa local; después, la imagen publicada.
  const vista =
    subiendo && urlLocal !== null
      ? urlLocal
      : entrada?.fase === 'listo'
        ? entrada.activo.url
        : null;

  const mensajeDeError =
    fase.tipo === 'error' ? fase.mensaje : entrada?.fase === 'error' ? entrada.mensaje : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {etiqueta}
        </span>
        {entrada?.fase === 'listo' && entrada.activo.width !== null ? (
          <span className="text-[0.6875rem] tabular-nums text-neutral-600 dark:text-neutral-400">
            {entrada.activo.width} × {entrada.activo.height} px
          </span>
        ) : null}
      </div>

      <div className="flex items-start gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-md border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
          {vista === null ? (
            <span className="flex size-full items-center justify-center text-neutral-500">
              <ImageUp aria-hidden="true" className="size-6" />
            </span>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- la fuente es
               una URL `blob:` o el bucket público; el optimizador de Next no
               aporta nada aquí y obligaría a declarar el dominio en la
               configuración, que es del agente de despliegue. */
            <img src={vista} alt="" className="size-full object-cover" width={80} height={80} />
          )}
          {entrada?.fase === 'cargando' ? (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-black/60">
              <Loader2 aria-hidden="true" className="size-5 animate-spin text-neutral-600" />
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <BotonEditor
              tamano="sm"
              disabled={subiendo}
              onClick={() => {
                entradaArchivo.current?.click();
              }}
            >
              {assetId === undefined ? 'Subir imagen' : 'Reemplazar'}
            </BotonEditor>

            {assetId !== undefined && !subiendo ? (
              <BotonEditor
                variante="peligro"
                tamano="sm"
                onClick={() => {
                  alCambiar(undefined);
                  setFase({ tipo: 'reposo' });
                }}
              >
                Quitar
              </BotonEditor>
            ) : null}

            {subiendo ? (
              <BotonEditor
                variante="peligro"
                tamano="sm"
                onClick={() => {
                  abortar.current?.abort();
                }}
              >
                <X aria-hidden="true" className="size-3.5" />
                Cancelar
              </BotonEditor>
            ) : null}
          </div>

          <input
            ref={entradaArchivo}
            type="file"
            accept={ACEPTADOS}
            className="sr-only"
            aria-label={`Archivo de imagen para ${etiqueta}`}
            aria-describedby={`${idAyuda} ${idEstado}`}
            onChange={(evento) => {
              const archivo = evento.target.files?.[0];
              // Se limpia el valor para que volver a elegir el mismo archivo
              // tras un fallo dispare `change` otra vez.
              evento.target.value = '';
              if (archivo !== undefined) void elegir(archivo);
            }}
          />

          {subiendo ? (
            <div className="flex flex-col gap-1">
              <div
                role="progressbar"
                aria-label={`Subiendo ${etiqueta}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={porcentaje(fase.progreso.fraccion)}
                className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
              >
                <span
                  className="block h-full bg-blue-600 transition-[width]"
                  style={{ width: `${String(porcentaje(fase.progreso.fraccion))}%` }}
                />
              </div>
              <span className="text-[0.6875rem] text-neutral-600 dark:text-neutral-400">
                {fase.progreso.procesando
                  ? 'Procesando la imagen en el servidor…'
                  : `Subiendo… ${String(porcentaje(fase.progreso.fraccion))} %`}
              </span>
            </div>
          ) : null}

          <p
            id={idEstado}
            role="status"
            aria-live="polite"
            className="text-[0.6875rem] text-red-700 empty:hidden dark:text-red-400"
          >
            {mensajeDeError === null ? null : (
              <span className="inline-flex items-start gap-1">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                {mensajeDeError}
              </span>
            )}
          </p>

          <p id={idAyuda} className="text-[0.6875rem] text-neutral-600 dark:text-neutral-400">
            {ayuda ??
              `JPEG, PNG o WebP, hasta ${formatearMegas(TAMANO_MAXIMO_BYTES)}. Se publica optimizada en WebP y sin metadatos.`}
          </p>
        </div>
      </div>
    </div>
  );
}
