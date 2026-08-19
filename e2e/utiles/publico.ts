/**
 * Recorrido de la experiencia pública.
 *
 * El renderer marca cada pantalla con `data-bloque` y `data-tipo`, y el botón de
 * avance con `data-accion="avanzar"`. Apoyarse en esos atributos —y no en el
 * texto del botón, que cambia entre «Empezar», «Continuar», «Siguiente» y
 * «Enviar»— hace que estos ayudantes valgan para cualquier documento.
 *
 * Cada avance espera a que aparezca la pantalla esperada, no a un tiempo fijo:
 * entre medias hay una llamada de autoguardado y una transición de Motion.
 */

import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** Botón de avance de la pantalla actual, sea cual sea su etiqueta. */
export function botonAvanzar(pagina: Page) {
  return pagina.locator('button[data-accion="avanzar"]')
}

/** Pantalla visible ahora mismo, identificada por su bloque. */
export function pantalla(pagina: Page, idBloque: string) {
  return pagina.locator(`form[data-bloque="${idBloque}"]`)
}

/** Abre el formulario público y espera a que se pinte la primera pantalla. */
export async function abrirFormularioPublico(
  pagina: Page,
  slug: string,
  primerBloque: string,
): Promise<void> {
  await pagina.goto(`/f/${slug}`)
  await expect(pantalla(pagina, primerBloque)).toBeVisible()
}

/** Avanza y espera a la pantalla indicada. */
export async function avanzarHasta(pagina: Page, idBloque: string): Promise<void> {
  await botonAvanzar(pagina).click()
  await expect(pantalla(pagina, idBloque)).toBeVisible()
}

/**
 * Avanza y espera a la pantalla final indicada.
 *
 * Una pantalla final se pinta con el mismo marco (`data-tipo="ending"`), así que
 * basta con esperar a su bloque; se comprueba además el tipo para que un
 * `endScreen` y un bloque homónimo no puedan confundirse.
 */
export async function avanzarHastaFinal(pagina: Page, idPantallaFinal: string): Promise<void> {
  await botonAvanzar(pagina).click()
  const final = pantalla(pagina, idPantallaFinal)
  await expect(final).toBeVisible()
  await expect(final).toHaveAttribute('data-tipo', 'ending')
}

/** Identificadores de las pantallas por las que se ha pasado, en orden. */
export class Recorrido {
  private readonly visitadas: string[] = []

  constructor(private readonly pagina: Page) {}

  /** Anota la pantalla visible ahora mismo. */
  async anotar(): Promise<void> {
    const actual = await this.pagina.locator('form[data-bloque]').first().getAttribute('data-bloque')
    if (actual !== null && this.visitadas.at(-1) !== actual) {
      this.visitadas.push(actual)
    }
  }

  get pantallas(): readonly string[] {
    return this.visitadas
  }
}

/**
 * Mensaje de error de validación de una pantalla.
 *
 * El nodo existe siempre en el DOM (con `sr-only` cuando no hay error), así que
 * lo que se comprueba es su **texto**, no su presencia. Se acota al formulario
 * de la pantalla porque con el bypass activo hay otro `role="alert"` global —la
 * franja de aviso— y un tercero que Next usa para anunciar rutas.
 */
export function errorDePantalla(pagina: Page, idBloque: string) {
  return pantalla(pagina, idBloque).getByRole('alert')
}

/** Barra de progreso, cuando el documento la activa. */
export function barraDeProgreso(pagina: Page) {
  return pagina.getByRole('progressbar', { name: 'Progreso del formulario' })
}

/** Texto exacto del aviso que aparece al reanudar una sesión a medias. */
export const AVISO_REANUDACION =
  'Hemos recuperado tus respuestas anteriores. Puedes continuar donde lo dejaste.'
