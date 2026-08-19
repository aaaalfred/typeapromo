'use client';

/**
 * Editor de opciones de una pregunta de selección.
 *
 * Distingue con cuidado **etiqueta** de **valor**:
 *
 * - La etiqueta es lo que se lee y se puede cambiar cuando se quiera.
 * - El valor es lo que se guarda en `answers` y lo que comparan las reglas.
 *   Cambiarlo después de publicar rompe la correspondencia con las respuestas
 *   ya recogidas, así que se muestra aparte, en un campo secundario, y solo se
 *   autocompleta desde la etiqueta **mientras la opción es nueva** (es decir,
 *   mientras el valor sigue siendo el que puso el editor al crearla).
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import { valorSugerido } from '@/lib/editor';
import type { ChoiceBlock, ChoiceDefinition } from '@/lib/forms';

import { CampoTexto } from '../ui/campos';
import { BotonEditor } from '../ui/piezas';

export interface PropsEditorOpciones {
  readonly bloque: ChoiceBlock;
  readonly alAnadir: () => void;
  readonly alActualizar: (opcionId: string, parcial: Partial<ChoiceDefinition>) => void;
  readonly alEliminar: (opcionId: string) => void;
  readonly alMover: (desde: number, hasta: number) => void;
}

/** `true` si el valor sigue siendo el generado automáticamente al crear la opción. */
function valorSinTocar(opcion: ChoiceDefinition, indice: number): boolean {
  return opcion.value === `opcion-${String(indice + 1)}`;
}

export function EditorOpciones({
  bloque,
  alAnadir,
  alActualizar,
  alEliminar,
  alMover,
}: PropsEditorOpciones) {
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex list-none flex-col gap-3">
        {bloque.choices.map((opcion, indice) => (
          <li
            key={opcion.id}
            className="rounded-md border border-neutral-200 p-2 dark:border-neutral-800"
          >
            <div className="flex items-end gap-1">
              <div className="min-w-0 flex-1">
                <CampoTexto
                  etiqueta={`Opción ${String(indice + 1)}`}
                  valor={opcion.label}
                  maxLength={300}
                  alCambiar={(etiqueta) => {
                    alActualizar(opcion.id, {
                      label: etiqueta,
                      // Solo se arrastra el valor mientras nadie lo ha fijado.
                      ...(valorSinTocar(opcion, indice)
                        ? { value: valorSugerido(etiqueta) }
                        : {}),
                    });
                  }}
                />
              </div>
              <BotonEditor
                variante="discreto"
                tamano="sm"
                disabled={indice === 0}
                aria-label={`Subir la opción ${opcion.label}`}
                onClick={() => {
                  alMover(indice, indice - 1);
                }}
              >
                <ArrowUp aria-hidden="true" className="size-3.5" />
              </BotonEditor>
              <BotonEditor
                variante="discreto"
                tamano="sm"
                disabled={indice === bloque.choices.length - 1}
                aria-label={`Bajar la opción ${opcion.label}`}
                onClick={() => {
                  alMover(indice, indice + 1);
                }}
              >
                <ArrowDown aria-hidden="true" className="size-3.5" />
              </BotonEditor>
              <BotonEditor
                variante="peligro"
                tamano="sm"
                disabled={bloque.choices.length <= 1}
                aria-label={`Eliminar la opción ${opcion.label}`}
                onClick={() => {
                  alEliminar(opcion.id);
                }}
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </BotonEditor>
            </div>

            <div className="mt-2">
              <CampoTexto
                etiqueta="Valor guardado"
                valor={opcion.value}
                maxLength={200}
                ayuda="Es lo que se almacena y lo que comparan las reglas. Cambiarlo tras publicar deja de casar con las respuestas ya recibidas."
                alCambiar={(valor) => {
                  alActualizar(opcion.id, { value: valor });
                }}
              />
            </div>
          </li>
        ))}
      </ol>

      <div>
        <BotonEditor variante="secundario" tamano="sm" onClick={alAnadir}>
          <Plus aria-hidden="true" className="size-3.5" />
          Añadir opción
        </BotonEditor>
      </div>
    </div>
  );
}
