/**
 * Criterio de aceptación 2 · «Un creador puede construir un formulario visual
 * completo sin editar JSON.»
 *
 * La prueba es literal: se parte del listado vacío de un formulario nuevo y se
 * construye entero con ratón y teclado —bloques, opciones, apariencia de la
 * valoración, una regla de lógica y el tema—, sin que en ningún momento se
 * escriba una llave. Al final se lee el borrador por la API y se comprueba que
 * el documento resultante es exactamente el que se ha compuesto en pantalla:
 * sin esa segunda mitad, el test solo demostraría que los controles se pueden
 * pulsar.
 */

import { leerFormulario } from './utiles/api'
import {
  abrirPanelDeTema,
  abrirPestana,
  anadirBloque,
  bloqueSeleccionado,
  crearFormularioDesdeElPanel,
  guardarBorradorDesdeElEditor,
  insigniaPublicable,
  navegacionDelRecorrido,
  panelPropiedades,
  previsualizacion,
  seleccionarBloque,
} from './utiles/editor'
import { expect, test } from './utiles/fixtures'

test.describe('Construcción visual del formulario', () => {
  test('CA2 · un creador construye un formulario completo sin tocar JSON', async ({
    paginaAdmin,
    apiAdmin,
    recursos,
  }) => {
    const titulo = recursos.titulo('editor')
    let idFormulario = ''
    let idSeleccion = ''

    await test.step('crear el formulario desde el listado', async () => {
      idFormulario = await crearFormularioDesdeElPanel(paginaAdmin, titulo)
      recursos.formulario(idFormulario)

      // Un formulario nuevo nace con una bienvenida y una pantalla final.
      const recorrido = navegacionDelRecorrido(paginaAdmin)
      await expect(recorrido.locator('[data-bloque="welcome"]')).toBeVisible()
      await expect(recorrido.locator('[data-bloque="ending"]')).toBeVisible()
    })

    await test.step('añadir una valoración y configurarla con caras sobre 7', async () => {
      await anadirBloque(paginaAdmin, 'Valoración visual')

      const panel = panelPropiedades(paginaAdmin)
      const contenido = await abrirPestana(paginaAdmin, 'Contenido')
      await contenido.getByLabel('Título', { exact: true }).fill('¿Cómo te has sentido?')

      const apariencia = await abrirPestana(paginaAdmin, 'Apariencia')
      await apariencia.getByLabel('Símbolo').selectOption('faces')
      await apariencia.getByLabel('Escala').selectOption('7')
      await apariencia.getByLabel('Etiqueta del extremo inferior').fill('Fatal')
      await apariencia.getByLabel('Etiqueta del extremo superior').fill('Estupendamente')

      const validacion = await abrirPestana(paginaAdmin, 'Validación')
      await validacion.getByLabel('Respuesta obligatoria').check()

      await expect(panel).toContainText('Apariencia')
    })

    await test.step('añadir una selección única con tres opciones, como botones', async () => {
      await anadirBloque(paginaAdmin, 'Selección única')
      // El editor genera identificadores no deterministas: se lee el del bloque
      // que acaba de quedar seleccionado, que es el recién añadido.
      idSeleccion = (await bloqueSeleccionado(paginaAdmin)) ?? ''
      expect(idSeleccion).not.toBe('')

      const contenido = await abrirPestana(paginaAdmin, 'Contenido')
      await contenido.getByLabel('Título', { exact: true }).fill('¿Quieres que te llamemos?')

      const opciones = contenido.getByRole('listitem')
      await expect(opciones).toHaveCount(2)
      await contenido.getByRole('button', { name: 'Añadir opción' }).click()
      await expect(opciones).toHaveCount(3)

      // El nombre del campo es posicional («Opción 1»), y los botones de la
      // misma fila lo llevan dentro de su `aria-label`: hay que pedir el rol.
      await opciones.nth(0).getByRole('textbox', { name: 'Opción 1' }).fill('Sí, cuanto antes')
      await opciones.nth(1).getByRole('textbox', { name: 'Opción 2' }).fill('Sí, sin prisa')
      await opciones.nth(2).getByRole('textbox', { name: 'Opción 3' }).fill('No hace falta')

      const apariencia = await abrirPestana(paginaAdmin, 'Apariencia')
      await apariencia.getByLabel('Presentación').selectOption('buttons')
    })

    await test.step('añadir un texto largo al final del recorrido', async () => {
      await anadirBloque(paginaAdmin, 'Texto largo')

      const contenido = await abrirPestana(paginaAdmin, 'Contenido')
      await contenido.getByLabel('Título', { exact: true }).fill('¿Algo más que contarnos?')
    })

    await test.step('bifurcar: quien no quiere llamada salta a la pantalla final', async () => {
      // La lógica se edita desde la pregunta origen, que es donde importa.
      await seleccionarBloque(paginaAdmin, idSeleccion)

      const logica = await abrirPestana(paginaAdmin, 'Lógica')
      await logica.getByRole('button', { name: 'Añadir regla' }).click()

      const regla = logica.locator('[data-regla]').first()
      await expect(regla).toBeVisible()
      await regla.getByLabel('Si la respuesta…').selectOption({ label: 'es igual a' })
      await regla.getByLabel('Opción', { exact: true }).selectOption({ label: 'No hace falta' })
      await regla.getByLabel('Entonces ir a…').selectOption({ label: 'Pantalla final · ¡Gracias!' })

      await expect(regla).toContainText('prioridad')
    })

    await test.step('tematizar el formulario', async () => {
      const tema = await abrirPanelDeTema(paginaAdmin)

      await tema.getByLabel('Fondo', { exact: true }).fill('#fffaf3')
      await tema.getByLabel('Texto', { exact: true }).fill('#3f2d1c')
      await tema.getByLabel('Botón', { exact: true }).fill('#9a3412')
      await tema.getByLabel('Fuente').selectOption('lora')
      await tema.getByLabel('Radio de los bordes').selectOption('lg')
      await tema.getByLabel('Alineación del contenido').selectOption('center')

      await expect(tema.getByRole('list', { name: 'Relaciones de contraste' })).toBeVisible()
    })

    await test.step('el formulario queda listo para publicar y se guarda', async () => {
      await guardarBorradorDesdeElEditor(paginaAdmin)
      await expect(insigniaPublicable(paginaAdmin)).toHaveAttribute('data-publicable', 'si')
    })

    await test.step('el documento guardado es el que se ha compuesto en pantalla', async () => {
      const { definition } = await leerFormulario(apiAdmin, idFormulario)

      expect(definition.meta.title).toBe(titulo)
      expect(definition.theme.colors.background).toBe('#fffaf3')
      expect(definition.theme.colors.text).toBe('#3f2d1c')
      expect(definition.theme.colors.buttons).toBe('#9a3412')
      expect(definition.theme.typography.fontFamily).toBe('lora')
      expect(definition.theme.borderRadius).toBe('lg')
      expect(definition.theme.contentAlignment).toBe('center')

      const tipos = definition.blocks.map((bloque) => bloque.type)
      expect(tipos).toEqual(['welcome', 'rating', 'single_choice', 'long_text'])

      const valoracion = definition.blocks.find((bloque) => bloque.type === 'rating')
      expect(valoracion).toMatchObject({
        title: '¿Cómo te has sentido?',
        appearance: 'faces',
        scale: 7,
        required: true,
        labels: { min: 'Fatal', max: 'Estupendamente' },
      })

      const seleccion = definition.blocks.find((bloque) => bloque.type === 'single_choice')
      expect(seleccion).toMatchObject({
        title: '¿Quieres que te llamemos?',
        presentation: 'buttons',
      })
      expect(
        seleccion?.type === 'single_choice' ? seleccion.choices.map((opcion) => opcion.label) : [],
      ).toEqual(['Sí, cuanto antes', 'Sí, sin prisa', 'No hace falta'])

      expect(definition.rules).toHaveLength(1)
      expect(definition.rules[0]).toMatchObject({
        sourceQuestionId: idSeleccion,
        operator: 'equals',
        target: { kind: 'end_screen', id: 'ending' },
      })
    })
  })

  test('CA2 · la previsualización es el mismo renderer que sirve la experiencia pública', async ({
    paginaAdmin,
    recursos,
  }) => {
    const idFormulario = await crearFormularioDesdeElPanel(paginaAdmin, recursos.titulo('preview'))
    recursos.formulario(idFormulario)

    await anadirBloque(paginaAdmin, 'Escala numérica')
    const contenido = await abrirPestana(paginaAdmin, 'Contenido')
    await contenido.getByLabel('Título', { exact: true }).fill('Del 1 al 10, ¿qué tal?')

    // El marcador `data-renderizador` lo pone el componente compartido: si la
    // previsualización lo lleva, no puede ser una copia paralela.
    const vista = previsualizacion(paginaAdmin)
    await expect(vista.locator('[data-renderizador="formulario"]')).toBeVisible()
    await expect(vista.getByRole('heading', { level: 2 })).toHaveText('Del 1 al 10, ¿qué tal?')

    // Y la ejecución de prueba recorre el formulario sin guardar nada.
    await paginaAdmin.getByRole('button', { name: 'Ejecución de prueba' }).click()
    await expect(vista.getByText('no se guarda ninguna respuesta')).toBeVisible()
    await paginaAdmin.getByRole('button', { name: 'Salir de la prueba' }).click()
  })

  test('CA2 · el editor avisa de lo que impide publicar en lugar de dejar publicar mal', async ({
    paginaAdmin,
    recursos,
  }) => {
    const idFormulario = await crearFormularioDesdeElPanel(paginaAdmin, recursos.titulo('avisos'))
    recursos.formulario(idFormulario)

    await expect(insigniaPublicable(paginaAdmin)).toHaveAttribute('data-publicable', 'si')

    // Una escala cuyo mínimo alcanza al máximo no se puede responder.
    await anadirBloque(paginaAdmin, 'Escala numérica')
    const validacion = await abrirPestana(paginaAdmin, 'Validación')
    await validacion.getByLabel('Valor mínimo').fill('10')

    await expect(insigniaPublicable(paginaAdmin)).toHaveAttribute('data-publicable', 'no')
    await expect(insigniaPublicable(paginaAdmin)).toContainText('impiden publicar')

    // El aviso no se queda en una cifra: dice cuál es el problema, y la lista
    // marca el bloque que lo provoca.
    await expect(panelPropiedades(paginaAdmin).getByRole('alert')).toContainText(
      'El mínimo de «Del 1 al 10, ¿cómo lo valoras?» debe ser menor que el máximo.',
    )
    await expect(
      navegacionDelRecorrido(paginaAdmin).getByLabel('Con errores'),
    ).toBeVisible()

    // Y al deshacerlo, vuelve a estar listo.
    await validacion.getByLabel('Valor mínimo').fill('1')
    await expect(insigniaPublicable(paginaAdmin)).toHaveAttribute('data-publicable', 'si')
  })
})
