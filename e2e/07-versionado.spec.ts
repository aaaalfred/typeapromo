/**
 * Criterio de aceptación 7 · «Publicar una nueva versión no modifica respuestas
 * anteriores.»
 *
 * La comprobación no se conforma con «los números siguen cuadrando». Se
 * fotografía el estado completo de la versión 1 —respuestas en base de datos,
 * resultados agregados y CSV, byte a byte— se publica una versión 2 que cambia
 * el título de una pregunta, la etiqueta de una opción, el tema y añade un
 * bloque nuevo, y se vuelve a mirar. Si algo del histórico se leyera contra el
 * documento actual en lugar de contra su propio snapshot, aquí se vería:
 * cambiaría la etiqueta de la distribución, el título de la columna del CSV, o
 * las dos cosas.
 */

import { crearFormulario, descargarCsv, guardarYPublicar, leerResultados } from './utiles/api'
import { respuestasDeFormulario, sesionesDeFormulario, versionesDeFormulario } from './utiles/base-datos'
import { documentoConBifurcacion, documentoConBifurcacionV2 } from './utiles/documentos'
import { expect, test } from './utiles/fixtures'
import {
  AVISO_REANUDACION,
  abrirFormularioPublico,
  avanzarHasta,
  avanzarHastaFinal,
  pantalla,
} from './utiles/publico'
import { rutaPublica } from './utiles/rutas'

test.describe('Publicación versionada', () => {
  test('CA7 · publicar una segunda versión no toca ni una respuesta de la primera', async ({
    apiAdmin,
    browser,
    recursos,
  }) => {
    const titulo = recursos.titulo('versionado')
    const v1 = documentoConBifurcacion(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, v1)
    recursos.formulario(formulario.id)

    const publicacion1 = await guardarYPublicar(
      apiAdmin,
      formulario.id,
      formulario.draft?.revision ?? 1,
      v1,
    )
    expect(publicacion1.version.versionNumber).toBe(1)

    await test.step('alguien responde la versión 1 de punta a punta', async () => {
      const contexto = await browser.newContext()
      const pagina = await contexto.newPage()

      await abrirFormularioPublico(pagina, formulario.slug, 'bienvenida')
      await avanzarHasta(pagina, 'perfil')
      await pagina.getByRole('radio', { name: 'En equipo' }).click()
      await avanzarHasta(pagina, 'tamano')
      await pagina.getByRole('radio', { name: '6', exact: true }).click()
      await avanzarHasta(pagina, 'comentario')
      await pagina.getByRole('textbox').fill('Todo bien, gracias.')
      await avanzarHastaFinal(pagina, 'fin-equipo')

      await contexto.close()
    })

    const idVersion1 = publicacion1.version.id
    const antesRespuestas = await respuestasDeFormulario(formulario.id)
    const antesResultados = await leerResultados(apiAdmin, formulario.id, { versionId: idVersion1 })
    const antesCsv = await descargarCsv(apiAdmin, formulario.id, { versionId: idVersion1 })

    expect(antesRespuestas).toHaveLength(3)
    expect(antesResultados.resumen.completadas).toBe(1)

    const publicacion2 = await test.step('se publica una versión 2 con otro tema, otros textos y una pregunta más', async () => {
      const detalle = await apiAdmin.get(`/api/forms/${formulario.id}`)
      const { form } = (await detalle.json()) as { form: { draft: { revision: number } | null } }

      return guardarYPublicar(
        apiAdmin,
        formulario.id,
        form.draft?.revision ?? 1,
        documentoConBifurcacionV2(titulo),
      )
    })

    expect(publicacion2.version.versionNumber).toBe(2)
    expect(publicacion2.version.id).not.toBe(idVersion1)

    await test.step('la sesión antigua sigue atada a su versión', async () => {
      const versiones = await versionesDeFormulario(formulario.id)
      expect(versiones.map((version) => version.version_number)).toEqual([1, 2])

      const sesiones = await sesionesDeFormulario(formulario.id)
      expect(sesiones).toHaveLength(1)
      expect(sesiones[0]?.version_id).toBe(idVersion1)
    })

    await test.step('las respuestas guardadas son exactamente las mismas', async () => {
      const despues = await respuestasDeFormulario(formulario.id)
      expect(despues).toEqual(antesRespuestas)
      expect(despues.every((fila) => fila.version_id === idVersion1)).toBeTruthy()
    })

    await test.step('los resultados de la versión 1 se leen contra el snapshot de la versión 1', async () => {
      const despues = await leerResultados(apiAdmin, formulario.id, { versionId: idVersion1 })

      expect(despues.resumen).toEqual(antesResultados.resumen)
      expect(despues.tabla.items).toEqual(antesResultados.tabla.items)

      const perfil = despues.preguntas.find((pregunta) => pregunta.questionId === 'perfil')
      // El título y la etiqueta son los de entonces, no los de ahora.
      expect(perfil?.titulo).toBe('¿Trabajas en equipo o por tu cuenta?')
      expect(perfil?.distribucion?.[0]?.etiqueta).toBe('En equipo')

      // Y la pregunta que solo existe en la versión 2 no contamina el histórico.
      expect(despues.preguntas.map((pregunta) => pregunta.questionId)).not.toContain('herramienta')
    })

    await test.step('el CSV de la versión 1 es byte a byte el mismo', async () => {
      const despues = await descargarCsv(apiAdmin, formulario.id, { versionId: idVersion1 })
      expect(despues.texto).toBe(antesCsv.texto)
      expect(despues.contentDisposition).toContain('-v1-resultados.csv')
    })

    await test.step('quien entre ahora recibe la versión 2', async () => {
      const contexto = await browser.newContext()
      const pagina = await contexto.newPage()

      await abrirFormularioPublico(pagina, formulario.slug, 'bienvenida')
      await avanzarHasta(pagina, 'perfil')
      await expect(
        pagina.getByRole('heading', { name: '¿Cómo trabajas la mayor parte del tiempo?' }),
      ).toBeVisible()
      await expect(pagina.getByRole('radio', { name: 'Con un equipo estable' })).toBeVisible()

      await contexto.close()
    })
  })

  test('CA7 · una sesión en curso conserva su versión aunque se publique otra', async ({
    apiAdmin,
    browser,
    recursos,
  }) => {
    const titulo = recursos.titulo('version-en-curso')
    const v1 = documentoConBifurcacion(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, v1)
    recursos.formulario(formulario.id)

    const publicacion1 = await guardarYPublicar(
      apiAdmin,
      formulario.id,
      formulario.draft?.revision ?? 1,
      v1,
    )

    const contexto = await browser.newContext()
    const pagina = await contexto.newPage()

    await abrirFormularioPublico(pagina, formulario.slug, 'bienvenida')
    await avanzarHasta(pagina, 'perfil')
    await pagina.getByRole('radio', { name: 'En equipo' }).click()
    await avanzarHasta(pagina, 'tamano')

    // Mientras esa persona está a medias, el equipo publica otra versión.
    const detalle = await apiAdmin.get(`/api/forms/${formulario.id}`)
    const { form } = (await detalle.json()) as { form: { draft: { revision: number } | null } }
    await guardarYPublicar(
      apiAdmin,
      formulario.id,
      form.draft?.revision ?? 1,
      documentoConBifurcacionV2(titulo),
    )

    const segunda = await contexto.newPage()
    await segunda.goto(rutaPublica(formulario.slug))

    await expect(segunda.getByText(AVISO_REANUDACION)).toBeVisible()
    await expect(pantalla(segunda, 'tamano')).toBeVisible()
    // La pregunta nueva de la versión 2 no aparece en un recorrido de la 1.
    await expect(pantalla(segunda, 'herramienta')).toHaveCount(0)

    await segunda.getByRole('radio', { name: '2', exact: true }).click()
    await avanzarHasta(segunda, 'comentario')
    await avanzarHastaFinal(segunda, 'fin-equipo')

    const sesiones = await sesionesDeFormulario(formulario.id)
    expect(sesiones).toHaveLength(1)
    expect(sesiones[0]?.version_id).toBe(publicacion1.version.id)

    await contexto.close()
  })
})
