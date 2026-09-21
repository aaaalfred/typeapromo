/**
 * Criterio de aceptación 4 · «Estrellas, caras y corazones funcionan
 * visualmente, se navegan con teclado y producen valores analizables.»
 *
 * Las tres partes se comprueban por separado y en este orden, porque cada una
 * puede fallar sin las otras:
 *
 * - **Visualmente**: los tres símbolos se pintan con su escala, y el contenedor
 *   expone `data-apariencia`, `data-escala` y `data-valor-normalizado`.
 * - **Con teclado**: `Inicio`, `Fin`, flechas y dígitos seleccionan sin ratón, y
 *   el foco itinerante deja un único control tabulable.
 * - **Analizables**: lo que se elige llega a `GET /api/forms/:id/results` con su
 *   distribución, su promedio y su normalización, que es lo que permite comparar
 *   una escala de 3 con una de 7.
 */

import { crearFormulario, guardarYPublicar, leerResultados } from './utiles/api'
import { VALORACIONES, documentoDeValoraciones } from './utiles/documentos'
import { expect, test } from './utiles/fixtures'
import {
  abrirFormularioPublico,
  avanzarHasta,
  avanzarHastaFinal,
  errorDePantalla,
} from './utiles/publico'
import { rutaPublica } from './utiles/rutas'

test.describe('Valoración visual', () => {
  test('CA4 · los tres símbolos se pintan, se navegan con teclado y se guardan', async ({
    apiAdmin,
    page,
    recursos,
  }) => {
    const titulo = recursos.titulo('valoracion')
    const documento = documentoDeValoraciones(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    await abrirFormularioPublico(page, formulario.slug, 'estrellas')

    await test.step('estrellas sobre 5: Inicio y flechas', async () => {
      const grupo = page.getByRole('radiogroup')
      await expect(grupo).toHaveAttribute('data-apariencia', 'stars')
      await expect(grupo).toHaveAttribute('data-escala', '5')
      await expect(grupo.getByRole('radio')).toHaveCount(5)

      // Sin valor, el único control tabulable es el primero (foco itinerante).
      const primera = page.getByRole('radio', { name: '1 de 5: Lo peor' })
      await expect(primera).toHaveAttribute('tabindex', '0')
      await expect(page.getByRole('radio', { name: '3 de 5' })).toHaveAttribute('tabindex', '-1')

      await primera.focus()
      await page.keyboard.press('Home')
      await expect(primera).toHaveAttribute('aria-checked', 'true')

      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      const tercera = page.getByRole('radio', { name: '3 de 5' })
      await expect(tercera).toHaveAttribute('aria-checked', 'true')
      await expect(primera).toHaveAttribute('aria-checked', 'false')

      await expect(grupo).toHaveAttribute('data-valor', '3')
      // (3 − 1) / (5 − 1) = 0,5
      await expect(grupo).toHaveAttribute('data-valor-normalizado', '0.5')
      await expect(page.getByText('Has elegido 3 de 5.')).toBeVisible()

      await avanzarHasta(page, 'caras')
    })

    await test.step('caras sobre 7: selección directa por dígito', async () => {
      const grupo = page.getByRole('radiogroup')
      await expect(grupo).toHaveAttribute('data-apariencia', 'faces')
      await expect(grupo).toHaveAttribute('data-escala', '7')
      await expect(grupo.getByRole('radio')).toHaveCount(7)

      await page.getByRole('radio', { name: '1 de 7: Lo peor' }).focus()
      await page.keyboard.press('6')

      await expect(page.getByRole('radio', { name: '6 de 7' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await expect(grupo).toHaveAttribute('data-valor', '6')
      await expect(page.getByText('Has elegido 6 de 7.')).toBeVisible()

      await avanzarHasta(page, 'corazones')
    })

    await test.step('corazones sobre 3: Fin lleva al máximo', async () => {
      const grupo = page.getByRole('radiogroup')
      await expect(grupo).toHaveAttribute('data-apariencia', 'hearts')
      await expect(grupo).toHaveAttribute('data-escala', '3')
      await expect(grupo.getByRole('radio')).toHaveCount(3)

      await page.getByRole('radio', { name: '1 de 3: Lo peor' }).focus()
      await page.keyboard.press('End')

      await expect(page.getByRole('radio', { name: '3 de 3: Lo mejor' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await expect(grupo).toHaveAttribute('data-valor-normalizado', '1')

      await avanzarHastaFinal(page, 'fin')
    })

    await test.step('lo elegido llega a los resultados y es comparable entre escalas', async () => {
      const resultados = await leerResultados(apiAdmin, formulario.id)

      expect(resultados.resumen.iniciadas).toBe(1)
      expect(resultados.resumen.completadas).toBe(1)

      const porId = new Map(resultados.preguntas.map((pregunta) => [pregunta.questionId, pregunta]))

      for (const especificacion of VALORACIONES) {
        const metrica = porId.get(especificacion.id)
        expect(metrica, `Falta la métrica de «${especificacion.id}»`).toBeDefined()
        expect(metrica?.tipo).toBe('rating')
        expect(metrica?.respondidas).toBe(1)
        expect(metrica?.escalas).toEqual([especificacion.scale])
        // La distribución guarda el entero elegido, no el normalizado.
        expect(metrica?.distribucion).not.toBeNull()
      }

      expect(porId.get('estrellas')?.promedio).toBe(3)
      expect(porId.get('estrellas')?.promedioNormalizado).toBeCloseTo(0.5, 4)

      expect(porId.get('caras')?.promedio).toBe(6)
      expect(porId.get('caras')?.promedioNormalizado).toBeCloseTo(5 / 6, 3)

      expect(porId.get('corazones')?.promedio).toBe(3)
      expect(porId.get('corazones')?.promedioNormalizado).toBeCloseTo(1, 4)
    })
  })

  test('CA4 · una valoración obligatoria no deja avanzar en blanco', async ({
    apiAdmin,
    page,
    recursos,
  }) => {
    const titulo = recursos.titulo('valoracion-obligatoria')
    const documento = documentoDeValoraciones(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    await page.goto(rutaPublica(formulario.slug))
    await expect(page.locator('form[data-bloque="estrellas"]')).toBeVisible()

    await page.locator('button[data-accion="avanzar"]').click()

    await expect(errorDePantalla(page, 'estrellas')).toHaveText('Esta pregunta es obligatoria.')
    // Y no se ha movido de pantalla.
    await expect(page.locator('form[data-bloque="estrellas"]')).toBeVisible()
  })
})
