/**
 * Accesibilidad automatizada con axe-core (PLAN.md, fase 8).
 *
 * Las tres superficies que pide el plan —inicio de sesión, editor y recorrido
 * público— más las dos que comparten su chrome: el listado y los resultados.
 *
 * Qué prueba esto y qué no. axe encuentra faltas mecánicas —contraste
 * insuficiente, controles sin nombre accesible, jerarquías de encabezado rotas,
 * regiones sin etiquetar— y no encuentra nada de lo que depende del criterio
 * humano: si el orden de tabulación tiene sentido, si un mensaje de error dice
 * algo útil, si la animación marea. Eso último se cubre en los demás ficheros,
 * donde el recorrido se hace con teclado de verdad.
 *
 * Falla ante violaciones de impacto `serious` o `critical`.
 */

import { crearFormulario, guardarYPublicar } from './utiles/api'
import { revisarAccesibilidad } from './utiles/accesibilidad'
import { documentoConBifurcacion, documentoDeValoraciones } from './utiles/documentos'
import { abrirPanelDeTema, abrirPestana, anadirBloque } from './utiles/editor'
import { expect, test } from './utiles/fixtures'
import { abrirFormularioPublico, avanzarHasta, avanzarHastaFinal } from './utiles/publico'
import { RUTA_FORMULARIOS, rutaEditor, rutaResultados } from './utiles/rutas'

test.describe('Accesibilidad', () => {
  test('sin violaciones graves en la página de inicio de sesión', async ({ page }) => {
    await page.goto('/iniciar-sesion')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await revisarAccesibilidad(page, 'inicio de sesión')
  })

  test('sin violaciones graves en la pantalla de acceso denegado', async ({ page }) => {
    await page.goto('/acceso-denegado?motivo=workspace-ajeno')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await revisarAccesibilidad(page, 'acceso denegado')
  })

  test('sin violaciones graves en el listado de formularios', async ({
    apiAdmin,
    paginaAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('a11y-listado')
    const formulario = await crearFormulario(apiAdmin, titulo, documentoConBifurcacion(titulo))
    recursos.formulario(formulario.id)

    await paginaAdmin.goto(RUTA_FORMULARIOS)
    await expect(paginaAdmin.getByRole('heading', { level: 1, name: 'Formularios' })).toBeVisible()
    await expect(paginaAdmin.getByRole('listitem').first()).toBeVisible()

    await revisarAccesibilidad(paginaAdmin, 'listado de formularios')
  })

  /**
   * FALLO CONOCIDO DE LA APLICACIÓN — se deja en rojo a propósito.
   *
   * En la lista del recorrido, el **subtítulo del bloque seleccionado** no llega
   * al mínimo AA: `text-neutral-500` (#737373) sobre el fondo de selección
   * `bg-blue-50` (#eff6ff) da **4,35:1**, y WCAG 2.1 §1.4.3 exige 4,5:1 para
   * texto normal (aquí son 12 px).
   *
   * Está en `src/components/editor/lista-bloques.tsx`, en el `<span>` del
   * subtítulo: `class="block truncate text-xs text-neutral-500 …"`. Solo falla
   * en la fila seleccionada; sobre el fondo blanco del resto de filas el mismo
   * gris da 4,74:1 y pasa. Bajar un escalón (`text-neutral-600`, #525252) lo
   * resuelve con 7,0:1 sin tocar nada más.
   *
   * Tiene su punto: es justo el panel donde el editor avisa a quien diseña de
   * que su tema no cumple contraste.
   *
   * No se toca `src/`, no se ablanda el test: cuando esto se arregle, pasa solo.
   */
  test('sin violaciones graves en el editor, con propiedades y con el panel de tema', async ({
    apiAdmin,
    paginaAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('a11y-editor')
    const formulario = await crearFormulario(apiAdmin, titulo, documentoConBifurcacion(titulo))
    recursos.formulario(formulario.id)

    await paginaAdmin.goto(rutaEditor(formulario.id))
    await expect(paginaAdmin.getByRole('heading', { level: 1 })).toBeVisible()

    await revisarAccesibilidad(paginaAdmin, 'editor · ajustes')

    // El panel de propiedades cambia por completo según el bloque: se revisa el
    // que más controles distintos monta.
    await anadirBloque(paginaAdmin, 'Valoración visual')
    await abrirPestana(paginaAdmin, 'Apariencia')
    await revisarAccesibilidad(paginaAdmin, 'editor · propiedades de valoración')

    await abrirPanelDeTema(paginaAdmin)
    await revisarAccesibilidad(paginaAdmin, 'editor · panel de tema')
  })

  test('sin violaciones graves en el recorrido público, pantalla a pantalla', async ({
    apiAdmin,
    page,
    recursos,
  }) => {
    const titulo = recursos.titulo('a11y-publico')
    const documento = documentoConBifurcacion(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    await abrirFormularioPublico(page, formulario.slug, 'bienvenida')
    await revisarAccesibilidad(page, 'público · bienvenida')

    await avanzarHasta(page, 'perfil')
    await revisarAccesibilidad(page, 'público · selección única')

    await page.getByRole('radio', { name: 'En equipo' }).click()
    await avanzarHasta(page, 'tamano')
    await revisarAccesibilidad(page, 'público · escala numérica')

    await page.getByRole('radio', { name: '5', exact: true }).click()
    await avanzarHasta(page, 'comentario')
    await revisarAccesibilidad(page, 'público · texto largo')

    await avanzarHastaFinal(page, 'fin-equipo')
    await revisarAccesibilidad(page, 'público · pantalla final')
  })

  test('sin violaciones graves en las tres apariencias de valoración', async ({
    apiAdmin,
    page,
    recursos,
  }) => {
    const titulo = recursos.titulo('a11y-valoracion')
    const documento = documentoDeValoraciones(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    await abrirFormularioPublico(page, formulario.slug, 'estrellas')
    await revisarAccesibilidad(page, 'público · valoración con estrellas')

    await page.getByRole('radio', { name: '4 de 5' }).click()
    await avanzarHasta(page, 'caras')
    await revisarAccesibilidad(page, 'público · valoración con caras')

    await page.getByRole('radio', { name: '4 de 7' }).click()
    await avanzarHasta(page, 'corazones')
    await revisarAccesibilidad(page, 'público · valoración con corazones')
  })

  test('sin violaciones graves en el panel de resultados', async ({
    apiAdmin,
    page,
    paginaAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('a11y-resultados')
    const documento = documentoConBifurcacion(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    // Con datos: una tabla vacía no ejerce ni cabeceras ni celdas.
    await abrirFormularioPublico(page, formulario.slug, 'bienvenida')
    await avanzarHasta(page, 'perfil')
    await page.getByRole('radio', { name: 'Por mi cuenta' }).click()
    await avanzarHastaFinal(page, 'fin-solo')

    await paginaAdmin.goto(rutaResultados(formulario.id))
    await expect(paginaAdmin.getByRole('table')).toBeVisible()

    await revisarAccesibilidad(paginaAdmin, 'panel de resultados')
  })
})
