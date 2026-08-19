/**
 * Manejo del editor desde los tests.
 *
 * Todo por rol y nombre accesible: en `src/` no hay ni un `data-testid`, y eso
 * es una virtud, no una carencia. Si un test encuentra el botón por su nombre
 * accesible, está comprobando de paso que ese nombre existe.
 *
 * Los únicos atributos que se usan como gancho son los que la propia interfaz
 * expone con intención semántica: `data-estado` en el indicador de guardado,
 * `data-publicable` en la insignia de diagnóstico y `data-bloque` en la lista.
 */

import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { RUTA_FORMULARIOS } from './rutas'

/** Panel derecho de propiedades, sea cual sea su título. */
export function panelPropiedades(pagina: Page): Locator {
  return pagina.getByRole('complementary')
}

/** Columna izquierda con el recorrido. */
export function navegacionDelRecorrido(pagina: Page): Locator {
  return pagina.getByRole('navigation', { name: 'Recorrido del formulario' })
}

/** Previsualización central: el mismo renderer que sirve la experiencia pública. */
export function previsualizacion(pagina: Page): Locator {
  return pagina.getByRole('region', { name: 'Previsualización' })
}

/** Indicador de autoguardado. `data-estado` evita depender del texto. */
export function indicadorDeGuardado(pagina: Page): Locator {
  return pagina.locator('[data-estado]').first()
}

/** Insignia de diagnóstico de publicación (`si` / `no`). */
export function insigniaPublicable(pagina: Page): Locator {
  return pagina.locator('[data-publicable]')
}

/**
 * Crea un formulario desde el listado y devuelve su identificador.
 *
 * Se hace por la interfaz —diálogo incluido— porque forma parte de «construir
 * un formulario visual completo sin editar JSON».
 */
export async function crearFormularioDesdeElPanel(pagina: Page, titulo: string): Promise<string> {
  await pagina.goto(RUTA_FORMULARIOS)
  await pagina.getByRole('button', { name: 'Nuevo formulario' }).click()

  const dialogo = pagina.getByRole('dialog', { name: 'Nuevo formulario' })
  await expect(dialogo).toBeVisible()
  await dialogo.getByLabel('Título del formulario').fill(titulo)
  await dialogo.getByRole('button', { name: 'Crear y abrir el editor' }).click()

  await pagina.waitForURL(/\/app\/formularios\/[0-9a-f-]{36}\/editar$/)

  const id = /\/app\/formularios\/([0-9a-f-]{36})\/editar/.exec(pagina.url())?.[1]
  if (id === undefined) {
    throw new Error(`No se ha podido leer el identificador del formulario en ${pagina.url()}`)
  }
  return id
}

/**
 * Añade un bloque del menú «Añadir bloque».
 *
 * El nombre accesible de cada opción concatena el nombre del tipo con su
 * descripción, así que se busca por el principio.
 */
export async function anadirBloque(pagina: Page, nombreDelTipo: string): Promise<void> {
  const disparador = pagina.getByRole('button', { name: 'Añadir bloque' })
  await disparador.click()
  await expect(disparador).toHaveAttribute('aria-expanded', 'true')

  const menu = pagina.getByRole('list', { name: 'Tipos de bloque' })
  await menu.getByRole('button', { name: new RegExp(`^${nombreDelTipo}`) }).click()

  await expect(disparador).toHaveAttribute('aria-expanded', 'false')
}

/** Pestaña del panel de propiedades. */
export async function abrirPestana(pagina: Page, nombre: string): Promise<Locator> {
  const pestana = pagina.getByRole('tab', { name: nombre })
  await pestana.click()
  await expect(pestana).toHaveAttribute('aria-selected', 'true')
  return pagina.getByRole('tabpanel')
}

/** Abre el panel de tema desde la columna izquierda. */
export async function abrirPanelDeTema(pagina: Page): Promise<Locator> {
  await pagina.getByRole('button', { name: 'Tema y accesibilidad' }).click()
  const panel = pagina.getByRole('complementary', { name: 'Tema del formulario' })
  await expect(panel).toBeVisible()
  return panel
}

/** Abre los ajustes generales del formulario. */
export async function abrirAjustes(pagina: Page): Promise<Locator> {
  await pagina.getByRole('button', { name: 'Ajustes del formulario' }).click()
  const panel = pagina.getByRole('complementary', { name: 'Ajustes del formulario' })
  await expect(panel).toBeVisible()
  return panel
}

/**
 * Selecciona un bloque de la lista por su identificador estable.
 *
 * En cada fila conviven el asa de arrastre y cuatro botones de acción, todos
 * con `aria-label`; el único sin etiqueta explícita es el que selecciona, así
 * que se localiza por ausencia y no por posición, que cambia entre bloques
 * ordenables y pantallas finales.
 */
export function botonDeSeleccion(pagina: Page, idBloque: string): Locator {
  return navegacionDelRecorrido(pagina)
    .locator(`[data-bloque="${idBloque}"] button:not([aria-label])`)
    .first()
}

export async function seleccionarBloque(pagina: Page, idBloque: string): Promise<void> {
  const boton = botonDeSeleccion(pagina, idBloque)
  await boton.click()
  await expect(boton).toHaveAttribute('aria-current', 'true')
}

/** Identificador del bloque seleccionado ahora mismo. */
export async function bloqueSeleccionado(pagina: Page): Promise<string | null> {
  return navegacionDelRecorrido(pagina)
    .locator('[data-bloque]')
    .filter({ has: pagina.locator('button[aria-current="true"]') })
    .first()
    .getAttribute('data-bloque')
}

/**
 * Fuerza el guardado y espera a que el indicador diga «guardado».
 *
 * El autoguardado tiene 900 ms de rebote; esperar por reloj sería una carrera.
 * El botón manual existe precisamente para no tener que adivinar.
 */
export async function guardarBorradorDesdeElEditor(pagina: Page): Promise<void> {
  const boton = pagina.getByRole('button', { name: 'Guardar ahora' })
  if (await boton.isEnabled()) {
    await boton.click()
  }
  await expect(indicadorDeGuardado(pagina)).toHaveAttribute('data-estado', 'guardado')
}
