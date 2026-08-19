/**
 * Prueba responsiva (PR.md · «Pruebas automatizadas»).
 *
 * Toda la suite corre ya en los dos proyectos de `playwright.config.ts`
 * —`escritorio` y `movil` (Pixel 7)—, así que el grueso de la cobertura
 * responsiva sale gratis: si el editor o el recorrido público se rompieran en
 * 412 px, los otros once ficheros fallarían en el proyecto móvil.
 *
 * Lo que este fichero añade es lo que **solo** se puede afirmar comparando
 * anchos: que ninguna pantalla desborda en horizontal —el fallo responsivo más
 * común y el más molesto de usar—, y que lo que en escritorio son tres columnas
 * en móvil sigue siendo alcanzable en lugar de quedarse fuera de la ventana.
 */

import { crearFormulario, guardarYPublicar } from './utiles/api'
import { documentoConBifurcacion } from './utiles/documentos'
import { expect, test } from './utiles/fixtures'
import { abrirFormularioPublico, avanzarHasta, avanzarHastaFinal } from './utiles/publico'
import { RUTA_FORMULARIOS, rutaEditor, rutaResultados } from './utiles/rutas'

/** `true` si la página se puede desplazar en horizontal. */
async function desbordaEnHorizontal(pagina: import('@playwright/test').Page): Promise<boolean> {
  return pagina.evaluate(() => {
    const raiz = document.documentElement
    // Un píxel de margen: los redondeos de subpíxel no son un desbordamiento.
    return raiz.scrollWidth > raiz.clientWidth + 1
  })
}

test.describe('Diseño responsivo', () => {
  test('el recorrido público se responde entero sin desbordar en horizontal', async ({
    apiAdmin,
    page,
    recursos,
  }) => {
    const titulo = recursos.titulo('responsivo')
    const documento = documentoConBifurcacion(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    await abrirFormularioPublico(page, formulario.slug, 'bienvenida')
    expect(await desbordaEnHorizontal(page), 'La bienvenida desborda').toBeFalsy()

    await avanzarHasta(page, 'perfil')
    expect(await desbordaEnHorizontal(page), 'La selección única desborda').toBeFalsy()

    await page.getByRole('radio', { name: 'En equipo' }).click()
    await avanzarHasta(page, 'tamano')
    // La escala de 1 a 10 es la pantalla más ancha del producto.
    expect(await desbordaEnHorizontal(page), 'La escala numérica desborda').toBeFalsy()

    // En la escala numérica los extremos llevan su etiqueta pegada al número.
    await page.getByRole('radio', { name: '10: Muchas' }).click()
    await avanzarHasta(page, 'comentario')
    await page.getByRole('textbox').fill('Una respuesta larga '.repeat(20))
    expect(await desbordaEnHorizontal(page), 'El texto largo desborda').toBeFalsy()

    await avanzarHastaFinal(page, 'fin-equipo')
    expect(await desbordaEnHorizontal(page), 'La pantalla final desborda').toBeFalsy()
  })

  test('el panel y el editor caben en la ventana en los dos tamaños', async ({
    apiAdmin,
    paginaAdmin,
    recursos,
  }, informacion) => {
    const titulo = recursos.titulo('responsivo-panel')
    const documento = documentoConBifurcacion(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)

    await paginaAdmin.goto(RUTA_FORMULARIOS)
    await expect(paginaAdmin.getByRole('heading', { level: 1, name: 'Formularios' })).toBeVisible()
    expect(await desbordaEnHorizontal(paginaAdmin), 'El listado desborda').toBeFalsy()

    await paginaAdmin.goto(rutaEditor(formulario.id))

    // Las tres áreas del editor existen en los dos tamaños; lo que cambia es si
    // están una al lado de otra o apiladas.
    const recorrido = paginaAdmin.getByRole('navigation', { name: 'Recorrido del formulario' })
    const vista = paginaAdmin.getByRole('region', { name: 'Previsualización' })
    const propiedades = paginaAdmin.getByRole('complementary')

    await expect(recorrido).toBeVisible()
    await expect(vista).toBeVisible()
    await expect(propiedades).toBeVisible()
    expect(await desbordaEnHorizontal(paginaAdmin), 'El editor desborda').toBeFalsy()

    const cajaRecorrido = await recorrido.boundingBox()
    const cajaVista = await vista.boundingBox()
    expect(cajaRecorrido).not.toBeNull()
    expect(cajaVista).not.toBeNull()

    if (informacion.project.name === 'escritorio') {
      // Tres columnas: la previsualización empieza a la derecha del recorrido.
      expect(cajaVista?.x ?? 0).toBeGreaterThan(cajaRecorrido?.x ?? 0)
    } else {
      // Una columna: la previsualización queda debajo, no fuera de la ventana.
      expect(cajaVista?.y ?? 0).toBeGreaterThan(cajaRecorrido?.y ?? 0)
    }
  })

  test('la tabla de resultados se desplaza dentro de su región, no arrastra la página', async ({
    apiAdmin,
    page,
    paginaAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('responsivo-resultados')
    const documento = documentoConBifurcacion(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    await abrirFormularioPublico(page, formulario.slug, 'bienvenida')
    await avanzarHasta(page, 'perfil')
    await page.getByRole('radio', { name: 'Por mi cuenta' }).click()
    await avanzarHastaFinal(page, 'fin-solo')

    await paginaAdmin.goto(rutaResultados(formulario.id))
    await expect(paginaAdmin.getByRole('table')).toBeVisible()

    // Una tabla con una columna por pregunta no cabe en 412 px, y eso está
    // bien: lo que no puede es empujar la página entera.
    const region = paginaAdmin.getByRole('region', { name: 'Tabla de respuestas' })
    await expect(region).toBeVisible()
    await expect(region).toHaveAttribute('tabindex', '0')

    expect(await desbordaEnHorizontal(paginaAdmin), 'El panel de resultados desborda').toBeFalsy()
  })
})
