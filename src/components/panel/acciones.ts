/**
 * Catálogo de acciones del listado.
 *
 * Qué se puede hacer en cada estado no se decide en el JSX: se declara aquí, en
 * una tabla que refleja la de `src/server/forms/status.ts`. Ofrecer un botón que
 * el servidor va a rechazar es peor que no ofrecerlo, y tener las dos tablas
 * separadas por capas hace evidente cuál manda: la del servidor. Esta solo evita
 * el viaje.
 *
 * Nada de esto sustituye a la validación del servidor; es la cortesía de no
 * enseñar callejones sin salida.
 */

import type { EstadoFormulario } from './tipos';

export const ACCIONES = ['duplicar', 'publicar', 'cerrar', 'archivar', 'desarchivar'] as const;

export type AccionFormulario = (typeof ACCIONES)[number];

export interface DescripcionAccion {
  /** Texto del botón de la fila. */
  readonly etiqueta: string;
  /** `true` si abre un diálogo de confirmación antes de llamar a la API. */
  readonly confirma: boolean;
  /** Título del diálogo de confirmación. */
  readonly tituloConfirmacion: string;
  /** Texto del botón que confirma. */
  readonly etiquetaConfirmar: string;
  /** Explicación de la consecuencia, con el título del formulario interpolado. */
  readonly explicacion: (titulo: string) => string;
  /** Mensaje de éxito, con el título del formulario interpolado. */
  readonly exito: (titulo: string) => string;
}

export const DESCRIPCION_ACCION: Readonly<Record<AccionFormulario, DescripcionAccion>> = {
  duplicar: {
    etiqueta: 'Duplicar',
    confirma: false,
    tituloConfirmacion: 'Duplicar el formulario',
    etiquetaConfirmar: 'Duplicar',
    explicacion: (titulo) => `Se creará una copia de «${titulo}» en estado de borrador.`,
    exito: (titulo) => `Se ha duplicado «${titulo}». La copia está en la lista como borrador.`,
  },
  publicar: {
    etiqueta: 'Publicar',
    confirma: true,
    tituloConfirmacion: 'Publicar el formulario',
    etiquetaConfirmar: 'Publicar',
    explicacion: (titulo) =>
      `«${titulo}» quedará accesible en su enlace público y empezará a recoger respuestas. Las respuestas anteriores no cambian.`,
    exito: (titulo) => `Se ha publicado «${titulo}».`,
  },
  cerrar: {
    etiqueta: 'Cerrar',
    confirma: true,
    tituloConfirmacion: 'Cerrar el formulario',
    etiquetaConfirmar: 'Cerrar el formulario',
    explicacion: (titulo) =>
      `«${titulo}» dejará de admitir respuestas nuevas. Las ya recogidas se conservan y quien entre verá el mensaje de cierre.`,
    exito: (titulo) => `Se ha cerrado «${titulo}».`,
  },
  archivar: {
    etiqueta: 'Archivar',
    confirma: true,
    tituloConfirmacion: 'Archivar el formulario',
    etiquetaConfirmar: 'Archivar',
    explicacion: (titulo) =>
      `«${titulo}» saldrá del listado y su borrador pasará a ser de solo lectura. Puedes desarchivarlo cuando quieras.`,
    exito: (titulo) => `Se ha archivado «${titulo}».`,
  },
  desarchivar: {
    etiqueta: 'Desarchivar',
    confirma: false,
    tituloConfirmacion: 'Desarchivar el formulario',
    etiquetaConfirmar: 'Desarchivar',
    explicacion: (titulo) => `«${titulo}» volverá al estado que tenía antes de archivarse.`,
    exito: (titulo) => `Se ha desarchivado «${titulo}».`,
  },
};

/** Acciones ofrecidas en cada estado, en el orden en que se muestran. */
export function accionesDisponibles(estado: EstadoFormulario): readonly AccionFormulario[] {
  switch (estado) {
    case 'draft':
      return ['publicar', 'duplicar', 'archivar'];
    // Un formulario publicado puede volver a publicarse: la fase 7 crea una
    // versión nueva sin tocar los recorridos ya respondidos.
    case 'published':
      return ['publicar', 'duplicar', 'cerrar', 'archivar'];
    case 'closed':
      return ['duplicar', 'archivar'];
    case 'archived':
      return ['desarchivar', 'duplicar'];
  }
}

/**
 * `true` si el borrador admite escritura. Espejo de `canEditDraft()` del
 * servidor: un formulario archivado se desarchiva antes de volver a editarlo.
 */
export function sePuedeEditar(estado: EstadoFormulario): boolean {
  return estado !== 'archived';
}
