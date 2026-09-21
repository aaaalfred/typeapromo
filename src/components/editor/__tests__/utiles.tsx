/**
 * Utilidades compartidas por los tests del editor.
 *
 * Los documentos se construyen siempre pasando por `formDefinitionSchema`, como
 * en los tests del renderer: así ningún test trabaja con un documento que la
 * API rechazaría.
 */

import { render, type RenderResult } from '@testing-library/react';

import {
  DEFAULT_THEME,
  SCHEMA_VERSION,
  formDefinitionSchema,
  type FormDefinition,
  type FormDefinitionInput,
} from '@/lib/forms';

import { EditorFormulario, type PropsEditorFormulario } from '../editor-formulario';
import { useEstadoEditor } from '../estado';

export type BloqueEntrada = FormDefinitionInput['blocks'][number];
export type FinalEntrada = FormDefinitionInput['endScreens'][number];
export type ReglaEntrada = NonNullable<FormDefinitionInput['rules']>[number];

export const FINAL_POR_DEFECTO: FinalEntrada = { id: 'fin', type: 'ending', title: '¡Gracias!' };

export function crearDefinicion(entrada: {
  blocks: BloqueEntrada[];
  rules?: ReglaEntrada[];
  endScreens?: FinalEntrada[];
  theme?: FormDefinitionInput['theme'];
  title?: string;
}): FormDefinition {
  return formDefinitionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    meta: { title: entrada.title ?? 'Formulario de prueba' },
    theme: entrada.theme ?? DEFAULT_THEME,
    blocks: entrada.blocks,
    rules: entrada.rules ?? [],
    endScreens: entrada.endScreens ?? [FINAL_POR_DEFECTO],
  });
}

/** Tres preguntas de texto, que es el mínimo para probar reordenado y lógica. */
export function definicionDeTresBloques(): FormDefinition {
  return crearDefinicion({
    blocks: [
      { id: 'b1', type: 'short_text', title: 'Primera' },
      { id: 'b2', type: 'short_text', title: 'Segunda' },
      { id: 'b3', type: 'short_text', title: 'Tercera' },
    ],
  });
}

/** Devuelve el almacén efímero a su estado inicial entre tests. */
export function reiniciarEstadoEditor(): void {
  useEstadoEditor.getState().reiniciar();
}

/**
 * Monta el editor con un guardado que no hace nada, salvo que el test inyecte
 * el suyo. Sin esto, cada pulsación de tecla intentaría un `fetch` real.
 */
export function pintarEditor(
  props: Partial<PropsEditorFormulario> & { readonly definicionInicial?: FormDefinition } = {},
): RenderResult {
  const {
    formularioId = 'formulario-de-prueba',
    definicionInicial = definicionDeTresBloques(),
    revisionInicial = 1,
    guardar = () =>
      Promise.resolve({ estado: 'guardado' as const, revision: 2, guardadoEn: new Date() }),
    ...resto
  } = props;

  return render(
    <EditorFormulario
      formularioId={formularioId}
      definicionInicial={definicionInicial}
      revisionInicial={revisionInicial}
      guardar={guardar}
      {...resto}
    />,
  );
}

/**
 * Rectángulos apilados para jsdom.
 *
 * jsdom no hace layout: todo `getBoundingClientRect()` devuelve ceros y las
 * matemáticas de colisión de dnd-kit no pueden distinguir un elemento de otro.
 * Se sustituye por una geometría deducida de `data-indice`, que es lo que la
 * lista ya pinta para cada fila.
 */
export function simularGeometriaDeLista(altura = 56): () => void {
  const original = Element.prototype.getBoundingClientRect;
  const originalScroll = Element.prototype.scrollIntoView;

  const rectangulo = (arriba: number, alto: number): DOMRect =>
    ({
      x: 0,
      y: arriba,
      top: arriba,
      left: 0,
      right: 280,
      bottom: arriba + alto,
      width: 280,
      height: alto,
      toJSON: () => ({}),
    }) as DOMRect;

  Element.prototype.getBoundingClientRect = function medir(this: Element): DOMRect {
    const nodo = this.closest('[data-indice]');
    const indice = nodo === null ? null : Number(nodo.getAttribute('data-indice'));
    // Lo que no es una fila (la lista, el documento) se declara alto: el
    // modificador `restrictToParentElement` acota el arrastre al rectángulo del
    // contenedor, y un contenedor de altura cero impediría cualquier movimiento.
    if (indice === null || Number.isNaN(indice)) return rectangulo(0, altura * 40);
    return rectangulo(indice * altura, altura);
  };
  Element.prototype.scrollIntoView = function desplazar(): void {
    /* jsdom no lo implementa y dnd-kit lo llama al levantar con teclado. */
  };

  return () => {
    Element.prototype.getBoundingClientRect = original;
    Element.prototype.scrollIntoView = originalScroll;
  };
}
