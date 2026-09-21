/**
 * Documentos de formulario que usa la suite.
 *
 * Se escriben contra `FormDefinition` —el mismo tipo que valida la API y que
 * consume el renderer—, no contra una copia local: si el contrato cambia, esto
 * deja de compilar y el fallo aparece en `tsc`, no a mitad de un test.
 *
 * La importación es `import type`: en tiempo de ejecución no se arrastra nada de
 * `src/`, así que la suite nunca puede «pasar» porque comparta código con la
 * aplicación en vez de hablar con ella por HTTP.
 */

import type { FormDefinition, RatingAppearance, RatingScale, ThemeDefinition } from '@/lib/forms'

/** Tema neutro que cumple AA en todas las parejas que el formulario pinta. */
export const TEMA_BASE: ThemeDefinition = {
  colors: {
    background: '#ffffff',
    text: '#111827',
    controls: '#6b7280',
    buttons: '#111827',
    buttonText: '#ffffff',
    accent: '#2563eb',
  },
  typography: { fontFamily: 'inter', baseSize: 16, headingScale: 1.25 },
  borderRadius: 'md',
  buttonStyle: 'solid',
  contentAlignment: 'left',
  backgroundOverlayOpacity: 0,
}

/** Tema alternativo, para comprobar que el tema viaja al snapshot publicado. */
export const TEMA_ALTERNATIVO: ThemeDefinition = {
  colors: {
    background: '#0b1120',
    text: '#e2e8f0',
    controls: '#94a3b8',
    buttons: '#38bdf8',
    buttonText: '#04121f',
    accent: '#7dd3fc',
  },
  typography: { fontFamily: 'space-grotesk', baseSize: 18, headingScale: 1.4 },
  borderRadius: 'full',
  buttonStyle: 'pill',
  contentAlignment: 'center',
  backgroundOverlayOpacity: 0,
}

const AJUSTES = {
  showProgressBar: true,
  allowResume: true,
  showQuestionNumbers: false,
  notifyOnCompletion: true,
} as const;

/* -------------------------------------------------------------------------- */
/* Documento con bifurcación                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Recorrido con una bifurcación real y dos pantallas finales distintas.
 *
 * ```
 * bienvenida → perfil ─┬─ (equipo) → tamano → ending-equipo
 *                      └─ (solo)   ──────────→ ending-solo     (regla, prioridad 1)
 * ```
 *
 * Es el documento de los tests de lógica, de publicación y de resultados: tiene
 * dos caminos observables, un bloque que solo se visita en uno de ellos y una
 * pantalla final por rama, que es lo mínimo para que «el recorrido correcto» sea
 * una afirmación comprobable y no una impresión.
 */
export function documentoConBifurcacion(titulo: string, tema: ThemeDefinition = TEMA_BASE): FormDefinition {
  return {
    schemaVersion: 1,
    meta: { title: titulo, language: 'es', description: 'Documento de la suite end-to-end.' },
    theme: tema,
    blocks: [
      {
        id: 'bienvenida',
        type: 'welcome',
        title: 'Cuéntanos cómo trabajas',
        body: 'Dos preguntas rápidas.',
        buttonLabel: 'Empezar',
      },
      {
        id: 'perfil',
        type: 'single_choice',
        title: '¿Trabajas en equipo o por tu cuenta?',
        required: true,
        presentation: 'buttons',
        randomizeChoices: false,
        choices: [
          { id: 'op-equipo', label: 'En equipo', value: 'equipo' },
          { id: 'op-solo', label: 'Por mi cuenta', value: 'solo' },
        ],
      },
      {
        id: 'tamano',
        type: 'scale',
        title: '¿Cuántas personas sois?',
        required: true,
        min: 1,
        max: 10,
        step: 1,
        labels: { min: 'Pocas', max: 'Muchas' },
      },
      {
        id: 'comentario',
        type: 'long_text',
        title: '¿Algo más que quieras contarnos?',
        required: false,
        rows: 4,
        placeholder: 'Opcional',
      },
    ],
    rules: [
      {
        id: 'r-solo',
        sourceQuestionId: 'perfil',
        operator: 'equals',
        value: 'solo',
        priority: 1,
        target: { kind: 'end_screen', id: 'fin-solo' },
      },
    ],
    endScreens: [
      {
        id: 'fin-equipo',
        type: 'ending',
        title: 'Gracias por contarnos cómo trabaja tu equipo',
        body: 'Hemos guardado tu respuesta.',
      },
      {
        id: 'fin-solo',
        type: 'ending',
        title: 'Gracias por contarnos que trabajas por tu cuenta',
        body: 'Hemos guardado tu respuesta.',
      },
    ],
    defaultEndScreenId: 'fin-equipo',
    settings: AJUSTES,
  }
}

/**
 * Segunda versión del documento anterior.
 *
 * Cambia lo que más se nota en los resultados: reetiqueta una opción, añade una
 * pregunta al final y toca el tema. Nada de esto debe alterar ni una respuesta
 * de la versión 1 — que es exactamente el criterio de aceptación 7.
 */
export function documentoConBifurcacionV2(titulo: string): FormDefinition {
  const base = documentoConBifurcacion(titulo, TEMA_ALTERNATIVO)
  const [bienvenida, perfil, tamano, comentario] = base.blocks

  if (
    bienvenida === undefined ||
    perfil === undefined ||
    perfil.type !== 'single_choice' ||
    tamano === undefined ||
    comentario === undefined
  ) {
    throw new Error('El documento base ha cambiado de forma; revisa documentoConBifurcacionV2.')
  }

  return {
    ...base,
    meta: { ...base.meta, description: 'Segunda versión, con una pregunta más.' },
    blocks: [
      bienvenida,
      {
        ...perfil,
        title: '¿Cómo trabajas la mayor parte del tiempo?',
        choices: [
          { id: 'op-equipo', label: 'Con un equipo estable', value: 'equipo' },
          { id: 'op-solo', label: 'Por mi cuenta', value: 'solo' },
        ],
      },
      tamano,
      comentario,
      {
        id: 'herramienta',
        type: 'short_text',
        title: '¿Qué herramienta no cambiarías?',
        required: false,
        placeholder: 'Una sola',
        validation: { maxLength: 120 },
      },
    ],
  }
}

/* -------------------------------------------------------------------------- */
/* Documento de valoraciones                                                   */
/* -------------------------------------------------------------------------- */

interface EspecificacionValoracion {
  readonly id: string
  readonly titulo: string
  readonly appearance: RatingAppearance
  readonly scale: RatingScale
}

/** Las tres apariencias del bloque `rating`, cada una con una escala distinta. */
export const VALORACIONES: readonly EspecificacionValoracion[] = [
  { id: 'estrellas', titulo: 'Valóralo con estrellas', appearance: 'stars', scale: 5 },
  { id: 'caras', titulo: 'Valóralo con caras', appearance: 'faces', scale: 7 },
  { id: 'corazones', titulo: 'Valóralo con corazones', appearance: 'hearts', scale: 3 },
]

/**
 * Un formulario con las tres apariencias de valoración y tres escalas
 * distintas. Sirve para comprobar de una vez que las tres se pintan, se navegan
 * con teclado y producen valores comparables entre escalas.
 */
export function documentoDeValoraciones(titulo: string): FormDefinition {
  return {
    schemaVersion: 1,
    meta: { title: titulo, language: 'es' },
    theme: TEMA_BASE,
    blocks: VALORACIONES.map((valoracion) => ({
      id: valoracion.id,
      type: 'rating' as const,
      title: valoracion.titulo,
      required: true,
      appearance: valoracion.appearance,
      scale: valoracion.scale,
      labels: { min: 'Lo peor', max: 'Lo mejor' },
    })),
    rules: [],
    endScreens: [
      { id: 'fin', type: 'ending', title: 'Valoración registrada', body: 'Gracias.' },
    ],
    defaultEndScreenId: 'fin',
    settings: AJUSTES,
  }
}

/* -------------------------------------------------------------------------- */
/* Documento mínimo                                                            */
/* -------------------------------------------------------------------------- */

/** Lo más pequeño que se puede publicar: una pregunta y una pantalla final. */
export function documentoMinimo(titulo: string): FormDefinition {
  return {
    schemaVersion: 1,
    meta: { title: titulo, language: 'es' },
    theme: TEMA_BASE,
    blocks: [
      {
        id: 'nombre',
        type: 'short_text',
        title: '¿Cómo te llamas?',
        required: true,
        placeholder: 'Tu nombre',
      },
    ],
    rules: [],
    endScreens: [{ id: 'fin', type: 'ending', title: 'Hecho', body: 'Gracias.' }],
    defaultEndScreenId: 'fin',
    settings: AJUSTES,
  }
}

/**
 * Documento con una regla que salta **hacia atrás**. No es publicable: existe
 * para comprobar que el validador lo rechaza en lugar de crear un ciclo.
 */
export function documentoConCiclo(titulo: string): FormDefinition {
  return {
    schemaVersion: 1,
    meta: { title: titulo, language: 'es' },
    theme: TEMA_BASE,
    blocks: [
      {
        id: 'primera',
        type: 'short_text',
        title: 'Primera pregunta',
        required: false,
        placeholder: '',
      },
      {
        id: 'segunda',
        type: 'short_text',
        title: 'Segunda pregunta',
        required: false,
        placeholder: '',
      },
    ],
    rules: [
      {
        id: 'r-atras',
        sourceQuestionId: 'segunda',
        operator: 'is_not_empty',
        value: null,
        priority: 1,
        // Saltar de la segunda a la primera cerraría el grafo sobre sí mismo.
        target: { kind: 'block', id: 'primera' },
      },
    ],
    endScreens: [{ id: 'fin', type: 'ending', title: 'Hecho', body: 'Gracias.' }],
    defaultEndScreenId: 'fin',
    settings: AJUSTES,
  }
}
