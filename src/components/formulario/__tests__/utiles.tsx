/**
 * Utilidades compartidas por los tests del renderer.
 *
 * Todos los documentos se construyen pasando por `formDefinitionSchema.parse`,
 * igual que hacen los tests de `lib/forms`: así cada test de interfaz ejercita
 * también el contrato y nunca trabaja con un documento imposible.
 */

import { render, type RenderResult } from '@testing-library/react';

import {
  DEFAULT_THEME,
  SCHEMA_VERSION,
  formDefinitionSchema,
  type FormDefinition,
  type FormDefinitionInput,
} from '@/lib/forms';

import {
  RenderizadorFormulario,
  type PropsRenderizadorFormulario,
} from '../renderizador-formulario';

export type BloqueEntrada = FormDefinitionInput['blocks'][number];
export type FinalEntrada = FormDefinitionInput['endScreens'][number];
export type ReglaEntrada = NonNullable<FormDefinitionInput['rules']>[number];
export type TemaEntrada = FormDefinitionInput['theme'];
export type AjustesEntrada = NonNullable<FormDefinitionInput['settings']>;

export const FINAL_POR_DEFECTO: FinalEntrada = {
  id: 'fin',
  type: 'ending',
  title: '¡Gracias!',
};

/** Construye un documento válido con lo mínimo que necesite el test. */
export function crearDefinicion(entrada: {
  blocks: BloqueEntrada[];
  rules?: ReglaEntrada[];
  endScreens?: FinalEntrada[];
  theme?: TemaEntrada;
  settings?: AjustesEntrada;
  title?: string;
}): FormDefinition {
  return formDefinitionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    meta: { title: entrada.title ?? 'Formulario de prueba' },
    theme: entrada.theme ?? DEFAULT_THEME,
    blocks: entrada.blocks,
    rules: entrada.rules ?? [],
    endScreens: entrada.endScreens ?? [FINAL_POR_DEFECTO],
    ...(entrada.settings !== undefined ? { settings: entrada.settings } : {}),
  });
}

/** Documento de un solo bloque, que es el caso de casi todos los tests. */
export function conBloque(bloque: BloqueEntrada, resto?: Partial<Parameters<typeof crearDefinicion>[0]>): FormDefinition {
  return crearDefinicion({ blocks: [bloque], ...resto });
}

/** Pinta el renderer con las props indicadas. */
export function pintar(
  definicion: FormDefinition,
  props: Omit<PropsRenderizadorFormulario, 'definicion'> = {},
): RenderResult {
  return render(<RenderizadorFormulario definicion={definicion} {...props} />);
}

/**
 * Opciones de selección con identificador y valor derivados de la etiqueta.
 * Los identificadores del contrato solo admiten `[A-Za-z0-9_-]`, así que se
 * quitan los diacríticos.
 */
export function opciones(...etiquetas: string[]) {
  return etiquetas.map((etiqueta) => {
    const clave = etiqueta
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .toLowerCase();
    return { id: `op-${clave}`, label: etiqueta, value: clave };
  });
}
