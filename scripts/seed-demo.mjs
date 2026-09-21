#!/usr/bin/env node
/**
 * Datos de demostración.
 *
 * Un repositorio recién clonado enseña un panel vacío, y un panel vacío no
 * permite ver si el editor, la lógica, el versionado o los resultados funcionan.
 * Este script siembra tres formularios con tema propio, lógica condicional,
 * ocho tipos de bloque distintos, dos versiones publicadas en uno de ellos y
 * respuestas repartidas entre sesiones completadas, abandonadas y en curso.
 *
 * Uso:
 *   node scripts/seed-demo.mjs            # siembra (o refresca) la demostración
 *   node scripts/seed-demo.mjs --limpiar  # la borra por completo
 *
 * **Idempotente.** Todos los identificadores son deterministas: se derivan por
 * SHA-1 de una etiqueta estable, así que cada ejecución escribe exactamente
 * sobre las mismas filas. Repetirlo no duplica formularios, ni versiones, ni
 * sesiones, ni respuestas: el recuento de filas es idéntico tras la segunda
 * pasada. Lo único que se refresca son las marcas de tiempo, para que la
 * demostración no envejezca y las sesiones «en curso» sigan siéndolo.
 *
 * **No toca nada que no sea suyo.** Todo cuelga de tres slugs con prefijo
 * `demo-` y de un usuario `demostracion@typeapromo.local`; el borrado se limita
 * a esos identificadores.
 *
 * No importa nada de `src/`: es un script de Node y ahí vive TypeScript. Los
 * documentos van escritos a mano contra el mismo contrato que valida
 * `formDefinitionSchema` (`schemaVersion: 1`).
 */
import crypto from 'node:crypto'
import process from 'node:process'

import pg from 'pg'

/* -------------------------------------------------------------------------- */
/* Identificadores deterministas                                               */
/* -------------------------------------------------------------------------- */

/** UUID v4 (en forma, no en origen) derivado de una etiqueta. Estable entre ejecuciones. */
function uuidDe(etiqueta) {
  const h = crypto.createHash('sha1').update(`typeapromo:demo:${etiqueta}`).digest('hex')
  const variante = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    `${variante}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join('-')
}

/** SHA-256 del token de una sesión de demostración. En la tabla nunca va el token. */
function hashDeToken(etiqueta) {
  return crypto.createHash('sha256').update(`typeapromo:demo:token:${etiqueta}`).digest('hex')
}

const AHORA = Date.now()
const MINUTO = 60_000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

/** Instante relativo a la ejecución, para que la demostración no envejezca. */
function hace(ms) {
  return new Date(AHORA - ms)
}

/* -------------------------------------------------------------------------- */
/* Identidad                                                                   */
/* -------------------------------------------------------------------------- */

const USUARIO = {
  id: uuidDe('usuario'),
  email: 'demostracion@typeapromo.local',
  nombre: 'Equipo de demostración',
}

const WORKSPACE_DEMO = {
  id: uuidDe('workspace'),
  name: 'Espacio de demostración',
  slug: 'demo-workspace',
  plan: 'pro',
  planStatus: 'active',
}

/* -------------------------------------------------------------------------- */
/* Temas                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Los tres temas cumplen AA sobre texto normal en todas las parejas que el
 * formulario pinta de verdad; si no, el panel de tema del editor abriría la
 * demostración con advertencias de accesibilidad.
 */
const TEMA_CALIDO = {
  colors: {
    background: '#fffaf3',
    text: '#3f2d1c',
    controls: '#8a6a48',
    buttons: '#9a3412',
    buttonText: '#ffffff',
    accent: '#b45309',
  },
  typography: { fontFamily: 'dm-sans', baseSize: 17, headingScale: 1.3 },
  borderRadius: 'lg',
  buttonStyle: 'pill',
  contentAlignment: 'center',
  backgroundOverlayOpacity: 0,
}

const TEMA_SOBRIO = {
  colors: {
    background: '#f8fafc',
    text: '#0f172a',
    controls: '#64748b',
    buttons: '#1d4ed8',
    buttonText: '#ffffff',
    accent: '#1d4ed8',
  },
  typography: { fontFamily: 'inter', baseSize: 16, headingScale: 1.25 },
  borderRadius: 'md',
  buttonStyle: 'solid',
  contentAlignment: 'left',
  backgroundOverlayOpacity: 0,
}

const TEMA_NOCTURNO = {
  colors: {
    background: '#0b1120',
    text: '#e2e8f0',
    controls: '#94a3b8',
    buttons: '#38bdf8',
    buttonText: '#04121f',
    accent: '#7dd3fc',
  },
  typography: { fontFamily: 'space-grotesk', baseSize: 16, headingScale: 1.35 },
  borderRadius: 'sm',
  buttonStyle: 'outline',
  contentAlignment: 'left',
  backgroundOverlayOpacity: 0,
}

const AJUSTES = { showProgressBar: true, allowResume: true, showQuestionNumbers: false }

/* -------------------------------------------------------------------------- */
/* Documento 1 · Satisfacción del taller (dos versiones publicadas)            */
/* -------------------------------------------------------------------------- */

const TALLER_BIENVENIDA = {
  id: 'bienvenida',
  type: 'welcome',
  title: 'El taller ha terminado',
  body: 'Dos minutos de tu tiempo y el próximo sale mejor. No pedimos ningún dato personal.',
  buttonLabel: 'Empezar',
}

const TALLER_VALORACION = {
  id: 'valoracion',
  type: 'rating',
  title: '¿Cómo valorarías el taller?',
  description: 'Puedes usar las flechas del teclado o escribir el número directamente.',
  required: true,
  appearance: 'stars',
  scale: 5,
  labels: { min: 'Muy flojo', max: 'Excelente' },
}

const TALLER_RECOMENDARIAS = {
  id: 'recomendarias',
  type: 'single_choice',
  title: '¿Se lo recomendarías a alguien del equipo?',
  required: true,
  presentation: 'buttons',
  randomizeChoices: false,
  choices: [
    { id: 'op-si', label: 'Sí, sin dudarlo', value: 'si' },
    { id: 'op-quiza', label: 'Según a quién', value: 'quiza' },
    { id: 'op-no', label: 'Prefiero no hacerlo', value: 'no' },
  ],
}

const TALLER_QUE_MEJORAR = {
  id: 'que-mejorar',
  type: 'long_text',
  title: '¿Qué cambiarías del taller?',
  description: 'Cuanto más concreto, más fácil de arreglar.',
  required: false,
  rows: 5,
  placeholder: 'Por ejemplo: más tiempo para la parte práctica.',
  validation: { maxLength: 1200 },
}

const TALLER_MOMENTO = {
  id: 'momento-favorito',
  type: 'short_text',
  title: '¿Con qué momento te quedas?',
  required: false,
  placeholder: 'Una frase basta',
  validation: { maxLength: 200 },
}

const TALLER_FINAL_GRACIAS = {
  id: 'fin-gracias',
  type: 'ending',
  title: '¡Gracias!',
  body: 'Lo leemos todo antes de preparar la siguiente edición.',
}

const TALLER_FINAL_PENA = {
  id: 'fin-pena',
  type: 'ending',
  title: 'Gracias por decírnoslo',
  body: 'Que no lo recomiendes es la respuesta más útil que podíamos recibir. Nos ponemos con ello.',
}

/**
 * Dos reglas, cada una demostrando una cosa distinta:
 *
 * - `r-valoracion-alta` salta hacia adelante y se **salta** la pregunta de
 *   mejora: a quien le ha encantado no se le pregunta qué arreglaría.
 * - `r-no-recomienda` desvía a una pantalla final propia.
 */
const TALLER_REGLAS = [
  {
    id: 'r-valoracion-alta',
    sourceQuestionId: 'valoracion',
    operator: 'greater_or_equal',
    value: 4,
    priority: 1,
    target: { kind: 'block', id: 'momento-favorito' },
  },
  {
    id: 'r-no-recomienda',
    sourceQuestionId: 'recomendarias',
    operator: 'equals',
    value: 'no',
    priority: 1,
    target: { kind: 'end_screen', id: 'fin-pena' },
  },
]

const TALLER_V1 = {
  schemaVersion: 1,
  meta: {
    title: 'Satisfacción del taller',
    description: 'Encuesta corta al terminar cada edición del taller interno.',
    language: 'es',
    closedMessage: 'Esta edición ya está cerrada. ¡Nos vemos en la siguiente!',
  },
  theme: TEMA_CALIDO,
  blocks: [
    TALLER_BIENVENIDA,
    TALLER_VALORACION,
    TALLER_RECOMENDARIAS,
    TALLER_QUE_MEJORAR,
    TALLER_MOMENTO,
  ],
  rules: TALLER_REGLAS,
  endScreens: [TALLER_FINAL_GRACIAS, TALLER_FINAL_PENA],
  defaultEndScreenId: 'fin-gracias',
  settings: AJUSTES,
}

/**
 * Versión 2: añade una pregunta al final y reetiqueta una opción. Las
 * respuestas de la versión 1 siguen leyéndose contra **su** snapshot, que es lo
 * que hace que el histórico no se mueva al publicar de nuevo.
 */
const TALLER_V2 = {
  ...TALLER_V1,
  blocks: [
    TALLER_BIENVENIDA,
    TALLER_VALORACION,
    {
      ...TALLER_RECOMENDARIAS,
      choices: [
        { id: 'op-si', label: 'Sí, ya se lo he dicho a alguien', value: 'si' },
        { id: 'op-quiza', label: 'Según a quién', value: 'quiza' },
        { id: 'op-no', label: 'Prefiero no hacerlo', value: 'no' },
      ],
    },
    TALLER_QUE_MEJORAR,
    TALLER_MOMENTO,
    {
      id: 'canal',
      type: 'single_choice',
      title: '¿Cómo te enteraste del taller?',
      required: false,
      presentation: 'list',
      randomizeChoices: false,
      choices: [
        { id: 'op-slack', label: 'Por Slack', value: 'slack' },
        { id: 'op-companero', label: 'Me lo dijo alguien del equipo', value: 'companero' },
        { id: 'op-calendario', label: 'Lo vi en el calendario', value: 'calendario' },
      ],
    },
  ],
}

/* -------------------------------------------------------------------------- */
/* Documento 2 · Alta en el evento de otoño                                    */
/* -------------------------------------------------------------------------- */

const EVENTO_V1 = {
  schemaVersion: 1,
  meta: {
    title: 'Alta en el evento de otoño',
    description: 'Formulario de inscripción con datos de contacto y preferencias.',
    language: 'es',
    closedMessage: 'Las inscripciones están cerradas. Escríbenos si te has quedado fuera.',
  },
  theme: TEMA_SOBRIO,
  blocks: [
    {
      id: 'bienvenida',
      type: 'welcome',
      title: 'Evento de otoño',
      body: 'Un minuto para apuntarte. Puedes cerrar y volver: se guarda por el camino.',
      buttonLabel: 'Apuntarme',
    },
    {
      id: 'nombre',
      type: 'short_text',
      title: '¿Cómo te llamas?',
      required: true,
      placeholder: 'Nombre y apellidos',
      validation: { minLength: 2, maxLength: 120 },
    },
    {
      id: 'correo',
      type: 'email',
      title: '¿A qué correo te mandamos la confirmación?',
      required: true,
      placeholder: 'nombre@ejemplo.com',
    },
    {
      id: 'llegada',
      type: 'date',
      title: '¿Qué día llegas?',
      required: false,
      validation: { min: '2026-10-01', max: '2026-10-31' },
    },
    {
      id: 'intereses',
      type: 'multi_choice',
      title: '¿Qué sesiones te interesan?',
      description: 'Elige todas las que quieras; nos sirve para dimensionar las salas.',
      required: true,
      presentation: 'buttons',
      randomizeChoices: false,
      minSelections: 1,
      choices: [
        { id: 'op-taller', label: 'Taller práctico', value: 'taller' },
        { id: 'op-charla', label: 'Charlas cortas', value: 'charla' },
        { id: 'op-mesa', label: 'Mesa redonda', value: 'mesa' },
        { id: 'op-red', label: 'Rato de networking', value: 'red' },
      ],
    },
    {
      id: 'expectativa',
      type: 'scale',
      title: 'Del 0 al 10, ¿cuántas ganas tienes?',
      required: false,
      min: 0,
      max: 10,
      step: 1,
      labels: { min: 'Vengo por compromiso', max: 'Contando los días' },
    },
    {
      id: 'aviso',
      type: 'statement',
      title: 'Una última cosa',
      body: 'Habrá comida y opciones vegetarianas. Si tienes alguna alergia, dínoslo por Slack.',
      buttonLabel: 'Entendido',
    },
  ],
  rules: [
    {
      id: 'r-poca-gana',
      sourceQuestionId: 'expectativa',
      operator: 'less_or_equal',
      value: 3,
      priority: 1,
      target: { kind: 'end_screen', id: 'fin-tibio' },
    },
  ],
  endScreens: [
    {
      id: 'fin-apuntado',
      type: 'ending',
      title: 'Ya estás dentro',
      body: 'Te llega la confirmación por correo en unos minutos.',
      ctaLabel: 'Ver el programa',
      ctaUrl: 'https://example.com/programa',
    },
    {
      id: 'fin-tibio',
      type: 'ending',
      title: 'Apuntado, con reservas',
      body: 'Te hemos apuntado igual. Si algo no te convence, cuéntanoslo por Slack.',
    },
  ],
  defaultEndScreenId: 'fin-apuntado',
  settings: { showProgressBar: true, allowResume: true, showQuestionNumbers: true },
}

/* -------------------------------------------------------------------------- */
/* Documento 3 · NPS trimestral (solo borrador, nunca publicado)               */
/* -------------------------------------------------------------------------- */

const NPS_BORRADOR = {
  schemaVersion: 1,
  meta: {
    title: 'NPS trimestral (borrador)',
    description: 'Sin publicar todavía: sirve para ver el editor con trabajo a medias.',
    language: 'es',
  },
  theme: TEMA_NOCTURNO,
  blocks: [
    {
      id: 'bienvenida',
      type: 'welcome',
      title: 'Tres preguntas y ya',
      body: 'Anónimo de verdad: no guardamos ni la dirección IP.',
      buttonLabel: 'Vamos',
    },
    {
      id: 'animo',
      type: 'rating',
      title: '¿Cómo has llegado a este trimestre?',
      required: true,
      appearance: 'faces',
      scale: 7,
      labels: { min: 'Agotado', max: 'Con energía' },
    },
    {
      id: 'recomendacion',
      type: 'scale',
      title: 'Del 0 al 10, ¿recomendarías trabajar aquí?',
      required: true,
      min: 0,
      max: 10,
      step: 1,
      labels: { min: 'En absoluto', max: 'Sin dudarlo' },
    },
    {
      id: 'porque',
      type: 'long_text',
      title: '¿Por qué esa nota?',
      required: false,
      rows: 4,
      placeholder: 'Lo que quieras contar',
    },
  ],
  rules: [],
  endScreens: [
    {
      id: 'fin',
      type: 'ending',
      title: 'Gracias',
      body: 'Lo resumimos sin nombres en la próxima reunión general.',
    },
  ],
  defaultEndScreenId: 'fin',
  settings: { showProgressBar: false, allowResume: true, showQuestionNumbers: false },
}

/* -------------------------------------------------------------------------- */
/* Catálogo                                                                    */
/* -------------------------------------------------------------------------- */

const FORMULARIOS = [
  {
    clave: 'taller',
    slug: 'demo-satisfaccion-taller',
    titulo: 'Satisfacción del taller',
    estado: 'published',
    creadoHace: 21 * DIA,
    versiones: [
      { numero: 1, definicion: TALLER_V1, publicadoHace: 18 * DIA },
      { numero: 2, definicion: TALLER_V2, publicadoHace: 5 * DIA },
    ],
    /** El borrador vivo es la última versión publicada más un retoque sin publicar. */
    borrador: {
      ...TALLER_V2,
      meta: { ...TALLER_V2.meta, description: 'Encuesta corta al terminar cada edición. Pendiente: añadir la pregunta de duración.' },
    },
    revision: 7,
    versionActiva: 2,
  },
  {
    clave: 'evento',
    slug: 'demo-alta-evento',
    titulo: 'Alta en el evento de otoño',
    estado: 'published',
    creadoHace: 9 * DIA,
    versiones: [{ numero: 1, definicion: EVENTO_V1, publicadoHace: 8 * DIA }],
    borrador: EVENTO_V1,
    revision: 3,
    versionActiva: 1,
  },
  {
    clave: 'nps',
    slug: 'demo-nps-trimestral',
    titulo: 'NPS trimestral (borrador)',
    estado: 'draft',
    creadoHace: 2 * DIA,
    versiones: [],
    borrador: NPS_BORRADOR,
    revision: 2,
    versionActiva: null,
  },
]

/* -------------------------------------------------------------------------- */
/* Sesiones y respuestas                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Cada sesión declara su recorrido real: solo se guardan respuestas de las
 * preguntas por las que se pasó de verdad, de modo que la lógica condicional se
 * note en los resultados (quien puntúa 4 o 5 no tiene fila en «¿Qué cambiarías?»).
 *
 * `estado`:
 * - `completada` — con `completed_at`.
 * - `abandonada` — sin terminar y sin actividad desde hace más de 30 minutos.
 *   No es una columna: el panel lo deriva en consulta.
 * - `en_curso`   — sin terminar pero con actividad reciente.
 */
const SESIONES = [
  /* --- Satisfacción del taller · versión 1 ------------------------------- */
  {
    clave: 'taller-v1-a',
    formulario: 'taller',
    version: 1,
    estado: 'completada',
    iniciadaHace: 17 * DIA,
    duracionMs: 3 * MINUTO,
    pantallaFinal: 'fin-gracias',
    respuestas: [
      ['valoracion', 'rating', 5],
      ['momento-favorito', 'short_text', 'La parte de preguntas al final.'],
    ],
  },
  {
    clave: 'taller-v1-b',
    formulario: 'taller',
    version: 1,
    estado: 'completada',
    iniciadaHace: 16 * DIA,
    duracionMs: 5 * MINUTO,
    pantallaFinal: 'fin-pena',
    respuestas: [
      ['valoracion', 'rating', 2],
      ['recomendarias', 'single_choice', 'no'],
    ],
  },
  {
    clave: 'taller-v1-c',
    formulario: 'taller',
    version: 1,
    estado: 'completada',
    iniciadaHace: 15 * DIA,
    duracionMs: 6 * MINUTO,
    pantallaFinal: 'fin-gracias',
    respuestas: [
      ['valoracion', 'rating', 3],
      ['recomendarias', 'single_choice', 'quiza'],
      ['que-mejorar', 'long_text', 'Demasiada teoría al principio; empezaría por el ejercicio.'],
      ['momento-favorito', 'short_text', 'El ejercicio en parejas.'],
    ],
  },
  {
    clave: 'taller-v1-d',
    formulario: 'taller',
    version: 1,
    estado: 'abandonada',
    iniciadaHace: 14 * DIA,
    duracionMs: 40_000,
    pantallaActual: 'recomendarias',
    respuestas: [['valoracion', 'rating', 3]],
  },
  {
    clave: 'taller-v1-e',
    formulario: 'taller',
    version: 1,
    estado: 'completada',
    iniciadaHace: 12 * DIA,
    duracionMs: 2 * MINUTO,
    pantallaFinal: 'fin-gracias',
    respuestas: [
      ['valoracion', 'rating', 4],
      ['momento-favorito', 'short_text', 'Que terminó a su hora.'],
    ],
  },

  /* --- Satisfacción del taller · versión 2 ------------------------------- */
  {
    clave: 'taller-v2-a',
    formulario: 'taller',
    version: 2,
    estado: 'completada',
    iniciadaHace: 4 * DIA,
    duracionMs: 4 * MINUTO,
    pantallaFinal: 'fin-gracias',
    respuestas: [
      ['valoracion', 'rating', 5],
      ['momento-favorito', 'short_text', 'El café de media mañana, seamos sinceros.'],
      ['canal', 'single_choice', 'slack'],
    ],
  },
  {
    clave: 'taller-v2-b',
    formulario: 'taller',
    version: 2,
    estado: 'completada',
    iniciadaHace: 3 * DIA,
    duracionMs: 7 * MINUTO,
    pantallaFinal: 'fin-gracias',
    respuestas: [
      ['valoracion', 'rating', 2],
      ['recomendarias', 'single_choice', 'quiza'],
      ['que-mejorar', 'long_text', 'La sala se quedaba pequeña y no se oía bien desde el fondo.'],
      ['momento-favorito', 'short_text', 'Nada en concreto.'],
      ['canal', 'single_choice', 'companero'],
    ],
  },
  {
    clave: 'taller-v2-c',
    formulario: 'taller',
    version: 2,
    estado: 'en_curso',
    iniciadaHace: 4 * MINUTO,
    duracionMs: 2 * MINUTO,
    pantallaActual: 'momento-favorito',
    respuestas: [['valoracion', 'rating', 4]],
  },

  /* --- Alta en el evento ------------------------------------------------- */
  {
    clave: 'evento-a',
    formulario: 'evento',
    version: 1,
    estado: 'completada',
    iniciadaHace: 6 * DIA,
    duracionMs: 3 * MINUTO,
    pantallaFinal: 'fin-apuntado',
    respuestas: [
      ['nombre', 'short_text', 'Marta Ibáñez'],
      ['correo', 'email', 'marta.ibanez@example.com'],
      ['llegada', 'date', '2026-10-14'],
      ['intereses', 'multi_choice', ['taller', 'red']],
      ['expectativa', 'scale', 9],
    ],
  },
  {
    clave: 'evento-b',
    formulario: 'evento',
    version: 1,
    estado: 'completada',
    iniciadaHace: 5 * DIA,
    duracionMs: 4 * MINUTO,
    pantallaFinal: 'fin-tibio',
    respuestas: [
      ['nombre', 'short_text', 'Rubén Otero'],
      ['correo', 'email', 'ruben.otero@example.com'],
      ['llegada', 'date', '2026-10-15'],
      ['intereses', 'multi_choice', ['charla']],
      ['expectativa', 'scale', 2],
    ],
  },
  {
    clave: 'evento-c',
    formulario: 'evento',
    version: 1,
    estado: 'completada',
    iniciadaHace: 2 * DIA,
    duracionMs: 5 * MINUTO,
    pantallaFinal: 'fin-apuntado',
    respuestas: [
      ['nombre', 'short_text', 'Lucía Ferrer'],
      ['correo', 'email', 'lucia.ferrer@example.com'],
      ['llegada', 'date', '2026-10-14'],
      ['intereses', 'multi_choice', ['taller', 'charla', 'mesa']],
      ['expectativa', 'scale', 7],
    ],
  },
  {
    clave: 'evento-d',
    formulario: 'evento',
    version: 1,
    estado: 'abandonada',
    iniciadaHace: 1 * DIA,
    duracionMs: 25_000,
    pantallaActual: 'correo',
    respuestas: [['nombre', 'short_text', 'Pablo']],
  },
  {
    clave: 'evento-e',
    formulario: 'evento',
    version: 1,
    estado: 'abandonada',
    iniciadaHace: 20 * HORA,
    duracionMs: 90_000,
    pantallaActual: 'intereses',
    respuestas: [
      ['nombre', 'short_text', 'Nerea Sanz'],
      ['correo', 'email', 'nerea.sanz@example.com'],
      ['llegada', null, null],
    ],
  },
  {
    clave: 'evento-f',
    formulario: 'evento',
    version: 1,
    estado: 'en_curso',
    iniciadaHace: 6 * MINUTO,
    duracionMs: 3 * MINUTO,
    pantallaActual: 'expectativa',
    respuestas: [
      ['nombre', 'short_text', 'Iván Lucas'],
      ['correo', 'email', 'ivan.lucas@example.com'],
      ['llegada', 'date', '2026-10-16'],
      ['intereses', 'multi_choice', ['red']],
    ],
  },
]

/** Tipo real del bloque cuando la respuesta se guardó en blanco. */
const TIPO_POR_PREGUNTA = {
  llegada: 'date',
}

/* -------------------------------------------------------------------------- */
/* Escritura                                                                   */
/* -------------------------------------------------------------------------- */

function idFormulario(clave) {
  return uuidDe(`form:${clave}`)
}

function idBorrador(clave) {
  return uuidDe(`draft:${clave}`)
}

function idVersion(clave, numero) {
  return uuidDe(`version:${clave}:${numero}`)
}

function idSesion(clave) {
  return uuidDe(`sesion:${clave}`)
}

function idRespuesta(claveSesion, questionId) {
  return uuidDe(`answer:${claveSesion}:${questionId}`)
}

async function sembrarUsuario(cliente) {
  await cliente.query(
    `insert into workspaces (id, name, slug, plan, plan_status, created_at, updated_at)
     values ($1, $2, $3, $4, $5, now(), now())
     on conflict (slug) do update
       set name = excluded.name, updated_at = now()`,
    [
      WORKSPACE_DEMO.id,
      WORKSPACE_DEMO.name,
      WORKSPACE_DEMO.slug,
      WORKSPACE_DEMO.plan,
      WORKSPACE_DEMO.planStatus,
    ],
  )

  await cliente.query(
    `insert into users (id, email, name, email_verified, is_active, created_at, updated_at)
     values ($1, $2, $3, now(), true, now(), now())
     on conflict (email) do update
       set id = excluded.id, name = excluded.name, updated_at = now()`,
    [USUARIO.id, USUARIO.email, USUARIO.nombre],
  )

  await cliente.query(
    `insert into workspace_members (workspace_id, user_id, role, created_at)
     values ($1, $2, 'owner', now())
     on conflict (workspace_id, user_id) do nothing`,
    [WORKSPACE_DEMO.id, USUARIO.id],
  )

  await cliente.query(
    `insert into workspace_members (workspace_id, user_id, role, created_at)
     select $1, id, 'owner', now() from users where email = 'desarrollo@typeapromo.local'
     on conflict (workspace_id, user_id) do nothing`,
    [WORKSPACE_DEMO.id],
  )
}

async function sembrarFormulario(cliente, formulario) {
  const formId = idFormulario(formulario.clave)
  const creado = hace(formulario.creadoHace)

  // `active_version_id` se deja a null en este paso: las versiones todavía no
  // existen y la clave foránea es real.
  await cliente.query(
    `insert into forms (id, workspace_id, slug, title, status, created_by, active_version_id, created_at, updated_at)
     values ($1, $2, $3, $4, $5::form_status, $6, null, $7, $8)
     on conflict (id) do update
       set workspace_id = excluded.workspace_id,
           slug = excluded.slug,
           title = excluded.title,
           status = excluded.status,
           created_by = excluded.created_by,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
    [
      formId,
      WORKSPACE_DEMO.id,
      formulario.slug,
      formulario.titulo,
      formulario.estado,
      USUARIO.id,
      creado,
      hace(formulario.creadoHace - HORA),
    ],
  )

  await cliente.query(
    `insert into form_drafts (id, form_id, definition, revision, updated_by, created_at, updated_at)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7)
     on conflict (form_id) do update
       set id = excluded.id,
           definition = excluded.definition,
           revision = excluded.revision,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
    [
      idBorrador(formulario.clave),
      formId,
      JSON.stringify(formulario.borrador),
      formulario.revision,
      USUARIO.id,
      creado,
      hace(Math.max(formulario.creadoHace - 2 * HORA, HORA)),
    ],
  )

  for (const version of formulario.versiones) {
    await cliente.query(
      `insert into form_versions (id, form_id, version_number, definition, schema_version, published_by, published_at)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7)
       on conflict (id) do update
         set definition = excluded.definition,
             schema_version = excluded.schema_version,
             published_by = excluded.published_by,
             published_at = excluded.published_at`,
      [
        idVersion(formulario.clave, version.numero),
        formId,
        version.numero,
        JSON.stringify(version.definicion),
        version.definicion.schemaVersion,
        USUARIO.id,
        hace(version.publicadoHace),
      ],
    )
  }

  if (formulario.versionActiva !== null) {
    await cliente.query('update forms set active_version_id = $2 where id = $1', [
      formId,
      idVersion(formulario.clave, formulario.versionActiva),
    ])
  }
}

async function sembrarSesion(cliente, sesion) {
  const formulario = FORMULARIOS.find((f) => f.clave === sesion.formulario)
  if (formulario === undefined) {
    throw new Error(`La sesión «${sesion.clave}» apunta a un formulario inexistente.`)
  }

  const formId = idFormulario(formulario.clave)
  const versionId = idVersion(formulario.clave, sesion.version)
  const sessionId = idSesion(sesion.clave)

  const iniciada = hace(sesion.iniciadaHace)
  const ultimaActividad = new Date(iniciada.getTime() + sesion.duracionMs)
  const completada = sesion.estado === 'completada' ? ultimaActividad : null
  const estado = sesion.estado === 'completada' ? 'completed' : 'in_progress'
  const pantalla =
    sesion.estado === 'completada' ? (sesion.pantallaFinal ?? null) : (sesion.pantallaActual ?? null)

  const conValor = sesion.respuestas.filter(([, , valor]) => valor !== null)

  await cliente.query(
    `insert into response_sessions
       (id, form_id, version_id, token_hash, status, current_question_id, answered_count,
        started_at, last_activity_at, completed_at)
     values ($1, $2, $3, $4, $5::response_session_status, $6, $7, $8, $9, $10)
     on conflict (id) do update
       set form_id = excluded.form_id,
           version_id = excluded.version_id,
           token_hash = excluded.token_hash,
           status = excluded.status,
           current_question_id = excluded.current_question_id,
           answered_count = excluded.answered_count,
           started_at = excluded.started_at,
           last_activity_at = excluded.last_activity_at,
           completed_at = excluded.completed_at`,
    [
      sessionId,
      formId,
      versionId,
      hashDeToken(sesion.clave),
      estado,
      pantalla,
      conValor.length,
      iniciada,
      ultimaActividad,
      completada,
    ],
  )

  for (const [questionId, tipo, valor] of sesion.respuestas) {
    const tipoReal = tipo ?? TIPO_POR_PREGUNTA[questionId]
    if (tipoReal === undefined) {
      throw new Error(`Falta el tipo de la respuesta «${questionId}» en «${sesion.clave}».`)
    }
    await cliente.query(
      `insert into answers
         (id, session_id, form_id, version_id, question_id, question_type, value_json, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       on conflict (session_id, question_id) do update
         set value_json = excluded.value_json,
             question_type = excluded.question_type,
             updated_at = excluded.updated_at`,
      [
        idRespuesta(sesion.clave, questionId),
        sessionId,
        formId,
        versionId,
        questionId,
        tipoReal,
        JSON.stringify(valor),
        iniciada,
        ultimaActividad,
      ],
    )
  }

  return { sessionId, formId, versionId, iniciada, ultimaActividad, completada }
}

/**
 * Los eventos no tienen clave natural (`id` es `bigserial`), así que se borran
 * y se reescriben. Es lo que mantiene el recuento estable entre ejecuciones.
 */
async function sembrarEventos(cliente, datos) {
  const { sessionId, formId, versionId, iniciada, completada } = datos

  await cliente.query('delete from form_events where session_id = $1', [sessionId])

  await cliente.query(
    `insert into form_events (form_id, version_id, session_id, type, question_id, metadata, created_at)
     values ($1, $2, $3, 'started'::form_event_type, null, $4::jsonb, $5)`,
    [formId, versionId, sessionId, JSON.stringify({ origen: 'seed-demo' }), iniciada],
  )

  if (completada !== null) {
    await cliente.query(
      `insert into form_events (form_id, version_id, session_id, type, question_id, metadata, created_at)
       values ($1, $2, $3, 'completed'::form_event_type, null, $4::jsonb, $5)`,
      [formId, versionId, sessionId, JSON.stringify({ origen: 'seed-demo' }), completada],
    )
  }
}

/* -------------------------------------------------------------------------- */
/* Borrado                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Borra solo lo que este script crea. `forms` arrastra en cascada borradores,
 * versiones, sesiones, respuestas, eventos y referencias de media.
 */
async function limpiar(cliente) {
  const ids = FORMULARIOS.map((formulario) => idFormulario(formulario.clave))
  const { rowCount: formulariosBorrados } = await cliente.query(
    'delete from forms where id = any($1::uuid[])',
    [ids],
  )
  await cliente.query('delete from workspaces where id = $1', [WORKSPACE_DEMO.id])
  const { rowCount: usuariosBorrados } = await cliente.query(
    'delete from users where email = $1',
    [USUARIO.email],
  )
  return { formulariosBorrados, usuariosBorrados }
}

/* -------------------------------------------------------------------------- */
/* Entrada                                                                     */
/* -------------------------------------------------------------------------- */

async function contar(cliente) {
  const ids = FORMULARIOS.map((formulario) => idFormulario(formulario.clave))
  const { rows } = await cliente.query(
    `select
       (select count(*) from forms where id = any($1::uuid[]))                    as formularios,
       (select count(*) from form_versions where form_id = any($1::uuid[]))       as versiones,
       (select count(*) from response_sessions where form_id = any($1::uuid[]))   as sesiones,
       (select count(*) from answers where form_id = any($1::uuid[]))             as respuestas,
       (select count(*) from form_events where form_id = any($1::uuid[]))         as eventos`,
    [ids],
  )
  return rows[0]
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('[seed] Falta la variable de entorno DATABASE_URL.')
    process.exitCode = 1
    return
  }

  const soloLimpiar = process.argv.includes('--limpiar')

  const pool = new pg.Pool({ connectionString, max: 1 })
  const cliente = await pool.connect()

  try {
    await cliente.query('begin')

    if (soloLimpiar) {
      const { formulariosBorrados, usuariosBorrados } = await limpiar(cliente)
      await cliente.query('commit')
      console.log(
        `[seed] Demostración eliminada: ${formulariosBorrados} formulario(s), ${usuariosBorrados} usuario(s).`,
      )
      return
    }

    await sembrarUsuario(cliente)

    for (const formulario of FORMULARIOS) {
      await sembrarFormulario(cliente, formulario)
    }

    for (const sesion of SESIONES) {
      const datos = await sembrarSesion(cliente, sesion)
      await sembrarEventos(cliente, datos)
    }

    const totales = await contar(cliente)
    await cliente.query('commit')

    console.log('[seed] Datos de demostración al día.')
    console.log(
      `[seed]   ${totales.formularios} formularios · ${totales.versiones} versiones publicadas · ` +
        `${totales.sesiones} sesiones · ${totales.respuestas} respuestas · ${totales.eventos} eventos`,
    )
    for (const formulario of FORMULARIOS) {
      console.log(`[seed]   /f/${formulario.slug}  (${formulario.estado})`)
    }
    console.log('[seed] Repetir esta orden no duplica nada; `--limpiar` la borra por completo.')
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined)
    throw error
  } finally {
    cliente.release()
    await pool.end()
  }
}

main().catch((error) => {
  // Sin `DATABASE_URL` en el mensaje: la cadena de conexión lleva credenciales.
  console.error('[seed] Fallo al sembrar los datos de demostración:', error)
  process.exit(1)
})
