/**
 * Imágenes de prueba y recorrido completo del pipeline de media.
 *
 * El PNG se genera aquí en lugar de guardarse como fichero binario en el
 * repositorio por dos razones: un blob en base64 dentro del código no se puede
 * revisar, y un fichero de prueba en `e2e/` acabaría copiado a mano el día que
 * hiciera falta otro tamaño. Se construye con `zlib`, que es lo que exige el
 * formato, y sale un PNG real —firma, IHDR, IDAT, IEND y CRC correctos— que
 * Sharp decodifica sin quejarse.
 */

import { deflateSync } from 'node:zlib'

import type { APIRequestContext } from '@playwright/test'
import { expect } from '@playwright/test'

/* -------------------------------------------------------------------------- */
/* Generación del PNG                                                          */
/* -------------------------------------------------------------------------- */

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    tabla[n] = c >>> 0
  }
  return tabla
})()

function crc32(datos: Buffer): number {
  let c = 0xffffffff
  for (const byte of datos) {
    c = (TABLA_CRC[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function trozoPng(tipo: string, datos: Buffer): Buffer {
  const longitud = Buffer.alloc(4)
  longitud.writeUInt32BE(datos.byteLength)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([longitud, cuerpo, crc])
}

/**
 * PNG RGB de `ancho` × `alto` con un degradado, para que el WebP resultante no
 * sea un bloque de un solo color y las variantes tengan tamaños distintos.
 */
export function pngDePrueba(ancho = 320, alto = 240): Buffer {
  const bytesPorPixel = 3
  const crudo = Buffer.alloc(alto * (1 + ancho * bytesPorPixel))

  for (let y = 0; y < alto; y += 1) {
    const inicioFila = y * (1 + ancho * bytesPorPixel)
    crudo[inicioFila] = 0 // filtro «None»
    for (let x = 0; x < ancho; x += 1) {
      const p = inicioFila + 1 + x * bytesPorPixel
      crudo[p] = Math.round((x / Math.max(ancho - 1, 1)) * 255)
      crudo[p + 1] = Math.round((y / Math.max(alto - 1, 1)) * 255)
      crudo[p + 2] = 128
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr.writeUInt8(8, 8) // 8 bits por canal
  ihdr.writeUInt8(2, 9) // color RGB
  ihdr.writeUInt8(0, 10) // compresión deflate
  ihdr.writeUInt8(0, 11) // filtrado estándar
  ihdr.writeUInt8(0, 12) // sin entrelazado

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozoPng('IHDR', ihdr),
    trozoPng('IDAT', deflateSync(crudo, { level: 6 })),
    trozoPng('IEND', Buffer.alloc(0)),
  ])
}

/* -------------------------------------------------------------------------- */
/* Pipeline de subida                                                          */
/* -------------------------------------------------------------------------- */

export interface VarianteVista {
  readonly label: string
  readonly url: string
  readonly width: number
  readonly height: number
  readonly byteSize: number
  readonly mimeType: string
}

export interface ActivoVista {
  readonly id: string
  readonly status: 'uploading' | 'ready' | 'failed'
  readonly mimeType: string
  readonly width: number | null
  readonly height: number | null
  readonly sha256: string | null
  readonly url: string | null
  readonly variantes: readonly VarianteVista[]
}

export interface IntentoDeSubida {
  readonly asset: ActivoVista
  readonly upload: {
    readonly url: string
    readonly method: 'PUT'
    readonly headers: Readonly<Record<string, string>>
  }
}

/**
 * Recorre el flujo completo de PR.md: intención → `PUT` **directo al bucket
 * privado** → `complete`.
 *
 * Los bytes no pasan por la aplicación en ningún momento, igual que en el
 * navegador. Devuelve el activo ya publicado y su clave de staging, para poder
 * comprobar después que el objeto temporal ha desaparecido.
 */
export async function subirImagen(
  api: APIRequestContext,
  bytes: Buffer,
  nombre = 'prueba.png',
): Promise<{ activo: ActivoVista; urlDeStaging: string }> {
  const intento = await api.post('/api/media/upload-intent', {
    data: { mimeType: 'image/png', byteSize: bytes.byteLength, filename: nombre },
  })
  expect(intento.status(), await intento.text()).toBe(201)
  const { asset, upload } = (await intento.json()) as IntentoDeSubida

  expect(asset.status).toBe('uploading')
  expect(upload.method).toBe('PUT')

  const carga = await api.fetch(upload.url, {
    method: 'PUT',
    headers: {
      'content-type': upload.headers['content-type'] ?? 'image/png',
      'content-length': String(bytes.byteLength),
    },
    data: bytes,
  })
  expect(carga.ok(), `El PUT prefirmado ha fallado: ${String(carga.status())}`).toBeTruthy()

  const completar = await api.post(`/api/media/${asset.id}/complete`)
  expect(completar.ok(), await completar.text()).toBeTruthy()
  const { asset: publicado } = (await completar.json()) as { asset: ActivoVista }

  // La URL prefirmada apunta al objeto de staging; sin la firma, el bucket
  // privado no debe servirlo. Se conserva sin query para comprobarlo.
  const urlDeStaging = upload.url.split('?')[0] ?? upload.url

  return { activo: publicado, urlDeStaging }
}
