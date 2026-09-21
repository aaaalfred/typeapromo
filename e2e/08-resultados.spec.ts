/**
 * Criterio de aceptación 8 · «El tablero y el CSV coinciden con las respuestas
 * almacenadas.»
 *
 * Tres fuentes que tienen que decir lo mismo: lo que hay en `answers`, lo que
 * pinta el panel de resultados y lo que se descarga en el CSV. Se recogen tres
 * sesiones deliberadamente distintas —dos terminadas por ramas opuestas y una a
 * medias— porque un tablero que solo se prueba con sesiones completas no dice
 * nada sobre la tasa de finalización.
 *
 * El CSV se descarga **desde el navegador**, con el mismo enlace que pulsa una
 * persona, y se compara fila a fila con lo que devuelve la API. El parseador
 * está escrito en la suite y no es el del servidor: comprobar un CSV con el
 * mismo código que lo genera no comprueba nada.
 */

import { readFile } from 'node:fs/promises'

import type { Browser } from '@playwright/test'

import { columna, crearFormulario, guardarYPublicar, leerResultados, parsearCsv } from './utiles/api'
import { respuestasDeFormulario } from './utiles/base-datos'
import { documentoConBifurcacion } from './utiles/documentos'
import { expect, test } from './utiles/fixtures'
import { abrirFormularioPublico, avanzarHasta, avanzarHastaFinal } from './utiles/publico'
import { rutaResultados } from './utiles/rutas'

/** Recorrido largo, terminado. */
async function responderEnEquipo(navegador: Browser, slug: string, tamano: string, texto: string) {
  const contexto = await navegador.newContext()
  const pagina = await contexto.newPage()

  await abrirFormularioPublico(pagina, slug, 'bienvenida')
  await avanzarHasta(pagina, 'perfil')
  await pagina.getByRole('radio', { name: 'En equipo' }).click()
  await avanzarHasta(pagina, 'tamano')
  await pagina.getByRole('radio', { name: tamano, exact: true }).click()
  await avanzarHasta(pagina, 'comentario')
  await pagina.getByRole('textbox').fill(texto)
  await avanzarHastaFinal(pagina, 'fin-equipo')

  await contexto.close()
}

/** Recorrido corto, terminado. */
async function responderPorMiCuenta(navegador: Browser, slug: string) {
  const contexto = await navegador.newContext()
  const pagina = await contexto.newPage()

  await abrirFormularioPublico(pagina, slug, 'bienvenida')
  await avanzarHasta(pagina, 'perfil')
  await pagina.getByRole('radio', { name: 'Por mi cuenta' }).click()
  await avanzarHastaFinal(pagina, 'fin-solo')

  await contexto.close()
}

/** Se marcha a la mitad: ni completada ni (todavía) abandonada. */
async function dejarloAMedias(navegador: Browser, slug: string) {
  const contexto = await navegador.newContext()
  const pagina = await contexto.newPage()

  await abrirFormularioPublico(pagina, slug, 'bienvenida')
  await avanzarHasta(pagina, 'perfil')
  await pagina.getByRole('radio', { name: 'En equipo' }).click()
  await avanzarHasta(pagina, 'tamano')

  await contexto.close()
}

test.describe('Resultados y exportación', () => {
  test('CA8 · el tablero, el CSV y lo almacenado dicen exactamente lo mismo', async ({
    apiAdmin,
    browser,
    paginaAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('resultados')
    const documento = documentoConBifurcacion(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    await test.step('tres personas responden de tres maneras distintas', async () => {
      await responderEnEquipo(browser, formulario.slug, '8', 'Nos falta sitio en la sala.')
      await responderPorMiCuenta(browser, formulario.slug)
      await dejarloAMedias(browser, formulario.slug)
    })

    const resultados = await leerResultados(apiAdmin, formulario.id)

    await test.step('el resumen cuadra con lo que hay en la base de datos', async () => {
      expect(resultados.resumen.iniciadas).toBe(3)
      expect(resultados.resumen.completadas).toBe(2)
      expect(resultados.resumen.enCurso).toBe(1)
      expect(resultados.resumen.abandonadas).toBe(0)
      expect(resultados.resumen.tasaFinalizacion).toBeCloseTo(2 / 3, 4)

      const almacenadas = await respuestasDeFormulario(formulario.id)
      const conValor = almacenadas.filter((fila) => fila.value_json !== null)
      const respondidasSegunPanel = resultados.preguntas.reduce(
        (total, pregunta) => total + pregunta.respondidas,
        0,
      )
      expect(respondidasSegunPanel).toBe(conValor.length)

      // Solo una persona llegó a contestar «¿Cuántas personas sois?»: el
      // recorrido corto ni pasa por ahí, y quien lo dejó a medias se marchó en
      // esa misma pantalla sin responder.
      const tamano = resultados.preguntas.find((pregunta) => pregunta.questionId === 'tamano')
      expect(tamano?.respondidas).toBe(1)
      expect(tamano?.promedio).toBeCloseTo(8, 4)

      const perfil = resultados.preguntas.find((pregunta) => pregunta.questionId === 'perfil')
      expect(perfil?.respondidas).toBe(3)
      expect(
        (perfil?.distribucion ?? []).map((valor) => [valor.etiqueta, valor.recuento]),
      ).toEqual(
        expect.arrayContaining([
          ['En equipo', 2],
          ['Por mi cuenta', 1],
        ]),
      )
    })

    await test.step('el panel pinta esas mismas cifras', async () => {
      await paginaAdmin.goto(rutaResultados(formulario.id))

      await expect(paginaAdmin.getByRole('heading', { level: 1, name: 'Resultados' })).toBeVisible()

      await expect(paginaAdmin.locator('[data-cifra="iniciadas"] dd').first()).toHaveText('3')
      await expect(paginaAdmin.locator('[data-cifra="completadas"] dd').first()).toHaveText('2')
      await expect(paginaAdmin.locator('[data-cifra="en-curso"] dd').first()).toHaveText('1')
      await expect(paginaAdmin.locator('[data-cifra="abandonadas"] dd').first()).toHaveText('0')
      // 2 de 3 en formato es-ES, con coma decimal.
      await expect(paginaAdmin.locator('[data-cifra="tasa"] dd').first()).toContainText('66,7')

      const tabla = paginaAdmin.getByRole('table')
      await expect(tabla).toBeVisible()
      await expect(tabla.getByRole('row')).toHaveCount(4) // cabecera + tres sesiones
      await expect(tabla.getByRole('columnheader', { name: 'Sesión' })).toBeVisible()
      await expect(
        tabla.getByRole('columnheader', { name: '¿Trabajas en equipo o por tu cuenta?' }),
      ).toBeVisible()
      await expect(tabla).toContainText('Nos falta sitio en la sala.')
    })

    await test.step('el CSV que se descarga coincide fila a fila con el tablero', async () => {
      const [descarga] = await Promise.all([
        paginaAdmin.waitForEvent('download'),
        paginaAdmin.getByRole('link', { name: 'Descargar CSV' }).click(),
      ])

      expect(descarga.suggestedFilename()).toContain('-v1-resultados.csv')

      const ruta = await descarga.path()
      const texto = await readFile(ruta, 'utf8')

      // BOM UTF-8 y fin de línea CRLF, como manda RFC 4180 y como pide Excel.
      expect(texto.startsWith('﻿')).toBeTruthy()
      expect(texto).toContain('\r\n')

      const filas = parsearCsv(texto)
      const cabeceras = filas[0] ?? []
      expect(cabeceras.slice(0, 7)).toEqual([
        'sesion_id',
        'version',
        'estado',
        'iniciada_en',
        'ultima_actividad_en',
        'completada_en',
        'respuestas',
      ])
      // Una columna por pregunta de la versión exportada.
      expect(cabeceras).toContain('¿Trabajas en equipo o por tu cuenta?')
      expect(cabeceras).toContain('¿Cuántas personas sois?')
      expect(cabeceras).toContain('¿Algo más que quieras contarnos?')

      const datos = filas.slice(1).filter((fila) => (fila[0] ?? '') !== '')
      expect(datos).toHaveLength(3)

      const iSesion = columna(cabeceras, 'sesion_id')
      const iEstado = columna(cabeceras, 'estado')
      const iVersion = columna(cabeceras, 'version')
      const iRespondidas = columna(cabeceras, 'respuestas')
      const iPerfil = columna(cabeceras, '¿Trabajas en equipo o por tu cuenta?')
      const iComentario = columna(cabeceras, '¿Algo más que quieras contarnos?')

      const csvPorSesion = new Map(datos.map((fila) => [fila[iSesion] ?? '', fila]))
      const etiquetas = { completada: 'Completada', abandonada: 'Abandonada', en_curso: 'En curso' }

      for (const item of resultados.tabla.items) {
        const fila = csvPorSesion.get(item.sessionId)
        expect(fila, `El CSV no trae la sesión ${item.sessionId}`).toBeDefined()
        if (fila === undefined) continue

        expect(fila[iEstado]).toBe(etiquetas[item.estado])
        expect(fila[iVersion]).toBe(String(item.versionNumber ?? ''))
        expect(fila[iRespondidas]).toBe(String(item.respondidas))
        expect(fila[iPerfil]).toBe(item.respuestas['perfil'] ?? '')
        expect(fila[iComentario]).toBe(item.respuestas['comentario'] ?? '')
      }

      // Y el texto libre viaja completo, con su punto final y sin recortar.
      expect(texto).toContain('Nos falta sitio en la sala.')
    })

    await test.step('filtrar por estado cambia el tablero y el CSV a la vez', async () => {
      const soloCompletadas = await leerResultados(apiAdmin, formulario.id, {
        estado: 'completadas',
      })
      expect(soloCompletadas.resumen.iniciadas).toBe(2)
      expect(soloCompletadas.tabla.items).toHaveLength(2)

      await paginaAdmin.getByLabel('Estado').selectOption('completadas')
      await expect(paginaAdmin.locator('[data-cifra="iniciadas"] dd').first()).toHaveText('2')

      const enlace = paginaAdmin.getByRole('link', { name: 'Descargar CSV' })
      await expect(enlace).toHaveAttribute('href', /estado=completadas/)
    })
  })

  test('CA8 · un formulario sin versiones publicadas lo dice en vez de enseñar ceros', async ({
    apiAdmin,
    paginaAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('resultados-vacio')
    const formulario = await crearFormulario(apiAdmin, titulo)
    recursos.formulario(formulario.id)

    await paginaAdmin.goto(rutaResultados(formulario.id))

    await expect(paginaAdmin.getByText('Todavía no hay nada que medir')).toBeVisible()
    await expect(paginaAdmin.getByRole('link', { name: 'Descargar CSV' })).toHaveCount(0)
  })
})
