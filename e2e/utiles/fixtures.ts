/**
 * Fixtures de la suite.
 *
 * Dos ideas gobiernan este fichero:
 *
 * 1. **Una sesión administrativa por trabajador.** Entrar cuesta una escritura
 *    en `auth_sessions`; hacerlo en cada test dejaría cientos de filas vivas en
 *    la base de datos de desarrollo. Se entra una vez por trabajador, se
 *    reaprovecha el estado y se **revoca la sesión** al terminar.
 *
 * 2. **Cada test limpia lo suyo.** `recursos` es un registro: todo formulario y
 *    todo activo de media que un test cree se apunta ahí, y el teardown lo
 *    borra pase lo que pase, también si el test ha fallado. Ningún test depende
 *    de datos que haya dejado otro, ni del orden de ejecución, y repetir la
 *    suite entera no acumula basura.
 */

import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test'

import {
  borrarActivosDeMedia,
  borrarFormularios,
  borrarSesionAdministrativa,
  cerrarPool,
  purgarLimitesDePeticion,
} from './base-datos'
import { BASE_URL, PREFIJO_E2E } from './entorno'

/** Estado de almacenamiento tal y como lo devuelve y lo acepta Playwright. */
type EstadoDeAlmacenamiento = Awaited<ReturnType<BrowserContext['storageState']>>

/** Nombre de la cookie de sesión de Auth.js sobre HTTP (sin `__Secure-`). */
const COOKIE_SESION_ADMIN = 'authjs.session-token'

/** Texto exacto del botón de acceso directo, activo solo con `AUTH_DEV_BYPASS=1`. */
export const BOTON_ACCESO_DIRECTO = 'Entrar sin credenciales (desarrollo)'

export interface SesionAdministrativa {
  readonly estado: EstadoDeAlmacenamiento
  /** Token de la cookie, para poder revocar la sesión al terminar. */
  readonly token: string
}

/** Registro de lo que un test crea, para poder borrarlo al terminar. */
export interface Recursos {
  /** Apunta un formulario para su borrado en cascada. */
  formulario(id: string): void
  /** Apunta un activo de media para su borrado (fila y objetos del bucket). */
  activo(id: string): void
  /**
   * Título único para este test. Lleva el prefijo `e2e` para que cualquier
   * resto olvidado se reconozca de un vistazo en el panel.
   */
  titulo(sufijo: string): string
}

interface FixturesDeTrabajador {
  readonly sesionAdmin: SesionAdministrativa
}

interface FixturesDeTest {
  readonly contextoAdmin: BrowserContext
  readonly paginaAdmin: Page
  readonly apiAdmin: APIRequestContext
  readonly recursos: Recursos
}

export const test = base.extend<FixturesDeTest, FixturesDeTrabajador>({
  /* ---------------------------------------------------------------------- */
  /* Sesión administrativa, una por trabajador                               */
  /* ---------------------------------------------------------------------- */

  /**
   * La sesión se obtiene llamando a `POST /api/auth/acceso-directo` **sin
   * cabecera `Origin`**, no pulsando el botón de la página de login.
   *
   * No es un atajo por comodidad: es un rodeo a un fallo real de la aplicación.
   * `urlBase()` en `src/app/api/auth/acceso-directo/route.ts` construye el
   * origen esperado con `new URL(request.url)`, y bajo `next start` ese valor es
   * siempre `http://localhost:<puerto>` sea cual sea la cabecera `Host`. Como
   * `playwright.config.ts` fija `baseURL` en `http://127.0.0.1:3100`, el
   * navegador manda `Origin: http://127.0.0.1:3100`, no coincide, y la ruta
   * responde `403 Origen no permitido`. Un cliente sin `Origin` —que es lo que
   * la propia ruta admite a propósito para curl y scripts de CI— sí entra.
   *
   * El fallo **no se tapa**: `01-acceso.spec.ts` mantiene el inicio de sesión
   * por interfaz y falla en rojo mientras esto siga así. Este rodeo solo existe
   * para que los otros criterios de aceptación puedan probar lo suyo en lugar
   * de morir todos en el andamiaje.
   */
  sesionAdmin: [
    async ({ playwright }, usar) => {
      const api = await playwright.request.newContext({ baseURL: BASE_URL })

      const respuesta = await api.post('/api/auth/acceso-directo', {
        form: { destino: '/app/formularios' },
      })
      if (respuesta.status() === 404) {
        throw new Error(
          'El acceso directo responde 404: el servidor bajo prueba no tiene AUTH_DEV_BYPASS=1.',
        )
      }

      const estado = await api.storageState()
      const cookie = estado.cookies.find((actual) => actual.name === COOKIE_SESION_ADMIN)
      if (cookie === undefined) {
        throw new Error(
          `El acceso directo no ha dejado cookie de sesión (estado ${String(respuesta.status())}).`,
        )
      }

      // Comprobación de que la sesión sirve de verdad antes de repartirla.
      const sonda = await api.get('/api/forms', { params: { perPage: '1' } })
      if (!sonda.ok()) {
        throw new Error(
          `La sesión de acceso directo no autoriza /api/forms (estado ${String(sonda.status())}).`,
        )
      }

      await api.dispose()

      await usar({ estado, token: cookie.value })

      // La sesión ya no sirve para nada: revocarla evita que la base de datos
      // de desarrollo acumule una fila por cada ejecución de la suite.
      await borrarSesionAdministrativa(cookie.value)
      await cerrarPool()
    },
    { scope: 'worker' },
  ],

  /* ---------------------------------------------------------------------- */
  /* Contexto autenticado                                                    */
  /* ---------------------------------------------------------------------- */

  contextoAdmin: async ({ browser, sesionAdmin }, usar) => {
    const contexto = await browser.newContext({ storageState: sesionAdmin.estado })
    await usar(contexto)
    await contexto.close()
  },

  paginaAdmin: async ({ contextoAdmin }, usar) => {
    const pagina = await contextoAdmin.newPage()
    await usar(pagina)
  },

  /**
   * Cliente de API que comparte tarro de cookies con `paginaAdmin`: lo que un
   * test hace por la interfaz y lo que comprueba por la API ocurren dentro de
   * la misma sesión, como le pasaría a una persona.
   */
  apiAdmin: async ({ contextoAdmin }, usar) => {
    await usar(contextoAdmin.request)
  },

  /* ---------------------------------------------------------------------- */
  /* Aislamiento                                                             */
  /* ---------------------------------------------------------------------- */

  recursos: async ({ apiAdmin }, usar, informacion) => {
    // Todos los «participantes» de la suite comparten la IP del ejecutor, y el
    // limitador público cuenta por cliente. Sin este reinicio, el vigésimo
    // recorrido de la suite recibiría un 429 que no tiene nada que ver con lo
    // que ese test está probando.
    await purgarLimitesDePeticion()

    const formularios: string[] = []
    const activos: string[] = []
    let contador = 0

    const registro: Recursos = {
      formulario(id) {
        formularios.push(id)
      },
      activo(id) {
        activos.push(id)
      },
      titulo(sufijo) {
        contador += 1
        // Título único y reconocible: proyecto, trabajador, reloj y un contador
        // local, de modo que dos trabajadores nunca choquen por el slug.
        const semilla = [
          informacion.project.name,
          String(informacion.workerIndex),
          String(Date.now() % 1_000_000),
          String(contador),
        ].join('-')
        return `${PREFIJO_E2E} ${sufijo} ${semilla}`
      },
    }

    await usar(registro)

    // Orden deliberado. Primero los formularios: al irse arrastran en cascada
    // `media_asset_refs`, y sin referencias el borrado de un activo deja de dar
    // `409 ACTIVO_REFERENCIADO`. Después los activos por API, que es lo único
    // que borra también los objetos del bucket. La sentencia final es la red:
    // si la API no pudo, al menos la fila no se queda para siempre.
    await borrarFormularios(formularios)

    for (const id of activos) {
      await apiAdmin.delete(`/api/media/${id}`).catch(() => null)
    }
    await borrarActivosDeMedia(activos)
  },
})

export { expect }
