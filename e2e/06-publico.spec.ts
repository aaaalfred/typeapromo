/**
 * Criterio de aceptación 6 · «El formulario publicado funciona sin login y
 * puede reanudarse en el mismo navegador.»
 *
 * Se comprueba además el mecanismo con el que PLAN.md §2.1 sustituyó al token
 * en la URL que proponía PR.md: cookie `HttpOnly` con el valor en claro y, en
 * base de datos, **solo su SHA-256**. Esa pareja se verifica hasheando la cookie
 * real del navegador y comparándola con la columna; si alguien decidiera algún
 * día guardar el token tal cual, este test lo diría.
 */

import { createHash } from 'node:crypto'

import type { Browser } from '@playwright/test'

import { crearFormulario, guardarYPublicar } from './utiles/api'
import { sesionesDeFormulario } from './utiles/base-datos'
import { documentoConBifurcacion } from './utiles/documentos'
import { expect, test } from './utiles/fixtures'
import {
  AVISO_REANUDACION,
  abrirFormularioPublico,
  avanzarHasta,
  avanzarHastaFinal,
  pantalla,
} from './utiles/publico'
import { rutaPublica } from './utiles/rutas'

/** Publica un formulario con bifurcación y devuelve su ficha. */
async function publicarFormulario(
  api: Parameters<typeof crearFormulario>[0],
  titulo: string,
): Promise<{ id: string; slug: string }> {
  const documento = documentoConBifurcacion(titulo)
  const formulario = await crearFormulario(api, titulo, documento)
  await guardarYPublicar(api, formulario.id, formulario.draft?.revision ?? 1, documento)
  return { id: formulario.id, slug: formulario.slug }
}

async function participanteAnonimo(navegador: Browser) {
  const contexto = await navegador.newContext()
  return { contexto, pagina: await contexto.newPage() }
}

test.describe('Experiencia pública', () => {
  test('CA6 · el formulario publicado se responde sin iniciar sesión', async ({
    apiAdmin,
    browser,
    recursos,
  }) => {
    const formulario = await publicarFormulario(apiAdmin, recursos.titulo('publico'))
    recursos.formulario(formulario.id)

    const { contexto, pagina } = await participanteAnonimo(browser)

    await abrirFormularioPublico(pagina, formulario.slug, 'bienvenida')

    // No hay ninguna cookie de sesión administrativa en este navegador.
    const cookiesIniciales = await contexto.cookies()
    expect(cookiesIniciales.filter((cookie) => cookie.name.startsWith('authjs.'))).toEqual([])

    await avanzarHasta(pagina, 'perfil')
    await pagina.getByRole('radio', { name: 'En equipo' }).click()
    await avanzarHasta(pagina, 'tamano')
    await pagina.getByRole('radio', { name: '7', exact: true }).click()
    await avanzarHasta(pagina, 'comentario')
    await pagina.getByRole('textbox').fill('Sin más, gracias.')
    await avanzarHastaFinal(pagina, 'fin-equipo')

    const sesiones = await sesionesDeFormulario(formulario.id)
    expect(sesiones).toHaveLength(1)
    expect(sesiones[0]?.status).toBe('completed')

    await contexto.close()
  })

  test('CA6 · la sesión va en cookie HttpOnly y en la base de datos solo su hash', async ({
    apiAdmin,
    browser,
    recursos,
  }) => {
    const formulario = await publicarFormulario(apiAdmin, recursos.titulo('cookie'))
    recursos.formulario(formulario.id)

    const { contexto, pagina } = await participanteAnonimo(browser)

    await abrirFormularioPublico(pagina, formulario.slug, 'bienvenida')
    await avanzarHasta(pagina, 'perfil')

    const cookie = (await contexto.cookies()).find(
      (actual) => actual.name === `tp_sesion_${formulario.id}`,
    )
    expect(cookie, 'No hay cookie de sesión pública para este formulario').toBeDefined()
    expect(cookie?.httpOnly).toBeTruthy()
    expect(cookie?.sameSite).toBe('Lax')
    expect(cookie?.path).toBe('/')

    // El token no viaja por la URL, ni al abrir ni al avanzar.
    expect(pagina.url()).toBe(`${new URL(pagina.url()).origin}${rutaPublica(formulario.slug)}`)
    expect(pagina.url()).not.toContain(cookie?.value ?? 'imposible')

    // Y no es legible desde JavaScript, que es para lo que sirve `HttpOnly`.
    const cookiesVisibles = await pagina.evaluate(() => document.cookie)
    expect(cookiesVisibles).not.toContain('tp_sesion_')

    const sesiones = await sesionesDeFormulario(formulario.id)
    const esperado = createHash('sha256').update(cookie?.value ?? '').digest('hex')
    expect(sesiones[0]?.token_hash).toBe(esperado)
    expect(sesiones[0]?.token_hash).not.toBe(cookie?.value)

    await contexto.close()
  })

  test('CA6 · una sesión a medias se reanuda en el mismo navegador', async ({
    apiAdmin,
    browser,
    recursos,
  }) => {
    const formulario = await publicarFormulario(apiAdmin, recursos.titulo('reanudar'))
    recursos.formulario(formulario.id)

    const { contexto, pagina } = await participanteAnonimo(browser)

    await abrirFormularioPublico(pagina, formulario.slug, 'bienvenida')
    await avanzarHasta(pagina, 'perfil')
    await pagina.getByRole('radio', { name: 'En equipo' }).click()
    await avanzarHasta(pagina, 'tamano')

    // Cerrar la pestaña sin terminar. La cookie sobrevive en el navegador.
    await pagina.close()

    const segunda = await contexto.newPage()
    await segunda.goto(rutaPublica(formulario.slug))

    await expect(segunda.getByText(AVISO_REANUDACION)).toBeVisible()
    // Se retoma donde se dejó, no desde la bienvenida.
    await expect(pantalla(segunda, 'tamano')).toBeVisible()
    await expect(pantalla(segunda, 'bienvenida')).toHaveCount(0)

    // Y no se ha abierto una sesión nueva por recargar.
    const sesiones = await sesionesDeFormulario(formulario.id)
    expect(sesiones).toHaveLength(1)

    await segunda.getByRole('radio', { name: '3', exact: true }).click()
    await avanzarHasta(segunda, 'comentario')
    await avanzarHastaFinal(segunda, 'fin-equipo')

    await contexto.close()
  })

  test('CA6 · otro navegador empieza de cero, sin heredar la sesión ajena', async ({
    apiAdmin,
    browser,
    recursos,
  }) => {
    const formulario = await publicarFormulario(apiAdmin, recursos.titulo('aislado'))
    recursos.formulario(formulario.id)

    const primero = await participanteAnonimo(browser)
    await abrirFormularioPublico(primero.pagina, formulario.slug, 'bienvenida')
    await avanzarHasta(primero.pagina, 'perfil')
    await primero.pagina.getByRole('radio', { name: 'En equipo' }).click()
    await avanzarHasta(primero.pagina, 'tamano')

    const segundo = await participanteAnonimo(browser)
    await abrirFormularioPublico(segundo.pagina, formulario.slug, 'bienvenida')
    await expect(segundo.pagina.getByText(AVISO_REANUDACION)).toHaveCount(0)

    // La sesión se abre de forma perezosa, en el primer avance: quedarse en la
    // bienvenida no cuenta como respuesta empezada.
    await expect(await sesionesDeFormulario(formulario.id)).toHaveLength(1)

    await avanzarHasta(segundo.pagina, 'perfil')

    const sesiones = await sesionesDeFormulario(formulario.id)
    expect(sesiones).toHaveLength(2)
    // Dos tokens distintos: ninguno de los dos navegadores ve lo del otro.
    expect(new Set(sesiones.map((sesion) => sesion.token_hash)).size).toBe(2)

    await primero.contexto.close()
    await segundo.contexto.close()
  })

  test('CA6 · un formulario cerrado conserva lo recogido y explica que ya no admite respuestas', async ({
    apiAdmin,
    browser,
    recursos,
  }) => {
    const titulo = recursos.titulo('cerrado')
    const formulario = await publicarFormulario(apiAdmin, titulo)
    recursos.formulario(formulario.id)

    const { contexto, pagina } = await participanteAnonimo(browser)
    await abrirFormularioPublico(pagina, formulario.slug, 'bienvenida')
    await avanzarHasta(pagina, 'perfil')
    await pagina.getByRole('radio', { name: 'Por mi cuenta' }).click()
    await avanzarHastaFinal(pagina, 'fin-solo')

    const cierre = await apiAdmin.post(`/api/forms/${formulario.id}/close`, { data: {} })
    expect(cierre.ok(), await cierre.text()).toBeTruthy()

    const nueva = await contexto.newPage()
    await nueva.goto(rutaPublica(formulario.slug))

    await expect(nueva.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
    await expect(
      nueva.getByText('Este formulario ya no admite respuestas. Gracias por tu interés.'),
    ).toBeVisible()

    // Lo ya recogido sigue ahí.
    const sesiones = await sesionesDeFormulario(formulario.id)
    expect(sesiones).toHaveLength(1)
    expect(sesiones[0]?.status).toBe('completed')

    await contexto.close()
  })

  test('CA6 · una dirección que no existe se explica sin revelar nada', async ({ page }) => {
    await page.goto('/f/direccion-que-no-existe-e2e')

    await expect(
      page.getByRole('heading', { level: 1, name: 'No hemos encontrado este formulario' }),
    ).toBeVisible()
    await expect(
      page.getByText('La dirección no corresponde a ningún formulario.', { exact: false }),
    ).toBeVisible()
  })
})
