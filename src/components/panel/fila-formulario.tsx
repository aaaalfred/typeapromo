'use client';

import { ChartColumn, PenLine } from 'lucide-react';
import Link from 'next/link';

import { Boton } from '@/components/ui/boton';

import {
  accionesDisponibles,
  sePuedeEditar,
  type AccionFormulario,
  DESCRIPCION_ACCION,
} from './acciones';
import { EtiquetaEstado } from './etiqueta-estado';
import { formatearFecha, plural } from './formato';
import { rutaResultados } from '@/components/resultados/rutas';

import { rutaEditor } from './rutas-panel';
import type { ResumenFormulario } from './tipos';

/**
 * Una fila del listado.
 *
 * Las acciones son botones visibles y no un menú desplegable: el menú de Radix
 * se apoya en un posicionador que no funciona sin `ResizeObserver`, y sobre todo
 * porque con cinco acciones como mucho no hay nada que esconder. Cada botón
 * lleva el título del formulario en su nombre accesible («Duplicar «Encuesta de
 * verano»»), de modo que quien navega por lista de botones no oye «Duplicar»
 * repetido veinte veces sin saber a qué se refiere.
 */
export interface PropsFilaFormulario {
  readonly formulario: ResumenFormulario;
  /** Acción de esta fila que se está ejecutando ahora mismo, si la hay. */
  readonly accionEnCurso?: AccionFormulario | null;
  /** `true` mientras hay cualquier acción en vuelo: bloquea toda la fila. */
  readonly bloqueado?: boolean;
  readonly onAccion: (accion: AccionFormulario, formulario: ResumenFormulario) => void;
}

export function FilaFormulario({
  formulario,
  accionEnCurso = null,
  bloqueado = false,
  onAccion,
}: PropsFilaFormulario) {
  const editable = sePuedeEditar(formulario.status);
  const fechaEdicion = formatearFecha(formulario.draft?.updatedAt ?? formulario.updatedAt);

  return (
    <li className="rounded-[var(--tp-radio-superficie)] border border-[color:var(--tp-borde)] bg-[var(--tp-superficie)] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="text-base font-semibold tracking-tight">
              {editable ? (
                <Link
                  href={rutaEditor(formulario.id)}
                  className="tp-foco rounded-[var(--tp-radio)] underline-offset-4 hover:underline"
                >
                  {formulario.title}
                </Link>
              ) : (
                formulario.title
              )}
            </h3>
            <EtiquetaEstado estado={formulario.status} />
          </div>

          <p className="mt-1 truncate font-mono text-xs text-[color:var(--tp-texto-suave)]">
            /f/{formulario.slug}
          </p>

          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[color:var(--tp-texto-suave)]">
            <div className="flex gap-1.5">
              <dt>Respuestas:</dt>
              <dd className="font-medium text-[color:var(--tp-texto)]">
                {String(formulario.responses.completed)}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Sesiones iniciadas:</dt>
              <dd>{String(formulario.responses.sessions)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Editado:</dt>
              <dd>
                {fechaEdicion === null ? (
                  'sin datos'
                ) : (
                  <time dateTime={formulario.draft?.updatedAt ?? formulario.updatedAt}>
                    {fechaEdicion}
                  </time>
                )}
              </dd>
            </div>
            {formulario.activeVersionNumber === null ? null : (
              <div className="flex gap-1.5">
                <dt>Versión publicada:</dt>
                <dd>{String(formulario.activeVersionNumber)}</dd>
              </div>
            )}
          </dl>

          <p className="sr-only">
            {plural(formulario.responses.completed, 'respuesta completada', 'respuestas completadas')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Link
              href={rutaEditor(formulario.id)}
              aria-label={`Editar «${formulario.title}»`}
              className="tp-foco inline-flex items-center gap-2 rounded-[var(--tp-radio)] border border-[color:var(--tp-borde)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--tp-acento-suave)]"
            >
              <PenLine aria-hidden="true" className="size-4" />
              Editar
            </Link>
          ) : null}

          {/*
            Resultados se ofrece siempre, también en borrador y en archivado: la
            pantalla sabe decir «todavía no hay respuestas», y esconder el enlace
            obligaría a publicar para descubrir dónde se miran.
          */}
          <Link
            href={rutaResultados(formulario.id)}
            aria-label={`Ver resultados de «${formulario.title}»`}
            className="tp-foco inline-flex items-center gap-2 rounded-[var(--tp-radio)] border border-[color:var(--tp-borde)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--tp-acento-suave)]"
          >
            <ChartColumn aria-hidden="true" className="size-4" />
            Resultados
          </Link>

          {accionesDisponibles(formulario.status).map((accion) => (
            <Boton
              key={accion}
              tamano="sm"
              estiloTema={accion === 'publicar' ? 'solid' : 'outline'}
              aria-label={`${DESCRIPCION_ACCION[accion].etiqueta} «${formulario.title}»`}
              cargando={accionEnCurso === accion}
              disabled={bloqueado && accionEnCurso !== accion}
              onClick={() => {
                onAccion(accion, formulario);
              }}
            >
              {DESCRIPCION_ACCION[accion].etiqueta}
            </Boton>
          ))}
        </div>
      </div>
    </li>
  );
}
