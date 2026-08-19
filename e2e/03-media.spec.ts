/**
 * Criterio de aceptación 3 · «Las imágenes pasan por staging privado y solo se
 * muestran desde el bucket público después de validarse.»
 *
 * El recorrido se hace por HTTP, sin atajos: intención de subida, `PUT`
 * prefirmado **directo al bucket privado** —los bytes no pasan por la
 * aplicación en ningún momento— y `complete`. Después se comprueban las dos
 * mitades del criterio: que lo que se sirve viene del bucket público y que en el
 * privado ya no queda nada.
 *
 * NOTA SOBRE EL ALCANCE. Aquí la subida se ejerce **por API a propósito**: lo
 * que se comprueba es el pipeline —bucket privado, validación por firma
 * binaria, publicación— sin que la interfaz se interponga. El mismo recorrido
 * desde el editor, con un `<input type="file">` real, está en
 * `13-subida-editor.spec.ts`. Los dos hacen falta: si un día se rompe, conviene
 * saber si el fallo está en el pipeline o en el control que lo invoca.
 */

import { guardarBorradorDesdeElEditor, abrirPestana } from './utiles/editor'
import { guardarYPublicar, leerFormulario } from './utiles/api'
import { documentoMinimo } from './utiles/documentos'
import { crearFormulario } from './utiles/api'
import { expect, test } from './utiles/fixtures'
import { MEDIA_PUBLIC_BASE_URL } from './utiles/entorno'
import { pngDePrueba, subirImagen } from './utiles/imagen'
import { rutaEditor, rutaPublica } from './utiles/rutas'

test.describe('Pipeline de imágenes', () => {
  test('CA3 · la imagen recorre staging privado, se valida y acaba en el bucket público', async ({
    apiAdmin,
    recursos,
  }) => {
    const { activo, urlDeStaging } = await subirImagen(apiAdmin, pngDePrueba(320, 240))
    recursos.activo(activo.id)

    await test.step('el activo queda listo, en WebP y sin rastro del PNG original', async () => {
      expect(activo.status).toBe('ready')
      expect(activo.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(activo.width).toBe(320)
      expect(activo.height).toBe(240)
      expect(activo.url).not.toBeNull()
    })

    await test.step('las URL públicas salen del bucket público, no del privado', async () => {
      expect(activo.url ?? '').toContain(MEDIA_PUBLIC_BASE_URL)
      expect(activo.url ?? '').not.toContain('staging')

      const etiquetas = activo.variantes.map((variante) => variante.label).sort()
      expect(etiquetas).toEqual(['w1920', 'w640'])
      for (const variante of activo.variantes) {
        expect(variante.mimeType).toBe('image/webp')
        expect(variante.url).toContain(MEDIA_PUBLIC_BASE_URL)
        // `withoutEnlargement`: una imagen de 320 px no se interpola a 1920.
        expect(variante.width).toBeLessThanOrEqual(320)
      }
    })

    await test.step('el objeto público se sirve de verdad, con caché inmutable', async () => {
      const respuesta = await apiAdmin.fetch(activo.url ?? '')
      expect(respuesta.status()).toBe(200)
      expect(respuesta.headers()['content-type']).toBe('image/webp')
      expect(respuesta.headers()['cache-control'] ?? '').toContain('immutable')
    })

    await test.step('el objeto de staging ha desaparecido y nunca fue legible sin firma', async () => {
      const respuesta = await apiAdmin.fetch(urlDeStaging)
      expect(
        respuesta.status(),
        'El bucket de staging no debería servir nada sin firma; y además el objeto ya se borró al promocionar.',
      ).not.toBe(200)
    })
  })

  test('CA3 · lo que no es una imagen admitida se rechaza aunque el cliente diga que lo es', async ({
    apiAdmin,
  }) => {
    // Un GIF de un píxel, declarado como PNG. El `Content-Type` lo pone quien
    // sube; la decisión la toman los bytes.
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

    const intento = await apiAdmin.post('/api/media/upload-intent', {
      data: { mimeType: 'image/png', byteSize: gif.byteLength, filename: 'trampa.png' },
    })
    expect(intento.status()).toBe(201)
    const { asset, upload } = (await intento.json()) as {
      asset: { id: string }
      upload: { url: string }
    }

    const carga = await apiAdmin.fetch(upload.url, {
      method: 'PUT',
      headers: { 'content-type': 'image/png', 'content-length': String(gif.byteLength) },
      data: gif,
    })
    expect(carga.ok()).toBeTruthy()

    const completar = await apiAdmin.post(`/api/media/${asset.id}/complete`)
    expect(completar.ok()).toBeFalsy()
    const cuerpo = (await completar.json()) as { error: { message: string } }
    expect(cuerpo.error.message).toContain('Los GIF no se admiten')

    // El activo queda marcado como fallido, no a medias.
    const ficha = await apiAdmin.get(`/api/media/${asset.id}`)
    const { asset: fallido } = (await ficha.json()) as { asset: { status: string } }
    expect(fallido.status).toBe('failed')

    await apiAdmin.delete(`/api/media/${asset.id}`)
  })

  test('CA3 · la imagen publicada se muestra en la experiencia pública', async ({
    apiAdmin,
    page,
    recursos,
  }) => {
    const { activo } = await subirImagen(apiAdmin, pngDePrueba(400, 300))
    recursos.activo(activo.id)

    const titulo = recursos.titulo('media')
    const formulario = await crearFormulario(apiAdmin, titulo, documentoMinimo(titulo))
    recursos.formulario(formulario.id)

    const base = documentoMinimo(titulo)
    const primerBloque = base.blocks[0]
    if (primerBloque === undefined) throw new Error('El documento mínimo se ha quedado sin bloques.')

    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, {
      ...base,
      blocks: [{ ...primerBloque, mediaAssetId: activo.id }],
    })

    await page.goto(rutaPublica(formulario.slug))

    const imagen = page.locator(`img[src*="${MEDIA_PUBLIC_BASE_URL}"]`).first()
    await expect(imagen).toBeVisible()
    // Se sirve la variante grande, que es la que elige `MapaDeMedios`.
    await expect(imagen).toHaveAttribute('src', /w1920\.webp$/)
  })

  test('CA3 · un activo referenciado por una versión publicada no se puede borrar', async ({
    apiAdmin,
    recursos,
  }) => {
    const { activo } = await subirImagen(apiAdmin, pngDePrueba(200, 200))
    recursos.activo(activo.id)

    const titulo = recursos.titulo('media-ref')
    const formulario = await crearFormulario(apiAdmin, titulo, documentoMinimo(titulo))
    recursos.formulario(formulario.id)

    const base = documentoMinimo(titulo)
    const primerBloque = base.blocks[0]
    if (primerBloque === undefined) throw new Error('El documento mínimo se ha quedado sin bloques.')

    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, {
      ...base,
      blocks: [{ ...primerBloque, mediaAssetId: activo.id }],
    })

    const borrado = await apiAdmin.delete(`/api/media/${activo.id}`)
    expect(borrado.status()).toBe(409)
    const cuerpo = (await borrado.json()) as { error: { code: string; message: string } }
    expect(cuerpo.error.code).toBe('ACTIVO_REFERENCIADO')

    // Y sigue sirviéndose: el rechazo no ha roto nada.
    const respuesta = await apiAdmin.fetch(activo.url ?? '')
    expect(respuesta.status()).toBe(200)
  })

  test('CA3 · el editor pinta en la previsualización un activo ya publicado', async ({
    apiAdmin,
    paginaAdmin,
    recursos,
  }) => {
    const { activo } = await subirImagen(apiAdmin, pngDePrueba(300, 200))
    recursos.activo(activo.id)

    const titulo = recursos.titulo('media-editor')

    // El documento **ya** referencia el activo antes de abrir el editor: así se
    // ejerce la precarga, que es el camino por el que el editor descubre las
    // imágenes que no ha subido él en esta sesión.
    const base = documentoMinimo(titulo)
    const documento = {
      ...base,
      blocks: base.blocks.map((bloque, indice) =>
        indice === 0 ? { ...bloque, mediaAssetId: activo.id } : bloque,
      ),
    }

    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)

    await paginaAdmin.goto(rutaEditor(formulario.id))
    await paginaAdmin
      .getByRole('navigation', { name: 'Recorrido del formulario' })
      .locator('[data-bloque="nombre"] button:not([aria-label])')
      .first()
      .click()

    await test.step('la previsualización la pinta desde el bucket público', async () => {
      const imagen = paginaAdmin.getByRole('region', { name: 'Previsualización' }).locator('img')
      await expect(imagen.first()).toBeVisible()

      const fuente = await imagen.first().getAttribute('src')
      expect(fuente).toContain(MEDIA_PUBLIC_BASE_URL)
    })

    await test.step('y el selector del panel de media muestra el mismo activo', async () => {
      await abrirPestana(paginaAdmin, 'Media')

      // «Reemplazar» en lugar de «Subir imagen» es la señal de que el panel ha
      // reconocido el activo que ya traía el documento.
      await expect(paginaAdmin.getByRole('button', { name: 'Reemplazar' })).toBeVisible()
      await expect(paginaAdmin.getByText('300 × 200 px')).toBeVisible()
    })

    await test.step('el borrador conserva la referencia', async () => {
      await guardarBorradorDesdeElEditor(paginaAdmin)
      const { definition } = await leerFormulario(apiAdmin, formulario.id)
      expect(definition.blocks[0]?.mediaAssetId).toBe(activo.id)
    })
  })
})
