'use client';

/**
 * Panel izquierdo: el recorrido del formulario.
 *
 * Reordenar es la operación más peligrosa del editor —cambia qué saltos son
 * «hacia adelante»— así que tiene dos caminos deliberadamente equivalentes:
 *
 * 1. **Arrastrar** con `dnd-kit`, incluido su `KeyboardSensor`: con el asa
 *    enfocada, `Espacio` levanta el bloque, las flechas lo mueven y `Espacio`
 *    lo suelta. dnd-kit anuncia cada paso por su región `aria-live`.
 * 2. **Subir y bajar** con dos botones por bloque, que hacen exactamente lo
 *    mismo llamando a la misma función pura.
 *
 * El segundo camino no es un parche del primero: mover un bloque tres
 * posiciones con dos pulsaciones es más rápido que arrastrarlo, con ratón o sin
 * él, y deja el resultado a un `Ctrl+Z` mental de distancia.
 */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Copy,
  Flag,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';

import { cn } from '@/components/ui/cn';
import {
  NOMBRES_DE_TIPO,
  avisosDeBloque,
  tieneErrores,
  type Diagnostico,
  type PlantillaDeBloque,
} from '@/lib/editor';
import {
  isQuestionBlock,
  type EndingBlock,
  type FlowBlockDefinition,
  type FormDefinition,
} from '@/lib/forms';

import type { Seleccion } from './estado';
import { MenuAnadir } from './menu-anadir';
import { BotonEditor } from './ui/piezas';

/* -------------------------------------------------------------------------- */
/* Fila                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Traducción del desplazamiento de dnd-kit a `transform`.
 *
 * Se escribe a mano en lugar de importar `@dnd-kit/utilities`: ese paquete
 * llega como dependencia transitiva y no está declarado en `package.json`, así
 * que depender de él sería depender de un detalle del árbol de instalación.
 */
function comoTransform(transform: { readonly x: number; readonly y: number } | null): string | undefined {
  if (transform === null) return undefined;
  return `translate3d(${String(Math.round(transform.x))}px, ${String(Math.round(transform.y))}px, 0)`;
}

interface PropsFila {
  readonly id: string;
  readonly indice: number;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly seleccionado: boolean;
  readonly conError: boolean;
  readonly ordenable: boolean;
  readonly puedeSubir: boolean;
  readonly puedeBajar: boolean;
  readonly puedeEliminar: boolean;
  readonly alSeleccionar: () => void;
  readonly alDesplazar: (delta: number) => void;
  readonly alDuplicar?: () => void;
  readonly alEliminar: () => void;
}

function Fila({
  id,
  indice,
  titulo,
  subtitulo,
  seleccionado,
  conError,
  ordenable,
  puedeSubir,
  puedeBajar,
  puedeEliminar,
  alSeleccionar,
  alDesplazar,
  alDuplicar,
  alEliminar,
}: PropsFila) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !ordenable,
  });

  return (
    <li
      ref={setNodeRef}
      data-indice={indice}
      data-bloque={id}
      style={{ transform: comoTransform(transform), transition }}
      className={cn(
        'group relative flex items-center gap-1 rounded-md border px-1 py-1',
        seleccionado
          ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
          : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800',
        isDragging && 'z-10 opacity-80 shadow-md',
      )}
    >
      {ordenable ? (
        <button
          {...attributes}
          {...listeners}
          type="button"
          aria-label={`Reordenar ${titulo}`}
          className="shrink-0 cursor-grab rounded p-1 text-neutral-400 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:hover:text-neutral-200"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <span className="shrink-0 p-1 text-neutral-300 dark:text-neutral-700">
          <Flag aria-hidden="true" className="size-4" />
        </span>
      )}

      <button
        type="button"
        onClick={alSeleccionar}
        aria-current={seleccionado ? 'true' : undefined}
        className="min-w-0 flex-1 rounded px-1 py-0.5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
      >
        <span className="flex items-center gap-1.5">
          {conError ? (
            <AlertCircle
              aria-label="Con errores"
              className="size-3.5 shrink-0 text-red-600 dark:text-red-400"
            />
          ) : null}
          <span className="truncate text-sm text-neutral-900 dark:text-neutral-100">{titulo}</span>
        </span>
        {/*
          `neutral-600` y no `neutral-500`: cuando el bloque está seleccionado el
          fondo pasa a `blue-50`, y sobre él `neutral-500` da 4,36:1, justo por
          debajo del 4,5:1 de WCAG AA. Con `neutral-600` sube a 7,18:1.
        */}
        <span className="block truncate text-xs text-neutral-600 dark:text-neutral-400">
          {subtitulo}
        </span>
      </button>

      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <BotonEditor
          variante="discreto"
          tamano="sm"
          disabled={!puedeSubir}
          aria-label={`Subir ${titulo}`}
          onClick={() => {
            alDesplazar(-1);
          }}
        >
          <ArrowUp aria-hidden="true" className="size-3.5" />
        </BotonEditor>
        <BotonEditor
          variante="discreto"
          tamano="sm"
          disabled={!puedeBajar}
          aria-label={`Bajar ${titulo}`}
          onClick={() => {
            alDesplazar(1);
          }}
        >
          <ArrowDown aria-hidden="true" className="size-3.5" />
        </BotonEditor>
        {alDuplicar === undefined ? null : (
          <BotonEditor
            variante="discreto"
            tamano="sm"
            aria-label={`Duplicar ${titulo}`}
            onClick={alDuplicar}
          >
            <Copy aria-hidden="true" className="size-3.5" />
          </BotonEditor>
        )}
        <BotonEditor
          variante="peligro"
          tamano="sm"
          disabled={!puedeEliminar}
          aria-label={`Eliminar ${titulo}`}
          onClick={alEliminar}
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
        </BotonEditor>
      </span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Lista                                                                       */
/* -------------------------------------------------------------------------- */

export interface PropsListaBloques {
  readonly definicion: FormDefinition;
  readonly seleccion: Seleccion;
  readonly diagnostico: Diagnostico;
  readonly alSeleccionar: (seleccion: Seleccion) => void;
  /** Reordena el recorrido. Índices dentro de `definicion.blocks`. */
  readonly alReordenar: (desde: number, hasta: number) => void;
  readonly alDesplazarBloque: (bloqueId: string, delta: number) => void;
  readonly alAnadirBloque: (tipo: PlantillaDeBloque['tipo']) => void;
  readonly alDuplicarBloque: (bloqueId: string) => void;
  readonly alEliminarBloque: (bloqueId: string) => void;
  readonly alAnadirPantallaFinal: () => void;
  readonly alEliminarPantallaFinal: (pantallaId: string) => void;
}

function subtituloDeBloque(bloque: FlowBlockDefinition, numero: number | null): string {
  const tipo = NOMBRES_DE_TIPO[bloque.type];
  return numero === null ? tipo : `${String(numero)} · ${tipo}`;
}

export function ListaBloques({
  definicion,
  seleccion,
  diagnostico,
  alSeleccionar,
  alReordenar,
  alDesplazarBloque,
  alAnadirBloque,
  alDuplicarBloque,
  alEliminarBloque,
  alAnadirPantallaFinal,
  alEliminarPantallaFinal,
}: PropsListaBloques) {
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // El sensor de teclado es lo que hace accesible el reordenado: `Espacio`
    // levanta, las flechas mueven, `Espacio` suelta y `Escape` cancela.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const identificadores = definicion.blocks.map((bloque) => bloque.id);
  const hayBienvenida = definicion.blocks.some((bloque) => bloque.type === 'welcome');

  const alTerminarArrastre = (evento: DragEndEvent): void => {
    const { active, over } = evento;
    if (over === null || active.id === over.id) return;
    const desde = identificadores.indexOf(String(active.id));
    const hasta = identificadores.indexOf(String(over.id));
    if (desde < 0 || hasta < 0) return;
    alReordenar(desde, hasta);
  };

  // Numeración de preguntas calculada de una vez: solo cuentan los bloques que
  // recogen respuesta, igual que hace el renderer.
  const numeroDePregunta = new Map<string, number>();
  definicion.blocks.forEach((bloque) => {
    if (isQuestionBlock(bloque)) numeroDePregunta.set(bloque.id, numeroDePregunta.size + 1);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-neutral-200 p-2 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => {
            alSeleccionar({ tipo: 'ajustes' });
          }}
          aria-current={seleccion.tipo === 'ajustes' ? 'true' : undefined}
          className={cn(
            'rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600',
            seleccion.tipo === 'ajustes'
              ? 'bg-blue-50 font-medium text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
          )}
        >
          Ajustes del formulario
        </button>
        <button
          type="button"
          onClick={() => {
            alSeleccionar({ tipo: 'tema' });
          }}
          aria-current={seleccion.tipo === 'tema' ? 'true' : undefined}
          className={cn(
            'rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600',
            seleccion.tipo === 'tema'
              ? 'bg-blue-50 font-medium text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
          )}
        >
          Tema y accesibilidad
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <h2 className="px-1 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Recorrido
        </h2>

        <DndContext
          sensors={sensores}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={alTerminarArrastre}
        >
          <SortableContext items={identificadores} strategy={verticalListSortingStrategy}>
            <ol aria-label="Bloques del formulario" className="flex list-none flex-col gap-0.5">
              {definicion.blocks.map((bloque, indice) => {
                const numero = numeroDePregunta.get(bloque.id) ?? null;
                const avisos = avisosDeBloque(diagnostico, bloque.id);
                return (
                  <Fila
                    key={bloque.id}
                    id={bloque.id}
                    indice={indice}
                    titulo={bloque.title}
                    subtitulo={subtituloDeBloque(bloque, numero)}
                    seleccionado={seleccion.tipo === 'bloque' && seleccion.id === bloque.id}
                    conError={tieneErrores(avisos)}
                    ordenable
                    puedeSubir={indice > 0}
                    puedeBajar={indice < definicion.blocks.length - 1}
                    puedeEliminar
                    alSeleccionar={() => {
                      alSeleccionar({ tipo: 'bloque', id: bloque.id });
                    }}
                    alDesplazar={(delta) => {
                      alDesplazarBloque(bloque.id, delta);
                    }}
                    alDuplicar={
                      bloque.type === 'welcome'
                        ? undefined
                        : () => {
                            alDuplicarBloque(bloque.id);
                          }
                    }
                    alEliminar={() => {
                      alEliminarBloque(bloque.id);
                    }}
                  />
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>

        {definicion.blocks.length === 0 ? (
          <p className="px-1 py-3 text-xs text-neutral-500 dark:text-neutral-400">
            Todavía no hay ningún bloque. Añade el primero para empezar.
          </p>
        ) : null}

        <h2 className="px-1 pb-1 pt-4 text-[0.6875rem] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Pantallas finales
        </h2>
        <ol aria-label="Pantallas finales" className="flex list-none flex-col gap-0.5">
          {definicion.endScreens.map((pantalla: EndingBlock, indice) => {
            const avisos = avisosDeBloque(diagnostico, pantalla.id);
            const porDefecto =
              (definicion.defaultEndScreenId ?? definicion.endScreens[0]?.id) === pantalla.id;
            return (
              <Fila
                key={pantalla.id}
                id={pantalla.id}
                indice={indice}
                titulo={pantalla.title}
                subtitulo={porDefecto ? 'Pantalla final · por defecto' : 'Pantalla final'}
                seleccionado={seleccion.tipo === 'final' && seleccion.id === pantalla.id}
                conError={tieneErrores(avisos)}
                ordenable={false}
                puedeSubir={false}
                puedeBajar={false}
                puedeEliminar={definicion.endScreens.length > 1}
                alSeleccionar={() => {
                  alSeleccionar({ tipo: 'final', id: pantalla.id });
                }}
                alDesplazar={() => undefined}
                alEliminar={() => {
                  alEliminarPantallaFinal(pantalla.id);
                }}
              />
            );
          })}
        </ol>
      </div>

      <div className="flex flex-col gap-2 border-t border-neutral-200 p-2 dark:border-neutral-800">
        <MenuAnadir
          alElegir={alAnadirBloque}
          deshabilitados={hayBienvenida ? ['welcome'] : []}
        />
        <BotonEditor variante="discreto" onClick={alAnadirPantallaFinal}>
          <Plus aria-hidden="true" className="size-4" />
          Añadir pantalla final
        </BotonEditor>
      </div>
    </div>
  );
}
