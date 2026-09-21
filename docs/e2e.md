# Suite end-to-end

`e2e/` contiene la suite de Playwright que recorre el producto de punta a punta.
Doce ficheros, dos proyectos (`escritorio` y `movil`), unos 45 tests por proyecto y menos de un
minuto de ejecución una vez compilado el build.

## Cómo se ejecuta

```bash
docker compose up -d postgres minio minio-init   # PostgreSQL y el almacén
npm run db:deploy                                # migraciones al día
npm run test:e2e                                 # compila y ejecuta
npm run test:e2e:ui                              # modo interactivo
npx playwright test e2e/05-logica.spec.ts        # un fichero suelto
npx playwright test --project=movil              # solo el proyecto móvil
```

`playwright.config.ts` levanta el servidor por su cuenta: `npm run build && npx next start --port
3100`, con `AUTH_DEV_BYPASS=1`. Tres decisiones que conviene conocer:

- **Puerto 3100, no 3000.** El 3000 se lo suele llevar cualquier otro proyecto de Node, y el
  fallo resultante —una aplicación ajena respondiendo 404— cuesta más de diagnosticar que de
  evitar.
- **Build de producción, no `next dev`.** Compilar tarda, pero `next dev` no ejerce el mismo
  código; sin esto, los fallos que solo aparecen en el build se descubren en el despliegue.
- **`reuseExistingServer` fuera de CI.** Si ya tienes un servidor en el 3100 con el mismo
  entorno, se reutiliza y las ejecuciones bajan de minutos a segundos.

## Mapa de la suite

| Fichero | Qué cubre |
|---------|-----------|
| `01-acceso.spec.ts` | CA1 · acceso al panel, rechazo de otro workspace, visibilidad del bypass |
| `02-editor.spec.ts` | CA2 · construir un formulario completo sin tocar JSON |
| `03-media.spec.ts` | CA3 · staging privado → validación → bucket público |
| `04-valoracion.spec.ts` | CA4 · estrellas, caras y corazones: teclado y valores analizables |
| `05-logica.spec.ts` | CA5 · cada rama de la bifurcación, y el rechazo de los ciclos |
| `06-publico.spec.ts` | CA6 · responder sin login, cookie `HttpOnly`, reanudación |
| `07-versionado.spec.ts` | CA7 · publicar una versión 2 sin tocar el histórico |
| `08-resultados.spec.ts` | CA8 · el tablero, el CSV y `answers` dicen lo mismo |
| `09-plataforma.spec.ts` | CA9 · salud, migraciones idempotentes, límites, cron de limpieza |
| `10-accesibilidad.spec.ts` | axe-core sobre login, editor, recorrido público y resultados |
| `11-guion-completo.spec.ts` | El guion de PR.md entero, en un solo recorrido |
| `12-responsivo.spec.ts` | Que nada desborde en horizontal, en los dos tamaños |

Los nueve criterios de aceptación de `PR.md` llevan su número en el **nombre del test** (`CA1 ·`,
`CA2 ·`…), de modo que `npx playwright test -g "CA7"` ejecuta exactamente lo que verifica ese
criterio.

En `e2e/utiles/` viven los ayudantes: fixtures, cliente de API, generador de imágenes, recorrido
público, manejo del editor y análisis de accesibilidad.

## Aislamiento y limpieza

Cada test crea lo suyo y lo borra al terminar, pase lo que pase:

- El fixture `recursos` es un registro. Todo formulario y todo activo de media que un test cree se
  apunta ahí, y el teardown los borra también si el test ha fallado. Borrar un formulario arrastra
  en cascada borrador, versiones, sesiones, respuestas, eventos y referencias de media.
- Los títulos llevan el prefijo `e2e`, así que cualquier resto olvidado se reconoce de un vistazo
  en el panel.
- La sesión administrativa se crea **una por trabajador** y se revoca en el teardown, en lugar de
  dejar una fila en `auth_sessions` por cada test.
- Ningún test depende del orden ni de datos que haya dejado otro. La suite se puede repetir
  indefinidamente sin acumular basura.

La única concesión al entorno es reiniciar la tabla `rate_limits` antes de cada test: toda la
suite sale de una IP, y la política pública es de 20 sesiones cada diez minutos por cliente. Cada
«participante» de un test representa a una persona que en la vida real vendría de otra dirección.
El limitador no queda sin cobertura: `09-plataforma.spec.ts` lo agota a propósito con su propia IP
simulada (`X-Forwarded-For`) y comprueba que corta con `429`.

## Accesibilidad

`e2e/utiles/accesibilidad.ts` envuelve `@axe-core/playwright` con las etiquetas `wcag2a`,
`wcag2aa`, `wcag21a` y `wcag21aa`. **Falla ante cualquier violación de impacto `serious` o
`critical`**; las de impacto `minor` y `moderate` no tumban la suite, porque axe marca ahí cosas
legítimamente discutibles y una suite que falla por ellas se acaba desactivando entera.

Antes de analizar espera a que no quede ninguna animación en marcha. No es una precaución
decorativa: la experiencia pública entra cada pantalla con un fundido de 280 ms, y axe calcula el
color efectivo del texto en el instante en que mira. Medido a media transición, un gris que sobre
blanco da 6,1:1 se lee como 3,4:1 y el test acusaría a la aplicación de un fallo que no tiene.

## Tests que fallan a propósito

Dos tests están en rojo porque documentan fallos reales de la aplicación. No se han ablandado ni
se han marcado como omitidos: cuando el código se arregle, pasarán solos. El diagnóstico completo
—causa, fichero, línea y corrección propuesta— está en el comentario que precede a cada uno.

1. `01-acceso.spec.ts` → «CA1 · un miembro del equipo entra desde la interfaz y llega al panel».
   `POST /api/auth/acceso-directo` responde `403` a cualquier navegador que no llegue por
   `localhost`.
2. `10-accesibilidad.spec.ts` → «sin violaciones graves en el editor…». El subtítulo del bloque
   seleccionado en la lista del recorrido da 4,35:1 de contraste, por debajo del mínimo AA.

## Escribir un test nuevo

```ts
import { crearFormulario, guardarYPublicar } from './utiles/api'
import { documentoConBifurcacion } from './utiles/documentos'
import { expect, test } from './utiles/fixtures'
import { abrirFormularioPublico, avanzarHasta } from './utiles/publico'

test('lo que sea', async ({ apiAdmin, page, recursos }) => {
  const titulo = recursos.titulo('mi-caso')
  const documento = documentoConBifurcacion(titulo)
  const formulario = await crearFormulario(apiAdmin, titulo, documento)
  recursos.formulario(formulario.id)          // ← sin esto, el test deja basura
  await guardarYPublicar(apiAdmin, formulario.id, formulario.draft?.revision ?? 1, documento)

  await abrirFormularioPublico(page, formulario.slug, 'bienvenida')
  await avanzarHasta(page, 'perfil')
  await expect(page.getByRole('radio', { name: 'En equipo' })).toBeVisible()
})
```

Convenciones que conviene respetar:

- **Nada de `data-testid`.** No hay ni uno en `src/`, y es una virtud: buscar por rol y nombre
  accesible comprueba de paso que ese nombre existe. Los únicos ganchos que se usan son los que la
  propia interfaz expone con intención semántica (`data-bloque`, `data-estado`, `data-publicable`,
  `data-cifra`, `data-apariencia`).
- **El atrezo, por API o por interfaz; nunca por SQL.** Un test que prepara su escenario
  escribiendo en la base de datos deja de probar la mitad del sistema. `e2e/utiles/base-datos.ts`
  solo se usa para limpiar y para comprobar invariantes que la interfaz no expone.
- **Fixtures disponibles**: `paginaAdmin` (página autenticada), `apiAdmin` (cliente de API con la
  misma sesión), `recursos` (registro de limpieza), y los estándar de Playwright (`page` sin
  sesión, `browser`, `request`).
- **Esperar por estado, no por reloj.** `avanzarHasta(page, 'bloque')` espera a la pantalla
  concreta; el autoguardado del editor tiene 900 ms de rebote y para eso está
  `guardarBorradorDesdeElEditor()`, que pulsa «Guardar ahora» y espera al indicador.

## Diagnóstico de fallos

Cada fallo deja traza, captura y vídeo en `.playwright/`:

```bash
npx playwright show-trace .playwright/<carpeta-del-test>/trace.zip
npx playwright show-report      # informe HTML, solo en CI por defecto
```

## En integración continua

Los E2E corren en un **job propio** (`e2e` en `.github/workflows/ci.yml`), separado de lint,
typecheck, unitarias y build. El motivo es de tiempo de respuesta: la suite necesita compilar el
build de producción, levantar PostgreSQL y MinIO y descargar Chromium, y eso son varios minutos
que no tienen por qué retrasar el aviso de un error de tipos. Con dos jobs, el veredicto barato
llega en un par de minutos y el caro llega cuando llega, sin bloquear al otro.
