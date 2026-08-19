/**
 * Análisis de accesibilidad con axe-core.
 *
 * Criterio de fallo: **cualquier violación de impacto `serious` o `critical`**.
 * Las de impacto `minor` y `moderate` se recogen y se imprimen, pero no tumban
 * la suite: axe marca ahí cosas legítimamente discutibles (regiones sin
 * `landmark`, ids duplicados en árboles de terceros) y una suite que falla por
 * ellas se acaba desactivando entera, que es el peor final posible.
 *
 * Se analiza contra las etiquetas `wcag2a`, `wcag2aa`, `wcag21a` y `wcag21aa`,
 * que son las que el producto se compromete a cumplir.
 */

import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Espera a que no quede ninguna animación en marcha.
 *
 * Sin esto, la comprobación de contraste es una lotería: la experiencia pública
 * entra cada pantalla con una transición de opacidad, y axe calcula el color
 * efectivo del texto **en el instante en que mira**. Medido a mitad del fundido,
 * un gris que sobre fondo blanco da 6,1:1 se lee como 3,4:1, y el test acusaría
 * a la aplicación de un fallo que no tiene.
 *
 * Las animaciones infinitas (un indicador de carga girando) se ignoran: nunca
 * van a terminar y no afectan al texto que se está midiendo.
 */
async function esperarAAnimacionesQuietas(pagina: Page): Promise<void> {
  const quietas = () =>
    pagina
      .waitForFunction(
        () =>
          document.getAnimations().every((animacion) => {
            const iteraciones = animacion.effect?.getComputedTiming().iterations
            if (iteraciones === Infinity) return true
            return animacion.playState !== 'running'
          }),
        undefined,
        { timeout: 5_000 },
      )
      .catch(() => undefined)

  // Dos veces, con una pausa mayor que la transición de entrada del renderer
  // (`duration: 0.28`). La primera comprobación puede acertar por casualidad
  // —justo antes de que Motion arranque la animación no hay ninguna en la
  // lista—, y entonces axe mediría el color a mitad del fundido.
  await quietas()
  await pagina.waitForTimeout(400)
  await quietas()
}

/** Impactos que hacen fallar el test. */
const IMPACTOS_BLOQUEANTES = new Set(['serious', 'critical'])

const ETIQUETAS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

export interface OpcionesAnalisis {
  /** Selector al que limitar el análisis. Por defecto, la página entera. */
  readonly incluir?: string
  /**
   * Reglas desactivadas, siempre con motivo escrito. Cada entrada aquí es una
   * renuncia: si crece esta lista, el compromiso de accesibilidad encoge.
   */
  readonly reglasDesactivadas?: readonly string[]
}

/**
 * Analiza la página y falla si hay violaciones serias o críticas.
 *
 * @param etiqueta Nombre de la pantalla, para que el mensaje de fallo diga
 *                 dónde está el problema sin tener que abrir la traza.
 */
export async function revisarAccesibilidad(
  pagina: Page,
  etiqueta: string,
  opciones: OpcionesAnalisis = {},
): Promise<void> {
  await esperarAAnimacionesQuietas(pagina)

  let constructor = new AxeBuilder({ page: pagina }).withTags(ETIQUETAS_WCAG)

  if (opciones.incluir !== undefined) {
    constructor = constructor.include(opciones.incluir)
  }
  if (opciones.reglasDesactivadas !== undefined && opciones.reglasDesactivadas.length > 0) {
    constructor = constructor.disableRules([...opciones.reglasDesactivadas])
  }

  const resultado = await constructor.analyze()

  const graves = resultado.violations.filter((violacion) =>
    IMPACTOS_BLOQUEANTES.has(violacion.impact ?? ''),
  )

  const resumen = graves.map((violacion) => ({
    regla: violacion.id,
    impacto: violacion.impact,
    descripcion: violacion.help,
    nodos: violacion.nodes.map((nodo) => nodo.target.join(' ')),
  }))

  expect(
    resumen,
    `Violaciones de accesibilidad serias o críticas en «${etiqueta}»:\n${JSON.stringify(resumen, null, 2)}`,
  ).toEqual([])
}
