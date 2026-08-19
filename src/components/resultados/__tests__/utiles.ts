/**
 * Utilidades compartidas por los tests de la interfaz de resultados.
 *
 * Las respuestas se construyen con `Response` de verdad, no con un objeto
 * simulado: así el cliente pasa por el mismo `json()` y el mismo `ok` que en el
 * navegador, y un 404 servido como HTML se comporta aquí igual que en
 * producción.
 */

import type { Resultados } from '../tipos';

export const ID_FORMULARIO = '11111111-1111-4111-8111-111111111111';
export const ID_VERSION_1 = '22222222-2222-4222-8222-222222222222';
export const ID_VERSION_2 = '33333333-3333-4333-8333-333333333333';

/** Documento de resultados con dos preguntas y dos sesiones. */
export function crearResultados(parcial: Partial<Resultados> = {}): Resultados {
  const base: Resultados = {
    form: {
      id: ID_FORMULARIO,
      slug: 'encuesta-de-verano',
      title: 'Encuesta de verano',
      status: 'published',
    },
    versiones: [
      {
        id: ID_VERSION_1,
        versionNumber: 1,
        publishedAt: '2026-08-01T08:00:00.000Z',
        esActiva: false,
      },
      {
        id: ID_VERSION_2,
        versionNumber: 2,
        publishedAt: '2026-08-10T08:00:00.000Z',
        esActiva: true,
      },
    ],
    filtros: {
      versionId: null,
      estado: 'todas',
      desde: null,
      hasta: null,
      page: 1,
      perPage: 25,
    },
    resumen: {
      iniciadas: 4,
      completadas: 2,
      abandonadas: 1,
      enCurso: 1,
      tasaFinalizacion: 0.5,
    },
    abandonoPorPregunta: [
      { questionId: 'comentario', titulo: '¿Algo que añadir?', abandonos: 1, porcentaje: 1 },
    ],
    preguntas: [
      {
        questionId: 'perfil',
        titulo: '¿Quién eres?',
        tipo: 'single_choice',
        tiposMixtos: false,
        respondidas: 3,
        enBlanco: 0,
        descartadas: 0,
        distribucion: [
          { valor: 'cliente', etiqueta: 'Soy cliente', recuento: 2 },
          { valor: 'proveedor', etiqueta: 'Soy proveedor', recuento: 1 },
        ],
        promedio: null,
        promedioNormalizado: null,
        escalas: [],
      },
      {
        questionId: 'satisfaccion',
        titulo: 'Satisfacción',
        tipo: 'rating',
        tiposMixtos: false,
        respondidas: 2,
        enBlanco: 0,
        descartadas: 0,
        distribucion: [
          { valor: '1', etiqueta: '1', recuento: 0 },
          { valor: '2', etiqueta: '2', recuento: 0 },
          { valor: '3', etiqueta: '3', recuento: 1 },
          { valor: '4', etiqueta: '4', recuento: 0 },
          { valor: '5', etiqueta: '5', recuento: 1 },
        ],
        promedio: 4,
        promedioNormalizado: 0.75,
        escalas: [5],
      },
      {
        questionId: 'comentario',
        titulo: '¿Algo que añadir?',
        tipo: 'long_text',
        tiposMixtos: false,
        respondidas: 1,
        enBlanco: 1,
        descartadas: 0,
        distribucion: null,
        promedio: null,
        promedioNormalizado: null,
        escalas: [],
      },
    ],
    tabla: {
      items: [
        {
          sessionId: 'aaaaaaaa-1111-4111-8111-111111111111',
          versionId: ID_VERSION_2,
          versionNumber: 2,
          estado: 'completada',
          iniciada: '2026-08-14T09:00:00.000Z',
          ultimaActividad: '2026-08-14T09:10:00.000Z',
          completada: '2026-08-14T09:10:00.000Z',
          respondidas: 3,
          respuestas: {
            perfil: 'Soy cliente',
            satisfaccion: '5',
            comentario: 'Rápido, claro y "barato".\nRepetiré.',
          },
        },
        {
          sessionId: 'bbbbbbbb-2222-4222-8222-222222222222',
          versionId: ID_VERSION_2,
          versionNumber: 2,
          estado: 'abandonada',
          iniciada: '2026-08-14T08:00:00.000Z',
          ultimaActividad: '2026-08-14T08:02:00.000Z',
          completada: null,
          respondidas: 1,
          respuestas: { perfil: 'Soy proveedor' },
        },
      ],
      total: 2,
      page: 1,
      perPage: 25,
      pageCount: 1,
    },
    generadoEn: '2026-08-17T12:00:00.000Z',
  };

  return { ...base, ...parcial };
}

export function respuestaJson(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * `fetch` que devuelve siempre el mismo cuerpo, construyendo una `Response`
 * nueva en cada llamada: el cuerpo solo puede leerse una vez.
 */
export function siempreJson(datos: unknown, estado = 200): () => Promise<Response> {
  return () => Promise.resolve(respuestaJson(datos, estado));
}

export function respuestaError(estado: number, codigo: string, mensaje: string): Response {
  return respuestaJson({ error: { code: codigo, message: mensaje } }, estado);
}

/** URL de una llamada registrada por el doble de `fetch`. */
export function urlDeLlamada(argumentos: readonly unknown[]): string {
  return String(argumentos[0]);
}
