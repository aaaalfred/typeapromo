#!/usr/bin/env node
/**
 * Protección 3 del bypass de autenticación (PLAN.md, «Seguridad del bypass»).
 *
 * El acceso sin credenciales es la única pieza del plan que puede convertirse en
 * un agujero. Las protecciones 1 y 2 viven en el código (el provider solo se
 * registra con la variable puesta, y `/api/health` lo publica). Esta es la
 * tercera: falla si algún artefacto de producción define `AUTH_DEV_BYPASS`.
 *
 * `.env.example` queda fuera a propósito: documenta la variable para desarrollo,
 * que es precisamente donde debe existir.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const VARIABLE = 'AUTH_DEV_BYPASS'

/** Artefactos que describen o construyen el entorno de producción. */
const ARTEFACTOS = ['docker-compose.yml', 'Dockerfile']

/**
 * Quita comentarios para no confundir una mención en prosa con una definición.
 * Los dos ficheros usan `#`, y ninguno mete `#` dentro de una cadena entre
 * comillas, así que basta con cortar por el primero.
 */
function sinComentarios(contenido) {
  return contenido
    .split('\n')
    .map((linea) => {
      const posicion = linea.indexOf('#')
      return posicion === -1 ? linea : linea.slice(0, posicion)
    })
    .join('\n')
}

const hallazgos = []

for (const artefacto of ARTEFACTOS) {
  const ruta = path.join(RAIZ, artefacto)

  if (!fs.existsSync(ruta)) {
    hallazgos.push(`${artefacto}: no existe; no se puede verificar.`)
    continue
  }

  const lineas = sinComentarios(fs.readFileSync(ruta, 'utf8')).split('\n')

  lineas.forEach((linea, indice) => {
    if (linea.includes(VARIABLE)) {
      hallazgos.push(`${artefacto}:${indice + 1}: define ${VARIABLE} → ${linea.trim()}`)
    }
  })
}

if (hallazgos.length > 0) {
  console.error(`[bypass] ${VARIABLE} no puede existir en el entorno de producción.`)
  for (const hallazgo of hallazgos) {
    console.error(`[bypass]   ${hallazgo}`)
  }
  process.exit(1)
}

console.log(`[bypass] Ningún artefacto de producción define ${VARIABLE}.`)
