/**
 * Criterio de aceptación 9 · «La aplicación inicia mediante contenedor y aplica
 * migraciones de forma controlada.»
 *
 * Alcance honesto. Construir la imagen y levantar el compose desde dentro de
 * Playwright costaría minutos y probaría sobre todo que hay un Docker instalado
 * en la máquina; eso ya lo hace CI, que construye la imagen en su propio paso.
 * Lo que sí se puede comprobar aquí, y se comprueba, es todo lo demás:
 *
 * - El servidor bajo prueba **es** el artefacto de producción (`next build` +
 *   `next start`), no `next dev`, y responde sano.
 * - `scripts/migrate.mjs` —exactamente el comando que ejecuta el servicio
 *   `migrate` del compose— aplica las migraciones y **repetirlo no hace nada**,
 *   que es lo que significa «de forma controlada».
 * - El compose no arranca la aplicación hasta que ese servicio ha terminado con
 *   éxito, y ni él ni el `Dockerfile` definen `AUTH_DEV_BYPASS`.
 *
 * Se aprovecha el fichero para las dos piezas de plataforma que no son de
 * ningún otro criterio: el límite de peticiones y el endpoint de limpieza.
 */

import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { crearFormulario, guardarYPublicar } from './utiles/api'
import { migracionesAplicadas } from './utiles/base-datos'
import { documentoMinimo } from './utiles/documentos'
import { BASE_URL, CLEANUP_SECRET, DATABASE_URL } from './utiles/entorno'
import { expect, test } from './utiles/fixtures'

const ejecutar = promisify(execFile)

const RAIZ = path.join(import.meta.dirname, '..')

/** Ejecuta un script de Node del repositorio con la base de datos de la suite. */
async function ejecutarScript(script: string): Promise<string> {
  const { stdout, stderr } = await ejecutar(process.execPath, [path.join(RAIZ, script)], {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL },
  })
  return `${stdout}${stderr}`
}

test.describe('Plataforma', () => {
  test('CA9 · el servidor bajo prueba es el build de producción y responde sano', async ({
    request,
    page,
  }) => {
    const salud = await request.get('/api/health')
    expect(salud.status()).toBe(200)
    expect(await salud.json()).toMatchObject({ status: 'ok', db: 'up' })
    // Nunca se filtran ni cadenas de conexión ni credenciales.
    expect(await salud.text()).not.toContain('postgres')

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Typeapromo' })).toBeVisible()
  })

  test('CA9 · las migraciones se aplican con el mismo script que el contenedor, y repetirlas no hace nada', async () => {
    const ficheros = (await readdir(path.join(RAIZ, 'drizzle'))).filter((nombre) =>
      nombre.endsWith('.sql'),
    )
    expect(ficheros.length).toBeGreaterThan(0)

    const primera = await ejecutarScript('scripts/migrate.mjs')
    expect(primera).toContain('[migrate] Migraciones al día.')

    const registradas = await migracionesAplicadas()
    expect(registradas).toBe(ficheros.length)

    // Idempotencia: el compose ejecuta este servicio en cada `up`.
    const segunda = await ejecutarScript('scripts/migrate.mjs')
    expect(segunda).toContain('[migrate] Migraciones al día.')
    expect(await migracionesAplicadas()).toBe(registradas)
  })

  test('CA9 · el compose no levanta la aplicación hasta que las migraciones terminan', async () => {
    const compose = await readFile(path.join(RAIZ, 'docker-compose.yml'), 'utf8')

    // Comprobación estática, pero de lo que importa: el orden de arranque.
    expect(compose).toContain('command: [\'node\', \'scripts/migrate.mjs\']')
    expect(compose).toMatch(/migrate:\s*\n\s*condition: service_completed_successfully/)

    // Y la protección 3 del bypass, con el script del propio repositorio.
    const verificacion = await ejecutarScript('scripts/verificar-bypass.mjs')
    expect(verificacion).toContain('Ningún artefacto de producción define AUTH_DEV_BYPASS')
  })

  test('el límite de peticiones corta el abuso de los endpoints públicos', async ({
    apiAdmin,
    playwright,
    recursos,
  }) => {
    const titulo = recursos.titulo('limites')
    const documento = documentoMinimo(titulo)
    const formulario = await crearFormulario(apiAdmin, titulo, documento)
    recursos.formulario(formulario.id)
    await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

    // IP simulada propia: el limitador cuenta por cliente, así que este test se
    // gasta su propio cupo sin tocar el de los demás.
    const cliente = await playwright.request.newContext({
      baseURL: BASE_URL,
      // `203.0.113.0/24` es el rango reservado para documentación (RFC 5737).
      extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.42' },
    })

    const url = `/api/public/forms/${formulario.slug}/sessions`
    let ultimoEstado = 0
    let intentos = 0

    // La política de `sesiones` admite 20 peticiones por ventana de diez minutos.
    while (intentos < 25 && ultimoEstado !== 429) {
      const respuesta = await cliente.post(url, { data: {} })
      ultimoEstado = respuesta.status()
      intentos += 1
    }

    expect(ultimoEstado, 'El limitador no ha cortado en 25 intentos').toBe(429)
    expect(intentos).toBeGreaterThan(20)

    await cliente.dispose()
  })

  test('la limpieza programada exige el secreto por cabecera y nunca por la URL', async ({
    request,
  }) => {
    const sinSecreto = await request.post('/api/internal/cleanup')
    expect(sinSecreto.status()).toBe(401)

    // Un secreto en la query string es tan anónimo como no llevar ninguno: la
    // URL acaba en logs de acceso, historiales y cabeceras `Referer`.
    const porUrl = await request.post(`/api/internal/cleanup?secret=${CLEANUP_SECRET}`)
    expect(porUrl.status()).toBe(401)

    const conSecreto = await request.post('/api/internal/cleanup', {
      headers: { 'x-cleanup-secret': CLEANUP_SECRET },
    })
    expect(conSecreto.status(), await conSecreto.text()).toBe(200)

    const cuerpo = (await conSecreto.json()) as {
      ejecutadoEn: string
      resumen: Record<string, number>
    }
    expect(cuerpo.ejecutadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(Object.keys(cuerpo.resumen).sort()).toEqual([
      'huerfanosPublicados',
      'objetosBorrados',
      'rateLimitsPurgados',
      'stagingCaducado',
    ])

    // Idempotente: el cron puede solaparse o reintentar sin borrar de más.
    const repetida = await request.post('/api/internal/cleanup', {
      headers: { authorization: `Bearer ${CLEANUP_SECRET}` },
    })
    expect(repetida.status()).toBe(200)
  })
})
