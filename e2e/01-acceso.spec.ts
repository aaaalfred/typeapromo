/**
 * Criterio de aceptación 1 · «Un usuario del workspace configurado puede entrar
 * con Slack; cualquier otro workspace es rechazado.»
 *
 * Alcance real de estas pruebas, dicho sin adornos: **el flujo OIDC contra
 * Slack no se puede automatizar**. Slack exige redirecciones por HTTPS, la
 * aplicación no se distribuye y no hay forma de conducir su pantalla de
 * autorización desde un navegador de pruebas. PLAN.md §2.3 resuelve
 * exactamente esto con el acceso directo tras `AUTH_DEV_BYPASS=1`, y es la
 * puerta que se ejerce aquí: crea **la misma sesión de base de datos** que
 * Slack, con el mismo guard detrás, así que todo lo que viene después del
 * `signIn` sí queda cubierto de punta a punta.
 *
 * Lo que queda fuera —la comparación del claim `https://slack.com/team_id`
 * contra `SLACK_TEAM_ID`— está cubierto por los tests de
 * `src/lib/auth/__tests__/workspace.test.ts`, que ejercen el guard puro con
 * todos sus casos límite. Aquí se comprueba la mitad que aquellos no pueden
 * ver: que el rechazo llega a la persona con un mensaje comprensible.
 */

import { RUTA_FORMULARIOS, RUTA_LOGIN } from './utiles/rutas'
import { BOTON_ACCESO_DIRECTO, expect, test } from './utiles/fixtures'

test.describe('Acceso al panel', () => {
  test('CA1 · la página de inicio de sesión ofrece solo las puertas que existen', async ({
    page,
  }) => {
    await page.goto(RUTA_LOGIN)

    await expect(page.getByRole('heading', { level: 1, name: 'Typeapromo' })).toBeVisible()

    // Sin credenciales de Slack configuradas, la página no enseña un botón que
    // no funcionaría: enseña la única puerta abierta de este entorno.
    await expect(page.getByRole('button', { name: 'Entrar con Slack' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: BOTON_ACCESO_DIRECTO })).toBeVisible()
  })

  test('CA1 · sin sesión, el panel redirige al login recordando el destino', async ({ page }) => {
    await page.goto(`${RUTA_FORMULARIOS}?q=algo`)

    await expect(page).toHaveURL(/\/iniciar-sesion\?destino=/)
    expect(new URL(page.url()).searchParams.get('destino')).toBe(`${RUTA_FORMULARIOS}?q=algo`)

    // El formulario de acceso lleva el destino consigo, para poder devolver a la
    // persona a donde quería ir.
    await expect(page.locator('form[action="/api/auth/acceso-directo"] input[name="destino"]')).
      toHaveValue(`${RUTA_FORMULARIOS}?q=algo`)
  })

  /**
   * FALLO CONOCIDO DE LA APLICACIÓN — se deja en rojo a propósito.
   *
   * Pulsar el botón de la página de inicio de sesión responde
   * `403 Origen no permitido` en lugar de crear la sesión.
   *
   * Causa: `urlBase()` en `src/app/api/auth/acceso-directo/route.ts` calcula el
   * origen esperado con `new URL(request.url)`. Bajo `next start`, Next
   * normaliza `request.url` a `http://localhost:<puerto>` **ignorando la
   * cabecera `Host`** (comprobado con `Host: 127.0.0.1:3100`, con
   * `Host: ejemplo.local` y con `--hostname 127.0.0.1`: siempre `localhost`).
   * Como `playwright.config.ts` sirve la aplicación en `http://127.0.0.1:3100`,
   * el navegador manda `Origin: http://127.0.0.1:3100`, `origenPermitido()`
   * compara contra `http://localhost:3100` y rechaza.
   *
   * Además, la redirección `303` sale con `Location` **absoluto** a
   * `http://localhost:3100/...`: aunque el origen coincidiera, el navegador
   * saltaría a otro host y perdería la cookie recién puesta.
   *
   * Afecta a cualquiera que abra la aplicación por un nombre que no sea
   * `localhost` (una IP, el nombre del contenedor, un dominio de pruebas). La
   * corrección natural es que `urlBase()` respete `x-forwarded-host` y `host`
   * antes de caer en `request.url`, y que la redirección sea relativa.
   *
   * No se toca `src/`, no se ablanda el test: cuando esto se arregle, pasa solo.
   */
  test('CA1 · un miembro del equipo entra desde la interfaz y llega al panel', async ({ page }) => {
    await page.goto(RUTA_LOGIN)
    await page.getByRole('button', { name: BOTON_ACCESO_DIRECTO }).click()

    await expect(page).toHaveURL(new RegExp(`${RUTA_FORMULARIOS}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Formularios' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  })

  test('CA1 · con sesión, el panel se abre y muestra al usuario que ha entrado', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto(RUTA_FORMULARIOS)

    await expect(paginaAdmin.getByRole('heading', { level: 1, name: 'Formularios' })).toBeVisible()
    await expect(paginaAdmin.getByRole('button', { name: 'Nuevo formulario' })).toBeVisible()
    await expect(paginaAdmin.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  })

  test('CA1 · una cuenta de otro workspace es rechazada con un mensaje claro', async ({ page }) => {
    // Es el destino al que el callback `signIn` manda a quien no pertenece al
    // workspace autorizado, con el motivo que produce `evaluarWorkspace`.
    await page.goto('/acceso-denegado?motivo=workspace-ajeno')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Tu cuenta pertenece a otro workspace' }),
    ).toBeVisible()
    await expect(
      page.getByText(
        'La autenticación con Slack ha funcionado, pero esta herramienta solo admite miembros del workspace autorizado.',
        { exact: false },
      ),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Volver a intentarlo' })).toBeVisible()
  })

  test('CA1 · un servidor sin workspace configurado falla cerrado, no abierto', async ({ page }) => {
    await page.goto('/acceso-denegado?motivo=workspace-no-configurado')

    await expect(
      page.getByRole('heading', { level: 1, name: 'El acceso con Slack no está configurado' }),
    ).toBeVisible()
  })

  test('CA1 · el acceso sin credenciales es visible desde fuera y dentro', async ({
    page,
    request,
  }) => {
    // Protección 2 de PLAN.md: auditable sin entrar al servidor.
    const salud = await request.get('/api/health')
    expect(salud.ok()).toBeTruthy()
    expect(await salud.json()).toMatchObject({ status: 'ok', db: 'up', authMode: 'dev-bypass' })

    // Y dentro, una franja permanente en toda la interfaz.
    await page.goto('/iniciar-sesion')
    const aviso = page.getByRole('alert', { name: 'Aviso de seguridad' })
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('Acceso sin credenciales activo')
    await expect(aviso).toContainText('AUTH_DEV_BYPASS')
  })
})
