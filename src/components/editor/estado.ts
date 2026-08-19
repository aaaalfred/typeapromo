'use client';

/**
 * Estado **efímero** del editor.
 *
 * PLAN.md §3 es explícito: Zustand solo para el estado temporal del editor,
 * nada de estado de servidor. Por eso aquí no está el documento.
 *
 * El borrador —lo que se lee de `GET /api/forms/:id` y se escribe con
 * `PUT /api/forms/:id/draft`— es estado de servidor y vive en el componente que
 * lo carga, junto a su revisión, para que documento y revisión no puedan
 * separarse nunca. Lo que hay aquí es lo que se pierde sin consecuencias al
 * recargar la página: qué elemento está seleccionado, qué pestaña de
 * propiedades se está mirando, si la previsualización se ve estrecha o ancha y
 * las respuestas de una ejecución de prueba.
 */

import { create } from 'zustand';

import type { AnswersMap } from '@/lib/forms';

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

/** Elemento del documento que está enfocado en el panel derecho. */
export type Seleccion =
  | { readonly tipo: 'bloque'; readonly id: string }
  | { readonly tipo: 'final'; readonly id: string }
  | { readonly tipo: 'ajustes' }
  | { readonly tipo: 'tema' };

/** Pestañas del panel de propiedades. */
export const PESTANAS = ['contenido', 'validacion', 'apariencia', 'media', 'logica'] as const;
export type Pestana = (typeof PESTANAS)[number];

export const NOMBRES_DE_PESTANA: Readonly<Record<Pestana, string>> = {
  contenido: 'Contenido',
  validacion: 'Validación',
  apariencia: 'Apariencia',
  media: 'Media',
  logica: 'Lógica',
};

/**
 * Ancho de la previsualización.
 *
 * No es un «modo móvil»: la raíz del renderer es un `@container` y sus
 * variantes son de contenedor, no de ventana, así que estrechar el marco
 * produce exactamente la misma disposición que un teléfono (README de
 * `components/formulario`). Por eso esto es un ancho y no una bandera que el
 * renderer tenga que mirar.
 */
export type Dispositivo = 'escritorio' | 'movil';

/** Ancho en píxeles del marco de previsualización de cada dispositivo. */
export const ANCHOS_DE_DISPOSITIVO: Readonly<Record<Dispositivo, number | null>> = {
  escritorio: null,
  movil: 390,
};

export interface EstadoEditor {
  readonly seleccion: Seleccion;
  readonly pestana: Pestana;
  readonly dispositivo: Dispositivo;
  /** `true` durante una ejecución de prueba. Nada de lo que ocurra se persiste. */
  readonly enPrueba: boolean;
  /** Contador que fuerza el remontaje del renderer al reiniciar la prueba. */
  readonly sesionDePrueba: number;
  /** Respuestas de la previsualización dirigida. Se descartan al recargar. */
  readonly respuestas: AnswersMap;

  readonly seleccionar: (seleccion: Seleccion) => void;
  readonly cambiarPestana: (pestana: Pestana) => void;
  readonly cambiarDispositivo: (dispositivo: Dispositivo) => void;
  readonly iniciarPrueba: () => void;
  readonly salirDePrueba: () => void;
  readonly establecerRespuestas: (respuestas: AnswersMap) => void;
  readonly reiniciar: () => void;
}

const INICIAL = {
  seleccion: { tipo: 'ajustes' } as Seleccion,
  pestana: 'contenido' as Pestana,
  dispositivo: 'escritorio' as Dispositivo,
  enPrueba: false,
  sesionDePrueba: 0,
  respuestas: {} as AnswersMap,
};

/**
 * Almacén del editor. Es único por pestaña del navegador, que es exactamente el
 * alcance de una sesión de edición: no hay dos editores abiertos a la vez en la
 * misma página.
 */
export const useEstadoEditor = create<EstadoEditor>((set) => ({
  ...INICIAL,

  seleccionar: (seleccion) => {
    set((estado) => ({
      seleccion,
      // Al cambiar de elemento la pestaña de lógica o validación puede no
      // existir para el tipo nuevo; el panel cae a «Contenido», que sí existe
      // siempre. Mantenerla produciría un panel vacío sin explicación.
      pestana: estado.seleccion.tipo === seleccion.tipo ? estado.pestana : 'contenido',
      // Salir de la prueba: seleccionar algo significa volver a editar.
      enPrueba: false,
    }));
  },

  cambiarPestana: (pestana) => {
    set({ pestana });
  },

  cambiarDispositivo: (dispositivo) => {
    set({ dispositivo });
  },

  iniciarPrueba: () => {
    set((estado) => ({
      enPrueba: true,
      sesionDePrueba: estado.sesionDePrueba + 1,
      // La prueba arranca siempre en blanco: arrastrar las respuestas de la
      // previsualización dirigida haría que el recorrido empezara a mitad.
      respuestas: {},
    }));
  },

  salirDePrueba: () => {
    set({ enPrueba: false, respuestas: {} });
  },

  establecerRespuestas: (respuestas) => {
    set({ respuestas });
  },

  reiniciar: () => {
    set({ ...INICIAL, respuestas: {} });
  },
}));

/** `true` si la selección apunta a un elemento del documento. */
export function seleccionEsElemento(
  seleccion: Seleccion,
): seleccion is Extract<Seleccion, { readonly id: string }> {
  return seleccion.tipo === 'bloque' || seleccion.tipo === 'final';
}
