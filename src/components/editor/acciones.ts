'use client';

/**
 * Acciones del editor sobre el documento.
 *
 * Un único objeto estable que los paneles reciben por props. Todas las
 * operaciones delegan en las funciones puras de `@/lib/editor/documento`, que
 * son las que mantienen la integridad referencial (borrar un bloque borra sus
 * reglas, borrar una opción borra las reglas que la comparaban…).
 *
 * Existe para que ningún panel tenga que conocer la forma completa del
 * documento ni llamar a `setState` con un objeto entero: un panel que reescribe
 * el documento a mano es un panel que puede pisar lo que hizo otro.
 */

import * as documento from '@/lib/editor/documento';
import type {
  ChoiceDefinition,
  EndingBlock,
  FlowBlockDefinition,
  FormDefinition,
  FormMeta,
  FormSettings,
  LogicRule,
  ThemeColors,
  ThemeDefinition,
  ThemeTypography,
} from '@/lib/forms';

/** Transformación pura del documento. */
export type Transformacion = (definicion: FormDefinition) => FormDefinition;

/** Aplica una transformación al documento vivo del editor. */
export type Aplicar = (transformacion: Transformacion) => void;

export interface AccionesDocumento {
  readonly actualizarMeta: (parcial: Partial<FormMeta>) => void;
  readonly actualizarAjustes: (parcial: Partial<FormSettings>) => void;
  readonly actualizarTema: (parcial: Partial<ThemeDefinition>) => void;
  readonly actualizarColores: (parcial: Partial<ThemeColors>) => void;
  readonly actualizarTipografia: (parcial: Partial<ThemeTypography>) => void;

  readonly reemplazarBloque: (bloque: FlowBlockDefinition) => void;
  readonly cambiarTipoDeBloque: (
    bloqueId: string,
    tipo: Parameters<typeof documento.cambiarTipoDeBloque>[2],
  ) => void;

  readonly anadirOpcion: (bloqueId: string) => void;
  readonly actualizarOpcion: (
    bloqueId: string,
    opcionId: string,
    parcial: Partial<ChoiceDefinition>,
  ) => void;
  readonly eliminarOpcion: (bloqueId: string, opcionId: string) => void;
  readonly moverOpcion: (bloqueId: string, desde: number, hasta: number) => void;

  readonly reemplazarPantallaFinal: (pantalla: EndingBlock) => void;
  readonly marcarPantallaPorDefecto: (pantallaId: string) => void;

  readonly anadirRegla: (regla: Omit<LogicRule, 'id' | 'priority'>) => void;
  readonly actualizarRegla: (reglaId: string, parcial: Partial<Omit<LogicRule, 'id'>>) => void;
  readonly eliminarRegla: (reglaId: string) => void;
  readonly desplazarRegla: (reglaId: string, delta: number) => void;
}

/** Construye el objeto de acciones a partir de la función que aplica cambios. */
export function crearAcciones(aplicar: Aplicar): AccionesDocumento {
  return {
    actualizarMeta: (parcial) => {
      aplicar((definicion) => documento.actualizarMeta(definicion, parcial));
    },
    actualizarAjustes: (parcial) => {
      aplicar((definicion) => documento.actualizarAjustes(definicion, parcial));
    },
    actualizarTema: (parcial) => {
      aplicar((definicion) => documento.actualizarTema(definicion, parcial));
    },
    actualizarColores: (parcial) => {
      aplicar((definicion) => documento.actualizarColores(definicion, parcial));
    },
    actualizarTipografia: (parcial) => {
      aplicar((definicion) => documento.actualizarTipografia(definicion, parcial));
    },

    reemplazarBloque: (bloque) => {
      aplicar((definicion) => documento.reemplazarBloque(definicion, bloque));
    },
    cambiarTipoDeBloque: (bloqueId, tipo) => {
      aplicar((definicion) => documento.cambiarTipoDeBloque(definicion, bloqueId, tipo));
    },

    anadirOpcion: (bloqueId) => {
      aplicar((definicion) => documento.anadirOpcion(definicion, bloqueId));
    },
    actualizarOpcion: (bloqueId, opcionId, parcial) => {
      aplicar((definicion) => documento.actualizarOpcion(definicion, bloqueId, opcionId, parcial));
    },
    eliminarOpcion: (bloqueId, opcionId) => {
      aplicar((definicion) => documento.eliminarOpcion(definicion, bloqueId, opcionId));
    },
    moverOpcion: (bloqueId, desde, hasta) => {
      aplicar((definicion) => documento.moverOpcion(definicion, bloqueId, desde, hasta));
    },

    reemplazarPantallaFinal: (pantalla) => {
      aplicar((definicion) => documento.reemplazarPantallaFinal(definicion, pantalla));
    },
    marcarPantallaPorDefecto: (pantallaId) => {
      aplicar((definicion) => documento.marcarPantallaPorDefecto(definicion, pantallaId));
    },

    anadirRegla: (regla) => {
      aplicar((definicion) => documento.anadirRegla(definicion, regla).definicion);
    },
    actualizarRegla: (reglaId, parcial) => {
      aplicar((definicion) => documento.actualizarRegla(definicion, reglaId, parcial));
    },
    eliminarRegla: (reglaId) => {
      aplicar((definicion) => documento.eliminarRegla(definicion, reglaId));
    },
    desplazarRegla: (reglaId, delta) => {
      aplicar((definicion) => documento.desplazarRegla(definicion, reglaId, delta));
    },
  };
}
