/**
 * Criterio de aceptación 5 · «La lógica condicional ejecuta el recorrido
 * correcto y no permite ciclos.»
 *
 * Dos afirmaciones distintas, y las dos se comprueban:
 *
 * 1. **El recorrido correcto.** El mismo formulario publicado se responde dos
 *    veces, en contextos de navegador separados, eligiendo cada rama. Se
 *    comprueba a qué pantallas se llega y —más importante— a cuáles **no**: en
 *    la rama corta, la pregunta de tamaño no debe aparecer nunca.
 * 2. **Sin ciclos.** Un documento con un salto hacia atrás se rechaza al
 *    publicar, con el código concreto del validador. No se «detecta el ciclo en
 *    tiempo de ejecución»: no se llega a crear.
 *
 * El destino lo decide el **servidor** en cada avance, no el navegador: por eso
 * la comprobación final mira la pantalla en la que la base de datos cree que
 * está cada sesión.
 */

import type { Browser } from '@playwright/test'

import { crearFormulario, guardarBorrador, guardarYPublicar, publicarEsperandoRechazo } from './utiles/api'
import { sesionesDeFormulario } from './utiles/base-datos'
import { documentoConBifurcacion, documentoConCiclo } from './utiles/documentos'
import { expect, test } from './utiles/fixtures'
import {
  abrirFormularioPublico,
  avanzarHasta,
  avanzarHastaFinal,
  barraDeProgreso,
  pantalla,
} from './utiles/publico'

/** Contexto limpio: cada recorrido debe empezar sin cookie de sesión previa. */
async function nuevoParticipante(navegador: Browser) {
  const contexto = await navegador.newContext()
  const pagina = await contexto.newPage()
  return { contexto, pagina }
}

test.describe('Lógica condicional', () => {
  test('CA5 · cada rama de la bifurcación recorre las pantallas que le tocan', async ({
    apiAdmin,
    browser,
    recursos,
  }) => {
    const titulo = recursos.titulo('logica')
    const documento = documentoConBifurcacion(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    await test.step('rama larga: quien trabaja en equipo pasa por el tamaño', async () => {
      const { contexto, pagina } = await nuevoParticipante(browser)

      await abrirFormularioPublico(pagina, formulario.slug, 'bienvenida')
      await avanzarHasta(pagina, 'perfil')

      await pagina.getByRole('radio', { name: 'En equipo' }).click()
      await avanzarHasta(pagina, 'tamano')

      await pagina.getByRole('radio', { name: '4', exact: true }).click()
      await avanzarHasta(pagina, 'comentario')

      await avanzarHastaFinal(pagina, 'fin-equipo')
      await expect(
        pagina.getByRole('heading', { name: 'Gracias por contarnos cómo trabaja tu equipo' }),
      ).toBeVisible()

      await contexto.close()
    })

    await test.step('rama corta: quien trabaja solo salta directo a su pantalla final', async () => {
      const { contexto, pagina } = await nuevoParticipante(browser)

      await abrirFormularioPublico(pagina, formulario.slug, 'bienvenida')
      await avanzarHasta(pagina, 'perfil')

      await pagina.getByRole('radio', { name: 'Por mi cuenta' }).click()
      await avanzarHastaFinal(pagina, 'fin-solo')

      // Lo que no debe pasar es tan importante como lo que pasa.
      await expect(pantalla(pagina, 'tamano')).toHaveCount(0)
      await expect(pantalla(pagina, 'comentario')).toHaveCount(0)
      await expect(
        pagina.getByRole('heading', { name: 'Gracias por contarnos que trabajas por tu cuenta' }),
      ).toBeVisible()

      await contexto.close()
    })

    await test.step('cada sesión ha guardado el recorrido que hizo, no el que podría hacer', async () => {
      const sesiones = await sesionesDeFormulario(formulario.id)
      expect(sesiones).toHaveLength(2)
      // La rama larga responde tres preguntas (una en blanco); la corta, una.
      const respondidas = sesiones.map((sesion) => sesion.answered_count).sort()
      expect(respondidas).toEqual([1, 3])
      expect(sesiones.every((sesion) => sesion.status === 'completed')).toBeTruthy()
    })
  })

  test('CA5 · la barra de progreso se ajusta al recorrido efectivo, no al total', async ({
    apiAdmin,
    browser,
    recursos,
  }) => {
    const titulo = recursos.titulo('progreso')
    const documento = documentoConBifurcacion(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    const { contexto, pagina } = await nuevoParticipante(browser)

    await abrirFormularioPublico(pagina, formulario.slug, 'bienvenida')
    const barra = barraDeProgreso(pagina)
    await expect(barra).toBeVisible()

    // Con la bifurcación sin resolver, el progreso es una estimación y así se
    // anuncia (PLAN.md §2.7).
    await expect(barra).toHaveAttribute('aria-valuetext', /aproximadamente/)

    await avanzarHasta(pagina, 'perfil')
    await pagina.getByRole('radio', { name: 'Por mi cuenta' }).click()
    await avanzarHastaFinal(pagina, 'fin-solo')

    await expect(barra).toHaveAttribute('aria-valuenow', '100')
    await expect(barra).toHaveAttribute('aria-valuetext', '100 % completado')

    await contexto.close()
  })

  test('CA5 · un salto hacia atrás se rechaza al publicar: no llega a existir un ciclo', async ({
    apiAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('ciclo')
    const formulario = await crearFormulario(apiAdmin, titulo)
    recursos.formulario(formulario.id)

    await guardarBorrador(
      apiAdmin,
      formulario.id,
      formulario.draft?.revision ?? 1,
      documentoConCiclo(titulo),
    )

    const rechazo = await publicarEsperandoRechazo(apiAdmin, formulario.id)

    expect(rechazo.error.code).toBe('DATOS_INVALIDOS')
    const codigos = (rechazo.error.details?.errors ?? []).map((problema) => problema.code)
    expect(codigos).toContain('RULE_TARGET_BACKWARD')
    expect((rechazo.error.details?.errors ?? [])[0]?.message).toContain('solo se permiten saltos hacia adelante')

    // Y el formulario sigue sin versión activa: no hay nada publicado a medias.
    const ficha = await apiAdmin.get(`/api/forms/${formulario.id}`)
    const { form } = (await ficha.json()) as { form: { activeVersionId: string | null } }
    expect(form.activeVersionId).toBeNull()
  })
})
