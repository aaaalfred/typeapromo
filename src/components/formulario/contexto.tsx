'use client';

import { createContext, useContext } from 'react';

import type {
  AnswerValue,
  AnswersMap,
  BlockDefinition,
  FormDefinition,
  FormProgress,
  ThemeDefinition,
} from '@/lib/forms';

import type { ResolverMedia } from './medios';

/**
 * Estado que el renderer expone a los bloques.
 *
 * Los bloques no reciben callbacks por props encadenadas: leen de aquí. Eso
 * mantiene la firma de cada bloque reducida a `{ bloque }` y hace que añadir un
 * tipo nuevo no obligue a tocar el árbol entero.
 */
export interface ValorContextoFormulario {
  readonly definicion: FormDefinition;
  readonly tema: ThemeDefinition;
  readonly resolverMedia: ResolverMedia;

  /** Bloque o pantalla final que se está pintando. */
  readonly bloqueActual: BlockDefinition;
  readonly respuestas: AnswersMap;
  readonly establecerRespuesta: (bloqueId: string, valor: AnswerValue) => void;

  /** Valida y pasa a la siguiente pantalla según el motor de recorrido. */
  readonly avanzar: () => void;
  /** Vuelve a la pantalla anterior del historial de esta sesión. */
  readonly retroceder: () => void;
  readonly puedeRetroceder: boolean;

  /** `true` mientras `onAvanzar` está en curso (autosave de la fase 7). */
  readonly enviando: boolean;
  /** Mensaje de validación o de fallo de guardado de la pantalla actual. */
  readonly error: string | null;

  /** `true` si al avanzar se termina el formulario. Cambia la etiqueta del botón. */
  readonly esUltimoPaso: boolean;
  /** Número de la pregunta actual dentro del documento, `null` si no es pregunta. */
  readonly numeroPregunta: number | null;
  readonly totalPreguntas: number;
  readonly progreso: FormProgress;
}

const ContextoFormulario = createContext<ValorContextoFormulario | null>(null);

export const ProveedorFormulario = ContextoFormulario.Provider;

/** Acceso al estado del renderer. Falla pronto si se usa fuera del árbol. */
export function useFormulario(): ValorContextoFormulario {
  const valor = useContext(ContextoFormulario);
  if (valor === null) {
    throw new Error('useFormulario() debe usarse dentro de <RenderizadorFormulario>');
  }
  return valor;
}

/**
 * Identificadores ARIA derivados del identificador estable del bloque.
 *
 * Se calculan y no se generan al azar para que el editor pueda apuntar a ellos
 * (por ejemplo al enlazar un error de validación con su pregunta) y para que dos
 * renderizados del mismo documento produzcan el mismo DOM.
 */
export function idsDePantalla(bloqueId: string): {
  readonly titulo: string;
  readonly descripcion: string;
  readonly error: string;
  readonly control: string;
} {
  return {
    titulo: `tp-titulo-${bloqueId}`,
    descripcion: `tp-descripcion-${bloqueId}`,
    error: `tp-error-${bloqueId}`,
    control: `tp-control-${bloqueId}`,
  };
}

/**
 * Lista de `aria-describedby` sin huecos: descarta los identificadores que no
 * corresponden a ningún elemento pintado.
 */
export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const presentes = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return presentes.length > 0 ? presentes.join(' ') : undefined;
}
