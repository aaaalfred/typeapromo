/**
 * El guion de PR.md, entero y en un solo recorrido.
 *
 * Los ficheros anteriores prueban cada criterio de aceptación por separado, con
 * el atrezo mínimo. Este hace lo contrario: una sola historia, de principio a
 * fin, con el mismo formulario pasando por todas sus etapas. Sirve para
 * encontrar lo que los tests aislados no pueden ver —que una etapa deja al
 * sistema en un estado que la siguiente no espera— y para leerse como
 * documentación de lo que el producto hace.
 *
 * El guion, tal cual lo enumera PR.md:
 *
 *   iniciar sesión · crear y tematizar formulario · subir imagen · crear
 *   opciones visuales · configurar estrellas/caras · añadir una bifurcación ·
 *   publicar · responder cada recorrido · reanudar sesión · publicar una
 *   segunda versión · verificar resultados históricos · descargar CSV
 *
 * Dos desvíos, los dos con motivo y los dos anotados donde ocurren:
 *
 * 1. **Iniciar sesión** se hace con la sesión del fixture. El inicio de sesión
 *    por interfaz está roto por un fallo real de la aplicación
 *    (`01-acceso.spec.ts` lo mantiene en rojo con el diagnóstico completo).
 * 2. **Subir imagen** se hace por API. El editor no tiene ningún control de
 *    subida: su panel de media es un campo de texto donde se pega el
 *    identificador de un activo ya existente, y eso sí se ejerce aquí.
 */

import { readFile } from 'node:fs/promises'

import type { Browser } from '@playwright/test'

import {
  columna,
  crearFormulario,
  descargarCsv,
  guardarBorrador,
  guardarYPublicar,
  leerFormulario,
  leerResultados,
  parsearCsv,
  publicar,
} from './utiles/api'
import { respuestasDeFormulario, sesionesDeFormulario } from './utiles/base-datos'
import { TEMA_ALTERNATIVO } from './utiles/documentos'
import { abrirPestana, guardarBorradorDesdeElEditor, insigniaPublicable } from './utiles/editor'
import { MEDIA_PUBLIC_BASE_URL } from './utiles/entorno'
import { expect, test } from './utiles/fixtures'
import { pngDePrueba, subirImagen } from './utiles/imagen'
import {
  AVISO_REANUDACION,
  abrirFormularioPublico,
  avanzarHasta,
  avanzarHastaFinal,
  pantalla,
} from './utiles/publico'
import { RUTA_FORMULARIOS, rutaEditor, rutaPublica, rutaResultados } from './utiles/rutas'
import type { FormDefinition } from '@/lib/forms'

/**
 * Documento del guion: una encuesta con imagen de portada, opciones visuales
 * (tarjetas con imagen), una valoración con caras y una bifurcación que manda a
 * dos pantallas finales distintas.
 */
function documentoDelGuion(titulo: string, assetId: string): FormDefinition {
  return {
    schemaVersion: 1,
    meta: {
      title: titulo,
      description: 'Encuesta de la suite end-to-end.',
      language: 'es',
      closedMessage: 'Esta encuesta ya está cerrada.',
    },
    theme: { ...TEMA_ALTERNATIVO, logoAssetId: assetId },
    blocks: [
      {
        id: 'bienvenida',
        type: 'welcome',
        title: '¿Cómo ha ido el evento?',
        body: 'Tres preguntas, dos minutos.',
        buttonLabel: 'Empezar',
        mediaAssetId: assetId,
      },
      {
        id: 'formato',
        type: 'single_choice',
        title: '¿Qué formato te ha gustado más?',
        required: true,
        // Tarjetas con imagen: cada opción lleva su propio activo.
        presentation: 'image_cards',
        randomizeChoices: false,
        choices: [
          { id: 'op-taller', label: 'El taller práctico', value: 'taller', assetId },
          { id: 'op-charla', label: 'Las charlas cortas', value: 'charla', assetId },
          { id: 'op-nada', label: 'Ninguno, la verdad', value: 'nada', assetId },
        ],
      },
      {
        id: 'satisfaccion',
        type: 'rating',
        title: '¿Cómo valorarías el evento?',
        required: true,
        appearance: 'faces',
        scale: 5,
        labels: { min: 'Muy mal', max: 'Muy bien' },
      },
      {
        id: 'detalle',
        type: 'long_text',
        title: '¿Qué te llevas?',
        required: false,
        rows: 4,
        placeholder: 'Lo que quieras contar',
      },
    ],
    rules: [
      {
        id: 'r-descontento',
        sourceQuestionId: 'formato',
        operator: 'equals',
        value: 'nada',
        priority: 1,
        target: { kind: 'end_screen', id: 'fin-lastima' },
      },
    ],
    endScreens: [
      { id: 'fin-gracias', type: 'ending', title: 'Gracias por venir', body: 'Nos vemos pronto.' },
      {
        id: 'fin-lastima',
        type: 'ending',
        title: 'Lo tendremos en cuenta',
        body: 'Gracias por decirlo con claridad.',
      },
    ],
    defaultEndScreenId: 'fin-gracias',
    settings: {
      showProgressBar: true,
      allowResume: true,
      showQuestionNumbers: true,
      notifyOnCompletion: true,
    },
  }
}

async function participante(navegador: Browser) {
  const contexto = await navegador.newContext()
  return { contexto, pagina: await contexto.newPage() }
}

test.describe('Guion completo de PR.md', () => {
  // Es la historia entera: crear, tematizar, subir, publicar dos veces y
  // exportar. Merece más margen que un test de una sola pantalla.
  test.slow()

  test('del formulario en blanco al CSV, pasando por dos versiones', async ({
    apiAdmin,
    browser,
    paginaAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('guion')
    let idFormulario = ''
    let slug = ''
    let idVersion1 = ''
    let idActivo = ''

    await test.step('1 · iniciar sesión y llegar al panel', async () => {
      // La sesión la trae el fixture; ver la nota de cabecera y
      // `01-acceso.spec.ts`, que mantiene en rojo el inicio de sesión real.
      await paginaAdmin.goto(RUTA_FORMULARIOS)
      await expect(paginaAdmin.getByRole('heading', { level: 1, name: 'Formularios' })).toBeVisible()
    })

    await test.step('2 · subir una imagen por el pipeline de media', async () => {
      const { activo, urlDeStaging } = await subirImagen(apiAdmin, pngDePrueba(480, 320), 'portada.png')
      recursos.activo(activo.id)
      idActivo = activo.id

      expect(activo.status).toBe('ready')
      expect(activo.url ?? '').toContain(MEDIA_PUBLIC_BASE_URL)
      expect(activo.variantes.map((variante) => variante.label).sort()).toEqual(['w1920', 'w640'])

      // Staging queda vacío: nada sin validar sobrevive al pipeline.
      const enStaging = await apiAdmin.fetch(urlDeStaging)
      expect(enStaging.status()).not.toBe(200)
    })

    await test.step('3 · crear el formulario, tematizarlo y armarlo entero', async () => {
      const formulario = await crearFormulario(apiAdmin, titulo)
      recursos.formulario(formulario.id)
      idFormulario = formulario.id
      slug = formulario.slug

      await guardarBorrador(
        apiAdmin,
        idFormulario,
        formulario.draft?.revision ?? 1,
        documentoDelGuion(titulo, idActivo),
      )

      // Y se comprueba en el editor, que es donde lo vería una persona: tema
      // aplicado, cuatro bloques, dos pantallas finales y listo para publicar.
      await paginaAdmin.goto(rutaEditor(idFormulario))
      const recorrido = paginaAdmin.getByRole('navigation', { name: 'Recorrido del formulario' })
      await expect(recorrido.getByRole('list', { name: 'Bloques del formulario' }).getByRole('listitem')).toHaveCount(4)
      await expect(recorrido.getByRole('list', { name: 'Pantallas finales' }).getByRole('listitem')).toHaveCount(2)
      await expect(insigniaPublicable(paginaAdmin)).toHaveAttribute('data-publicable', 'si')
    })

    await test.step('4 · configurar la valoración con caras desde el editor', async () => {
      await paginaAdmin
        .getByRole('navigation', { name: 'Recorrido del formulario' })
        .locator('[data-bloque="satisfaccion"] button:not([aria-label])')
        .first()
        .click()

      const apariencia = await abrirPestana(paginaAdmin, 'Apariencia')
      await expect(apariencia.getByLabel('Símbolo')).toHaveValue('faces')

      // Se cambia a estrellas y se vuelve a caras: los dos símbolos existen y el
      // cambio llega al documento.
      await apariencia.getByLabel('Símbolo').selectOption('stars')
      await expect(
        paginaAdmin.getByRole('region', { name: 'Previsualización' }).getByRole('radiogroup'),
      ).toHaveAttribute('data-apariencia', 'stars')

      await apariencia.getByLabel('Símbolo').selectOption('faces')
      await apariencia.getByLabel('Escala').selectOption('5')
      await guardarBorradorDesdeElEditor(paginaAdmin)

      const { definition } = await leerFormulario(apiAdmin, idFormulario)
      const valoracion = definition.blocks.find((bloque) => bloque.id === 'satisfaccion')
      expect(valoracion).toMatchObject({ appearance: 'faces', scale: 5 })
    })

    await test.step('5 · publicar la primera versión', async () => {
      const version = await publicar(apiAdmin, idFormulario)
      expect(version.versionNumber).toBe(1)
      idVersion1 = version.id

      // El editor ya ofrece el enlace público.
      await paginaAdmin.reload()
      await expect(paginaAdmin.getByRole('link', { name: 'Ver publicado' })).toHaveAttribute(
        'href',
        rutaPublica(slug),
      )
    })

    await test.step('6 · responder la rama larga, con las tarjetas con imagen', async () => {
      const { contexto, pagina } = await participante(browser)

      await abrirFormularioPublico(pagina, slug, 'bienvenida')
      // La portada se sirve desde el bucket público.
      await expect(pagina.locator(`img[src*="${MEDIA_PUBLIC_BASE_URL}"]`).first()).toBeVisible()

      await avanzarHasta(pagina, 'formato')
      const opciones = pagina.getByRole('radiogroup')
      await expect(opciones).toHaveAttribute('data-presentacion', 'image_cards')
      await pagina.getByRole('radio', { name: 'El taller práctico' }).click()

      await avanzarHasta(pagina, 'satisfaccion')
      await expect(pagina.getByRole('radiogroup')).toHaveAttribute('data-apariencia', 'faces')
      await pagina.getByRole('radio', { name: '5 de 5: Muy bien' }).click()

      await avanzarHasta(pagina, 'detalle')
      await pagina.getByRole('textbox').fill('El taller, sin duda.')
      await avanzarHastaFinal(pagina, 'fin-gracias')

      await contexto.close()
    })

    await test.step('7 · responder la rama corta: la bifurcación se salta dos pantallas', async () => {
      const { contexto, pagina } = await participante(browser)

      await abrirFormularioPublico(pagina, slug, 'bienvenida')
      await avanzarHasta(pagina, 'formato')
      await pagina.getByRole('radio', { name: 'Ninguno, la verdad' }).click()
      await avanzarHastaFinal(pagina, 'fin-lastima')

      await expect(pantalla(pagina, 'satisfaccion')).toHaveCount(0)
      await expect(pantalla(pagina, 'detalle')).toHaveCount(0)

      await contexto.close()
    })

    const participanteQueVuelve = await test.step('8 · dejar una sesión a medias', async () => {
      const { contexto, pagina } = await participante(browser)

      await abrirFormularioPublico(pagina, slug, 'bienvenida')
      await avanzarHasta(pagina, 'formato')
      await pagina.getByRole('radio', { name: 'Las charlas cortas' }).click()
      await avanzarHasta(pagina, 'satisfaccion')
      await pagina.close()

      return contexto
    })

    const fotoAntes = await test.step('9 · fotografiar el estado de la versión 1', async () => {
      const respuestas = await respuestasDeFormulario(idFormulario)
      const resultados = await leerResultados(apiAdmin, idFormulario, { versionId: idVersion1 })
      const csv = await descargarCsv(apiAdmin, idFormulario, { versionId: idVersion1 })

      expect(resultados.resumen.iniciadas).toBe(3)
      expect(resultados.resumen.completadas).toBe(2)

      return { respuestas, resultados, csv }
    })

    await test.step('10 · publicar una segunda versión, con otra pregunta y otros textos', async () => {
      const { definition, draft } = await leerFormulario(apiAdmin, idFormulario)
      const bloques = definition.blocks.map((bloque) =>
        bloque.id === 'formato' && bloque.type === 'single_choice'
          ? {
              ...bloque,
              title: '¿Con qué parte te quedas?',
              choices: bloque.choices.map((opcion) =>
                opcion.id === 'op-taller' ? { ...opcion, label: 'Con el taller' } : opcion,
              ),
            }
          : bloque,
      )

      const version = await guardarYPublicar(apiAdmin, idFormulario, draft?.revision ?? 1, {
        ...definition,
        blocks: [
          ...bloques,
          {
            id: 'volveras',
            type: 'single_choice',
            title: '¿Volverías el año que viene?',
            required: false,
            presentation: 'buttons',
            randomizeChoices: false,
            choices: [
              { id: 'op-si', label: 'Sí', value: 'si' },
              { id: 'op-no', label: 'No', value: 'no' },
            ],
          },
        ],
      })

      expect(version.version.versionNumber).toBe(2)
    })

    await test.step('11 · los resultados históricos no se han movido ni un milímetro', async () => {
      expect(await respuestasDeFormulario(idFormulario)).toEqual(fotoAntes.respuestas)

      const ahora = await leerResultados(apiAdmin, idFormulario, { versionId: idVersion1 })
      expect(ahora.resumen).toEqual(fotoAntes.resultados.resumen)
      expect(ahora.tabla.items).toEqual(fotoAntes.resultados.tabla.items)

      const formato = ahora.preguntas.find((pregunta) => pregunta.questionId === 'formato')
      expect(formato?.titulo).toBe('¿Qué formato te ha gustado más?')
      expect((formato?.distribucion ?? []).map((valor) => valor.etiqueta)).toContain(
        'El taller práctico',
      )
      expect(ahora.preguntas.map((pregunta) => pregunta.questionId)).not.toContain('volveras')

      const csv = await descargarCsv(apiAdmin, idFormulario, { versionId: idVersion1 })
      expect(csv.texto).toBe(fotoAntes.csv.texto)
    })

    await test.step('12 · quien dejó la sesión a medias la reanuda en su versión', async () => {
      const pagina = await participanteQueVuelve.newPage()
      await pagina.goto(rutaPublica(slug))

      await expect(pagina.getByText(AVISO_REANUDACION)).toBeVisible()
      await expect(pantalla(pagina, 'satisfaccion')).toBeVisible()
      // La pregunta que solo existe en la versión 2 no aparece en su recorrido.
      await expect(pantalla(pagina, 'volveras')).toHaveCount(0)
      await expect(pagina.getByRole('heading', { name: '¿Con qué parte te quedas?' })).toHaveCount(0)

      await pagina.getByRole('radio', { name: '2 de 5' }).click()
      await avanzarHasta(pagina, 'detalle')
      await avanzarHastaFinal(pagina, 'fin-gracias')

      const sesiones = await sesionesDeFormulario(idFormulario)
      expect(sesiones).toHaveLength(3)
      expect(sesiones.every((sesion) => sesion.version_id === idVersion1)).toBeTruthy()

      await participanteQueVuelve.close()
    })

    await test.step('13 · descargar el CSV desde el panel y contrastarlo con el tablero', async () => {
      await paginaAdmin.goto(rutaResultados(idFormulario))
      await expect(paginaAdmin.getByRole('heading', { level: 1, name: 'Resultados' })).toBeVisible()

      await expect(paginaAdmin.locator('[data-cifra="iniciadas"] dd').first()).toHaveText('3')
      await expect(paginaAdmin.locator('[data-cifra="completadas"] dd').first()).toHaveText('3')

      // Sin filtro de versión, el CSV exporta la versión activa (la 2), que no
      // tiene ninguna sesión: para el histórico hay que elegir la versión 1.
      await paginaAdmin.getByLabel('Versión').selectOption({ label: 'Versión 1' })
      await expect(paginaAdmin.locator('[data-cifra="iniciadas"] dd').first()).toHaveText('3')

      const [descarga] = await Promise.all([
        paginaAdmin.waitForEvent('download'),
        paginaAdmin.getByRole('link', { name: 'Descargar CSV' }).click(),
      ])
      expect(descarga.suggestedFilename()).toContain('-v1-resultados.csv')

      const texto = await readFile(await descarga.path(), 'utf8')
      const filas = parsearCsv(texto)
      const cabeceras = filas[0] ?? []
      const datos = filas.slice(1).filter((fila) => (fila[0] ?? '') !== '')

      expect(datos).toHaveLength(3)
      expect(cabeceras).toContain('¿Qué formato te ha gustado más?')
      expect(cabeceras).not.toContain('¿Volverías el año que viene?')

      const iFormato = columna(cabeceras, '¿Qué formato te ha gustado más?')
      const iSatisfaccion = columna(cabeceras, '¿Cómo valorarías el evento?')
      const elegidos = datos.map((fila) => fila[iFormato]).sort()
      expect(elegidos).toEqual(['El taller práctico', 'Las charlas cortas', 'Ninguno, la verdad'])

      const valoraciones = datos.map((fila) => fila[iSatisfaccion]).filter((valor) => valor !== '')
      expect(valoraciones.sort()).toEqual(['2', '5'])
    })
  })
})
