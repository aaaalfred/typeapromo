'use client';

/**
 * Panel de ajustes del formulario: metadatos y comportamiento general.
 *
 * El título del documento (`meta.title`) es también el que se ve en el panel
 * del equipo, y renombrar desde allí incrementa la revisión del borrador
 * (`PATCH /api/forms/:id`), de modo que un editor abierto recibirá un conflicto
 * limpio. Aquí se edita el del documento, que es lo que viaja en el snapshot
 * publicado.
 */

import { useState } from 'react';
import type { FormDefinition } from '@/lib/forms';

import type { AccionesDocumento } from './acciones';
import { CampoArea, CampoTexto, Interruptor } from './ui/campos';
import { Seccion } from './ui/piezas';

export interface PropsPanelAjustes {
  readonly definicion: FormDefinition;
  readonly acciones: AccionesDocumento;
  readonly slug?: string;
  readonly alActualizarSlug?: (nuevoSlug: string) => Promise<void>;
}

export function PanelAjustes({
  definicion,
  acciones,
  slug,
  alActualizarSlug,
}: PropsPanelAjustes) {
  const { meta, settings } = definicion;
  const [slugLocal, setSlugLocal] = useState(slug ?? '');
  const [guardandoSlug, setGuardandoSlug] = useState(false);
  const [errorSlug, setErrorSlug] = useState<string | null>(null);
  const [slugGuardado, setSlugGuardado] = useState(false);

  return (
    <>
      <Seccion titulo="Formulario">
        <CampoTexto
          etiqueta="Título"
          valor={meta.title}
          maxLength={300}
          alCambiar={(title) => {
            acciones.actualizarMeta({ title });
          }}
        />

        {alActualizarSlug ? (
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Dirección pública (/f/...)
            </label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900">
                <span className="text-neutral-400 select-none">/f/</span>
                <input
                  type="text"
                  value={slugLocal}
                  disabled={guardandoSlug}
                  onChange={(e) => {
                    setSlugLocal(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    setErrorSlug(null);
                    setSlugGuardado(false);
                  }}
                  className="w-full bg-transparent px-1 font-mono text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-100"
                />
              </div>
              <button
                type="button"
                disabled={guardandoSlug || slugLocal === slug}
                onClick={async () => {
                  const limpio = slugLocal.trim().toLowerCase();
                  if (limpio.length < 3 || limpio.length > 60) {
                    setErrorSlug('El slug debe tener entre 3 y 60 caracteres.');
                    return;
                  }
                  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(limpio)) {
                    setErrorSlug('Solo minúsculas, números y guiones simples.');
                    return;
                  }
                  setGuardandoSlug(true);
                  setErrorSlug(null);
                  try {
                    await alActualizarSlug(limpio);
                    setSlugGuardado(true);
                    setTimeout(() => setSlugGuardado(false), 2500);
                  } catch (err: unknown) {
                    const mensaje = err instanceof Error ? err.message : 'No se ha podido guardar el slug.';
                    setErrorSlug(mensaje);
                  } finally {
                    setGuardandoSlug(false);
                  }
                }}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
              >
                {guardandoSlug ? 'Guardando...' : 'Cambiar'}
              </button>
            </div>
            {errorSlug ? (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {errorSlug}
              </p>
            ) : slugGuardado ? (
              <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
                Dirección actualizada con éxito.
              </p>
            ) : (
              <p className="text-[11px] text-neutral-500">
                Entre 3 y 60 caracteres. Válido en cualquier estado del formulario.
              </p>
            )}
          </div>
        ) : null}
        <CampoArea
          etiqueta="Descripción interna"
          valor={meta.description ?? ''}
          maxLength={2000}
          marcador="Para el equipo; no se muestra a quien responde."
          alCambiar={(texto) => {
            acciones.actualizarMeta({ description: texto === '' ? undefined : texto });
          }}
        />
        <CampoArea
          etiqueta="Mensaje al cerrar"
          valor={meta.closedMessage ?? ''}
          maxLength={1000}
          marcador="Se muestra cuando el formulario está cerrado."
          alCambiar={(texto) => {
            acciones.actualizarMeta({ closedMessage: texto === '' ? undefined : texto });
          }}
        />
        <CampoTexto
          etiqueta="Idioma"
          valor={meta.language}
          maxLength={10}
          ayuda="Código de idioma del documento (por ejemplo, «es»)."
          alCambiar={(language) => {
            acciones.actualizarMeta({ language });
          }}
        />
      </Seccion>

      <Seccion titulo="Comportamiento">
        <Interruptor
          etiqueta="Mostrar barra de progreso"
          activo={settings.showProgressBar}
          ayuda="El progreso se calcula sobre el recorrido efectivo, no sobre el total de preguntas, así que puede moverse al resolverse una bifurcación."
          alCambiar={(showProgressBar) => {
            acciones.actualizarAjustes({ showProgressBar });
          }}
        />
        <Interruptor
          etiqueta="Permitir reanudar en el mismo navegador"
          activo={settings.allowResume}
          alCambiar={(allowResume) => {
            acciones.actualizarAjustes({ allowResume });
          }}
        />
        <Interruptor
          etiqueta="Numerar las preguntas"
          activo={settings.showQuestionNumbers}
          alCambiar={(showQuestionNumbers) => {
            acciones.actualizarAjustes({ showQuestionNumbers });
          }}
        />
      </Seccion>
    </>
  );
}
