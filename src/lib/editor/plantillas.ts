/**
 * Catálogo de bloques del editor.
 *
 * Traduce los once tipos del contrato a algo que se pueda pintar en un menú
 * («Texto corto», «Valoración visual»…) y sabe construir cada uno con valores
 * por defecto **ya válidos**: un bloque recién insertado tiene que pasar
 * `formDefinitionSchema` sin que el usuario toque nada, o el primer autosave
 * fallaría con un error incomprensible.
 *
 * Los defaults de zod no sirven para esto: el editor trabaja siempre con el
 * documento ya parseado (tipo de salida), donde `required`, `rows`,
 * `presentation`, `min`/`max`/`step`, `appearance` y `scale` son obligatorios.
 */

import {
  QUESTION_BLOCK_TYPES,
  type BlockType,
  type EndingBlock,
  type FlowBlockDefinition,
  type QuestionType,
} from '@/lib/forms';

import { nuevoId } from './ids';

/* -------------------------------------------------------------------------- */
/* Nombres                                                                     */
/* -------------------------------------------------------------------------- */

/** Nombre en español de cada tipo de bloque. */
export const NOMBRES_DE_TIPO: Readonly<Record<BlockType, string>> = {
  short_text: 'Texto corto',
  long_text: 'Texto largo',
  email: 'Correo electrónico',
  date: 'Fecha',
  single_choice: 'Selección única',
  multi_choice: 'Selección múltiple',
  scale: 'Escala numérica',
  rating: 'Valoración visual',
  statement: 'Declaración informativa',
  welcome: 'Pantalla de bienvenida',
  ending: 'Pantalla final',
};

/** Una línea de ayuda por tipo, para el menú de añadir. */
export const DESCRIPCIONES_DE_TIPO: Readonly<Record<BlockType, string>> = {
  short_text: 'Una respuesta breve en una sola línea.',
  long_text: 'Una respuesta larga en varias líneas.',
  email: 'Dirección de correo, validada al escribir.',
  date: 'Una fecha, con mínimo y máximo opcionales.',
  single_choice: 'Elegir una opción entre varias.',
  multi_choice: 'Elegir varias opciones a la vez.',
  scale: 'Un número dentro de un rango configurable.',
  rating: 'Estrellas, caras o corazones sobre 3, 5, 7 o 10.',
  statement: 'Texto informativo, sin respuesta.',
  welcome: 'Primera pantalla del formulario, sin respuesta.',
  ending: 'Pantalla de cierre del recorrido.',
};

/** Grupos del menú de añadir bloque. */
export type GrupoDePlantilla = 'pregunta' | 'pantalla';

export interface PlantillaDeBloque {
  readonly tipo: Exclude<BlockType, 'ending'>;
  readonly nombre: string;
  readonly descripcion: string;
  readonly grupo: GrupoDePlantilla;
}

/** Los diez tipos que ocupan una posición en el recorrido. `ending` va aparte. */
export const PLANTILLAS: readonly PlantillaDeBloque[] = [
  ...QUESTION_BLOCK_TYPES.map(
    (tipo): PlantillaDeBloque => ({
      tipo,
      nombre: NOMBRES_DE_TIPO[tipo],
      descripcion: DESCRIPCIONES_DE_TIPO[tipo],
      grupo: 'pregunta',
    }),
  ),
  {
    tipo: 'statement',
    nombre: NOMBRES_DE_TIPO.statement,
    descripcion: DESCRIPCIONES_DE_TIPO.statement,
    grupo: 'pantalla',
  },
  {
    tipo: 'welcome',
    nombre: NOMBRES_DE_TIPO.welcome,
    descripcion: DESCRIPCIONES_DE_TIPO.welcome,
    grupo: 'pantalla',
  },
];

/* -------------------------------------------------------------------------- */
/* Construcción                                                                */
/* -------------------------------------------------------------------------- */

/** Título inicial de un bloque nuevo, en español y editable de inmediato. */
const TITULOS_INICIALES: Readonly<Record<BlockType, string>> = {
  short_text: '¿Cómo te llamas?',
  long_text: 'Cuéntanos con detalle',
  email: '¿Cuál es tu correo electrónico?',
  date: '¿Qué día te viene bien?',
  single_choice: 'Elige una opción',
  multi_choice: 'Elige todas las que quieras',
  scale: 'Del 1 al 10, ¿cómo lo valoras?',
  rating: '¿Qué te ha parecido?',
  statement: 'Un apunte antes de seguir',
  welcome: '¡Hola!',
  ending: '¡Gracias!',
};

/** Dos opciones de partida: una sola no permitiría ninguna bifurcación. */
function opcionesIniciales(ocupados: Set<string>) {
  return [1, 2].map((numero) => {
    const id = nuevoId('op', ocupados);
    ocupados.add(id);
    return { id, label: `Opción ${String(numero)}`, value: `opcion-${String(numero)}` };
  });
}

/**
 * Crea un bloque del recorrido con valores por defecto válidos.
 *
 * @param ocupados Identificadores ya usados en el documento (bloques, opciones,
 *   pantallas y reglas): el nuevo no puede chocar con ninguno.
 */
export function crearBloque(
  tipo: Exclude<BlockType, 'ending'>,
  ocupados: Iterable<string> = [],
): FlowBlockDefinition {
  const usados = new Set(ocupados);
  const id = nuevoId('b', usados);
  usados.add(id);
  const base = { id, title: TITULOS_INICIALES[tipo] };

  switch (tipo) {
    case 'short_text':
      return { ...base, type: 'short_text', required: false };
    case 'long_text':
      return { ...base, type: 'long_text', required: false, rows: 4 };
    case 'email':
      return { ...base, type: 'email', required: false };
    case 'date':
      return { ...base, type: 'date', required: false };
    case 'single_choice':
      return {
        ...base,
        type: 'single_choice',
        required: false,
        choices: opcionesIniciales(usados),
        presentation: 'list',
        randomizeChoices: false,
      };
    case 'multi_choice':
      return {
        ...base,
        type: 'multi_choice',
        required: false,
        choices: opcionesIniciales(usados),
        presentation: 'list',
        randomizeChoices: false,
      };
    case 'scale':
      return { ...base, type: 'scale', required: false, min: 1, max: 10, step: 1 };
    case 'rating':
      return { ...base, type: 'rating', required: false, appearance: 'stars', scale: 5 };
    case 'statement':
      return { ...base, type: 'statement', buttonLabel: 'Continuar' };
    case 'welcome':
      return { ...base, type: 'welcome', buttonLabel: 'Empezar' };
  }
}

/** Crea una pantalla final. Vive en `endScreens`, nunca en `blocks`. */
export function crearPantallaFinal(ocupados: Iterable<string> = []): EndingBlock {
  return {
    id: nuevoId('fin', ocupados),
    type: 'ending',
    title: TITULOS_INICIALES.ending,
    body: 'Hemos recibido tu respuesta.',
  };
}

/** Crea una opción de selección con identificador libre. */
export function crearOpcion(ocupados: Iterable<string> = [], numero = 1) {
  return {
    id: nuevoId('op', ocupados),
    label: `Opción ${String(numero)}`,
    value: `opcion-${String(numero)}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Conversión entre tipos                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cambia el tipo de un bloque conservando lo que sigue teniendo sentido:
 * identificador (para no romper las reglas que lo apuntan), título,
 * descripción, imagen y obligatoriedad.
 *
 * Lo que no sobrevive —opciones, rangos, validaciones— se pierde a propósito:
 * arrastrarlo produciría documentos que el validador rechaza.
 */
export function convertirBloque(
  bloque: FlowBlockDefinition,
  tipo: Exclude<BlockType, 'ending'>,
  ocupados: Iterable<string> = [],
): FlowBlockDefinition {
  if (bloque.type === tipo) return bloque;

  const usados = new Set(ocupados);
  usados.delete(bloque.id);
  const plantilla = crearBloque(tipo, usados);
  const obligatorio = 'required' in bloque ? bloque.required : false;

  const comun = {
    id: bloque.id,
    title: bloque.title,
    ...(bloque.description === undefined ? {} : { description: bloque.description }),
    ...(bloque.mediaAssetId === undefined ? {} : { mediaAssetId: bloque.mediaAssetId }),
  };

  return 'required' in plantilla
    ? { ...plantilla, ...comun, required: obligatorio }
    : { ...plantilla, ...comun };
}

/** `true` si el tipo recoge respuesta y, por tanto, puede originar reglas. */
export function esTipoDePregunta(tipo: BlockType): tipo is QuestionType {
  return (QUESTION_BLOCK_TYPES as readonly BlockType[]).includes(tipo);
}
