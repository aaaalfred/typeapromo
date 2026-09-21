/**
 * Subida de imágenes desde el editor.
 *
 * Completa el criterio de aceptación 3 por el lado que faltaba. `03-media.spec.ts`
 * recorre el pipeline por HTTP y demuestra que los bytes van al bucket privado,
 * se validan y acaban en el público; aquí se demuestra que **un creador puede
 * hacerlo sin salir del editor**, que es lo que pedía PLAN.md fase 6.
 *
 * Se ejerce el recorrido entero con un archivo real: elegir, subir, esperar a
 * que el servidor procese, ver la miniatura, comprobar que el borrador guardado
 * apunta al activo publicado y que la previsualización lo pinta desde el bucket
 * público. Y después, que quitarla desengancha sin borrar el activo —que es
 * como está diseñado el borrado seguro—.
 */

import { leerFormulario } from './utiles/api'
import {
  abrirPestana,
  crearFormularioDesdeElPanel,
  guardarBorradorDesdeElEditor,
  seleccionarBloque,
} from './utiles/editor'
import { MEDIA_PUBLIC_BASE_URL } from './utiles/entorno'
import { expect, test } from './utiles/fixtures'
import { pngDePrueba } from './utiles/imagen'

test.describe('Subida de imágenes desde el editor', () => {
  test('CA3 · un creador sube la imagen de un bloque sin salir del editor', async ({
    paginaAdmin,
    apiAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('subida-editor')
    let idFormulario = ''

    await test.step('crear el formulario y abrir la pestaña de media', async () => {
      idFormulario = await crearFormularioDesdeElPanel(paginaAdmin, titulo)
      recursos.formulario(idFormulario)

      // Un formulario nuevo abre con los ajustes generales: hasta que no hay un
      // bloque seleccionado, el panel de propiedades —y por tanto la pestaña de
      // media— no existe.
      await seleccionarBloque(paginaAdmin, 'welcome')
      await abrirPestana(paginaAdmin, 'Media')
    })

    const campo = paginaAdmin.getByLabel('Archivo de imagen para Imagen')

    await test.step('antes de subir no hay imagen, y el control ofrece subirla', async () => {
      await expect(paginaAdmin.getByRole('button', { name: 'Subir imagen' })).toBeVisible()
      await expect(paginaAdmin.getByRole('button', { name: 'Quitar' })).toHaveCount(0)
    })

    await test.step('elegir el archivo lo sube y el servidor lo procesa', async () => {
      await campo.setInputFiles({
        name: 'portada.png',
        mimeType: 'image/png',
        buffer: pngDePrueba(640, 480),
      })

      // El botón pasa a «Reemplazar» solo cuando el activo está `ready`: es la
      // señal de que el identificador ha llegado al documento.
      await expect(paginaAdmin.getByRole('button', { name: 'Reemplazar' })).toBeVisible({
        timeout: 30_000,
      })
      await expect(paginaAdmin.getByText('640 × 480 px')).toBeVisible()
    })

    let idActivo = ''

    await test.step('el borrador guardado apunta al activo publicado', async () => {
      await guardarBorradorDesdeElEditor(paginaAdmin)

      const formulario = await leerFormulario(apiAdmin, idFormulario)
      const bloque = formulario.definition.blocks[0]
      expect(bloque?.mediaAssetId).toBeDefined()

      idActivo = bloque?.mediaAssetId ?? ''
      recursos.activo(idActivo)

      // Un UUID, no el nombre del archivo ni una clave de bucket.
      expect(idActivo).toMatch(/^[0-9a-f-]{36}$/)
    })

    await test.step('lo que se pinta viene del bucket público, no de una URL local', async () => {
      const miniatura = paginaAdmin.locator('img').first()
      const fuente = await miniatura.getAttribute('src')

      expect(fuente).not.toBeNull()
      expect(fuente?.startsWith('blob:')).toBe(false)
      expect(fuente).toContain(MEDIA_PUBLIC_BASE_URL)

      const respuesta = await apiAdmin.get(fuente ?? '')
      expect(respuesta.status()).toBe(200)
      expect(respuesta.headers()['content-type']).toContain('image/')
    })

    await test.step('quitar desengancha del documento pero no borra el activo', async () => {
      await paginaAdmin.getByRole('button', { name: 'Quitar' }).click()
      await expect(paginaAdmin.getByRole('button', { name: 'Subir imagen' })).toBeVisible()

      await guardarBorradorDesdeElEditor(paginaAdmin)

      const formulario = await leerFormulario(apiAdmin, idFormulario)
      expect(formulario.definition.blocks[0]?.mediaAssetId).toBeUndefined()

      // El activo sigue existiendo: lo retira el cron de limpieza cuando nadie
      // lo referencie, no el botón «Quitar».
      const activo = await apiAdmin.get(`/api/media/${idActivo}`)
      expect(activo.status()).toBe(200)
    })
  })

  test('CA3 · el editor rechaza un archivo que no es una imagen admitida', async ({
    paginaAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('subida-rechazo')

    const idFormulario = await crearFormularioDesdeElPanel(paginaAdmin, titulo)
    recursos.formulario(idFormulario)
    await seleccionarBloque(paginaAdmin, 'welcome')
    await abrirPestana(paginaAdmin, 'Media')

    await paginaAdmin.getByLabel('Archivo de imagen para Imagen').setInputFiles({
      name: 'animado.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a', 'ascii'),
    })

    await expect(paginaAdmin.getByText(/Solo se admiten imágenes JPEG, PNG o WebP/)).toBeVisible()
    await expect(paginaAdmin.getByRole('button', { name: 'Reemplazar' })).toHaveCount(0)
  })
})
