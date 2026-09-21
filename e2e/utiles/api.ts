/**
 * Cliente HTTP de la suite contra la API de administración.
 *
 * Todo lo que aquí se hace, se hace **por HTTP y con sesión real**: nada de
 * escribir formularios en la base de datos para ahorrarse el recorrido. Un test
 * que prepara su escenario por SQL deja de probar la mitad del sistema.
 *
 * Se usa para el atrezo (crear el formulario que un test va a recorrer) y para
 * leer lo que la interfaz también lee, de modo que se puedan contrastar.
 */

import type { APIRequestContext } from '@playwright/test'
import { expect } from '@playwright/test'
import type { FormDefinition } from '@/lib/forms'

/* -------------------------------------------------------------------------- */
/* Formas de respuesta                                                         */
/* -------------------------------------------------------------------------- */

export interface FormularioApi {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly status: 'draft' | 'published' | 'closed' | 'archived'
  readonly activeVersionId: string | null
  readonly activeVersionNumber: number | null
  readonly draft: { readonly revision: number } | null
}

export interface FormularioDetalleApi extends FormularioApi {
  readonly definition: FormDefinition
}

export interface VersionPublicada {
  readonly id: string
  readonly versionNumber: number
  readonly schemaVersion: number
}

export interface ProblemaPublicacion {
  readonly code: string
  readonly message: string
  readonly path: string
}

export interface CuerpoDeError {
  readonly error: {
    readonly code: string
    readonly message: string
    readonly details?: {
      readonly errors?: readonly ProblemaPublicacion[]
      readonly warnings?: readonly ProblemaPublicacion[]
      readonly revisionServidor?: number
      readonly issues?: readonly { readonly path: string; readonly message: string }[]
    }
  }
}

export interface ResumenResultados {
  readonly iniciadas: number
  readonly completadas: number
  readonly abandonadas: number
  readonly enCurso: number
  readonly tasaFinalizacion: number
}

export interface MetricaPregunta {
  readonly questionId: string
  readonly titulo: string
  readonly tipo: string
  readonly respondidas: number
  readonly enBlanco: number
  readonly distribucion: readonly { valor: string; etiqueta: string; recuento: number }[] | null
  readonly promedio: number | null
  readonly promedioNormalizado: number | null
  readonly escalas: readonly number[]
}

export interface FilaTabla {
  readonly sessionId: string
  readonly versionNumber: number | null
  readonly estado: 'completada' | 'abandonada' | 'en_curso'
  readonly respondidas: number
  readonly respuestas: Readonly<Record<string, string>>
}

export interface Resultados {
  readonly form: { readonly id: string; readonly slug: string; readonly title: string }
  readonly versiones: readonly { id: string; versionNumber: number; esActiva: boolean }[]
  readonly resumen: ResumenResultados
  readonly abandonoPorPregunta: readonly { questionId: string; titulo: string; abandonos: number }[]
  readonly preguntas: readonly MetricaPregunta[]
  readonly tabla: {
    readonly items: readonly FilaTabla[]
    readonly total: number
    readonly pageCount: number
  }
}

/* -------------------------------------------------------------------------- */
/* Operaciones                                                                 */
/* -------------------------------------------------------------------------- */

/** Crea un formulario con el documento indicado y devuelve su ficha. */
export async function crearFormulario(
  api: APIRequestContext,
  titulo: string,
  definicion?: FormDefinition,
): Promise<FormularioApi> {
  const respuesta = await api.post('/api/forms', {
    data: definicion === undefined ? { title: titulo } : { title: titulo, definition: definicion },
  })
  expect(respuesta.status(), await respuesta.text()).toBe(201)
  const cuerpo = (await respuesta.json()) as { form: FormularioApi }
  return cuerpo.form
}

/** Ficha completa, con el documento del borrador y su revisión. */
export async function leerFormulario(
  api: APIRequestContext,
  id: string,
): Promise<FormularioDetalleApi> {
  const respuesta = await api.get(`/api/forms/${id}`)
  expect(respuesta.ok(), await respuesta.text()).toBeTruthy()
  const cuerpo = (await respuesta.json()) as { form: FormularioDetalleApi }
  return cuerpo.form
}

/** Guarda el borrador con control de revisión y devuelve la revisión nueva. */
export async function guardarBorrador(
  api: APIRequestContext,
  id: string,
  revision: number,
  definicion: FormDefinition,
): Promise<number> {
  const respuesta = await api.put(`/api/forms/${id}/draft`, {
    data: { revision, definition: definicion },
  })
  expect(respuesta.ok(), await respuesta.text()).toBeTruthy()
  const cuerpo = (await respuesta.json()) as { draft: { revision: number } }
  return cuerpo.draft.revision
}

/** Publica el borrador. Falla el test si la publicación no sale adelante. */
export async function publicar(
  api: APIRequestContext,
  id: string,
): Promise<VersionPublicada> {
  const respuesta = await api.post(`/api/forms/${id}/publish`, { data: {} })
  expect(respuesta.ok(), await respuesta.text()).toBeTruthy()
  const cuerpo = (await respuesta.json()) as { version: VersionPublicada }
  return cuerpo.version
}

/** Intenta publicar y devuelve el sobre de error. Falla si la publicación sale. */
export async function publicarEsperandoRechazo(
  api: APIRequestContext,
  id: string,
): Promise<CuerpoDeError> {
  const respuesta = await api.post(`/api/forms/${id}/publish`, { data: {} })
  expect(
    respuesta.ok(),
    'Se esperaba que la publicación fuese rechazada y ha salido adelante.',
  ).toBeFalsy()
  return (await respuesta.json()) as CuerpoDeError
}

/** Guarda el borrador **y** lo publica, en una sola llamada de conveniencia. */
export async function guardarYPublicar(
  api: APIRequestContext,
  id: string,
  revision: number,
  definicion: FormDefinition,
): Promise<{ revision: number; version: VersionPublicada }> {
  const nuevaRevision = await guardarBorrador(api, id, revision, definicion)
  const version = await publicar(api, id)
  return { revision: nuevaRevision, version }
}

/** Resultados agregados, con los mismos filtros que usa el panel. */
export async function leerResultados(
  api: APIRequestContext,
  id: string,
  filtros: Readonly<Record<string, string>> = {},
): Promise<Resultados> {
  const respuesta = await api.get(`/api/forms/${id}/results`, { params: { ...filtros } })
  expect(respuesta.ok(), await respuesta.text()).toBeTruthy()
  return (await respuesta.json()) as Resultados
}

/** Cuerpo del CSV, tal cual sale del servidor (con BOM y `CRLF`). */
export async function descargarCsv(
  api: APIRequestContext,
  id: string,
  filtros: Readonly<Record<string, string>> = {},
): Promise<{ texto: string; contentType: string; contentDisposition: string }> {
  const respuesta = await api.get(`/api/forms/${id}/results.csv`, { params: { ...filtros } })
  expect(respuesta.ok(), await respuesta.text()).toBeTruthy()
  return {
    texto: await respuesta.text(),
    contentType: respuesta.headers()['content-type'] ?? '',
    contentDisposition: respuesta.headers()['content-disposition'] ?? '',
  }
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Parseador de CSV conforme a RFC 4180, lo justo para comprobar lo que emite el
 * servidor: comillas dobladas, comas y saltos de línea dentro de campo.
 *
 * Se escribe aquí y no se reutiliza el del servidor a propósito: un test que
 * usa el mismo código que está comprobando no comprueba nada.
 */
export function parsearCsv(texto: string): string[][] {
  const limpio = texto.startsWith('﻿') ? texto.slice(1) : texto
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let entreComillas = false

  for (let i = 0; i < limpio.length; i += 1) {
    const caracter = limpio[i]

    if (entreComillas) {
      if (caracter === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"'
          i += 1
        } else {
          entreComillas = false
        }
      } else {
        campo += caracter
      }
      continue
    }

    if (caracter === '"') {
      entreComillas = true
    } else if (caracter === ',') {
      fila.push(campo)
      campo = ''
    } else if (caracter === '\r' && limpio[i + 1] === '\n') {
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
      i += 1
    } else {
      campo += caracter
    }
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }

  return filas
}

/** Índice de una columna por su cabecera. Falla el test si no existe. */
export function columna(cabeceras: readonly string[], nombre: string): number {
  const indice = cabeceras.indexOf(nombre)
  expect(indice, `El CSV no tiene la columna «${nombre}». Cabeceras: ${cabeceras.join(', ')}`).
    toBeGreaterThanOrEqual(0)
  return indice
}
