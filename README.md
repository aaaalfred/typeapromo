# Typeapromo

Formularios conversacionales para un equipo interno: se crean en un editor visual, se publican con
versionado, se responden por un enlace público sin registrarse y se analizan en un panel con
exportación a CSV.

El acceso administrativo es con **email + contraseña** y verificación vía **Resend**, o con
**Slack** (OpenID Connect, en stand-by / opcional); cobro por workspace con **Stripe**; las
imágenes viven en **Cloudflare R2**; los datos, en **PostgreSQL**. Todo en español.

El alcance funcional está en [`PR.md`](./PR.md) y el plan de ejecución por fases en
[`PLAN.md`](./PLAN.md). Las guías de operación, en [`docs/`](./docs/README.md).

## Qué hace

- **Editor visual** de tres áreas —recorrido, previsualización y propiedades— con autoguardado,
  control de revisión y once tipos de bloque. Nunca hay que tocar JSON.
- **Temas por formulario**: colores, tipografía de un catálogo local, radio, estilo de botón,
  alineación, logo y fondo, con el contraste validado en vivo contra WCAG AA.
- **Lógica condicional** con saltos solo hacia adelante, prioridades explícitas y un validador que
  rechaza destinos inexistentes, ciclos, reglas contradictorias y preguntas inalcanzables **antes**
  de publicar.
- **Imágenes** que recorren un bucket privado de staging, se validan por su firma binaria real y
  se publican como WebP sin EXIF en un bucket público con caché inmutable.
- **Publicación versionada**: cada publicación congela un snapshot y cada respuesta queda atada al
  suyo, así que una versión nueva no altera ni un recorrido ni una etiqueta del histórico.
- **Resultados** con sesiones iniciadas, completadas y abandonadas, abandono por pregunta,
  distribuciones, promedios y una exportación CSV en streaming, una versión por fichero.

## Stack

| Pieza | Elección |
|-------|----------|
| Framework | Next.js 16 (App Router, runtime Node.js en todas las rutas) |
| Lenguaje | TypeScript 5.9 estricto, con `noUncheckedIndexedAccess` |
| Estilos | Tailwind CSS 4 · Radix/shadcn · `dnd-kit` · Motion |
| Base de datos | PostgreSQL 17 + Drizzle ORM, migraciones versionadas |
| Contratos | Zod, compartido entre editor, API y experiencia pública |
| Autenticación | Email + contraseña (Argon2id), verificación con Resend · Slack OIDC opcional |
| Facturación | Stripe (Checkout, Customer Portal, webhooks idempotentes, planes Free y Pro) |
| Almacenamiento | Cloudflare R2 en producción; MinIO en local |
| Tests | Vitest (unitarias e integración) · Playwright (end-to-end) · axe-core |

Las versiones están **ancladas exactas** en `package.json`, sin `^` ni `~`: el mismo
`package.json` produce siempre el mismo árbol.

## Puesta en marcha

Requisitos: Node.js 22.13 o superior, Docker y Docker Compose.

```bash
cp .env.example .env
docker compose up -d postgres minio minio-init   # infraestructura
npm ci
npm run db:deploy                                # migraciones
npm run db:seed                                  # datos de ejemplo (opcional)
npm run dev                                      # http://localhost:3000
```

En <http://localhost:3000/iniciar-sesion> aparece **«Entrar sin credenciales (desarrollo)»**, que
existe porque `.env.example` trae `AUTH_DEV_BYPASS=1`. Slack exige redirecciones por HTTPS y no se
puede usar en local; el atajo está tras esa bandera y **no debe existir jamás en producción**
([por qué y cómo comprobarlo](./docs/despliegue.md#el-bypass-de-autenticación-jamás-en-producción)).

Para levantar el producto entero en contenedores, `docker compose up --build`. El detalle de los
dos caminos está en [docs/puesta-en-marcha.md](./docs/puesta-en-marcha.md).

## Cómo se prueba

```bash
npm run lint          # ESLint sobre todo el repositorio
npm run typecheck     # tsc --noEmit, modo estricto
npm test              # Vitest: unitarias y de integración
npm run test:e2e      # Playwright: end-to-end, escritorio y móvil
npm run verify:bypass # que AUTH_DEV_BYPASS no exista en artefactos de producción
```

Los tests de integración de Vitest se saltan solos si falta `DATABASE_URL`; con PostgreSQL
levantado se ejecutan todos.

`npm run test:e2e` compila el build de producción, lo arranca en el puerto 3100 y recorre el
producto entero en dos proyectos (`escritorio` y `movil`). Necesita PostgreSQL y MinIO en marcha.
Los nueve criterios de aceptación de `PR.md` llevan su número en el nombre del test, así que
`npx playwright test -g "CA7"` ejecuta exactamente lo que verifica ese criterio. Detalle completo
en [docs/e2e.md](./docs/e2e.md).

## Scripts

| Script | Qué hace |
|--------|----------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` · `npm start` | Build de producción y servirlo |
| `npm run lint` · `npm run typecheck` | ESLint y `tsc --noEmit` |
| `npm test` · `npm run test:watch` | Vitest |
| `npm run test:e2e` · `npm run test:e2e:ui` | Playwright |
| `npm run db:generate` | Genera la migración SQL tras cambiar el esquema |
| `npm run db:migrate` | Aplica lo pendiente con drizzle-kit (desarrollo) |
| `npm run db:deploy` | Aplica lo pendiente con el migrador que viaja en la imagen |
| `npm run db:seed` · `npm run db:seed:limpiar` | Datos de demostración, idempotentes |
| `npm run verify:bypass` | Protección 3 del bypass de autenticación |

## Estructura

```
src/
  app/
    (app)/app/formularios/       Panel: listado, editor y resultados
    (auth)/                      Inicio de sesión y acceso denegado
    api/                         Rutas HTTP (forms, media, public, internal, health)
    f/[slug]/                    Experiencia pública
  components/
    editor/                      Editor de tres áreas
    formulario/                  Renderer compartido: previsualización = experiencia pública
    panel/                       Listado y acciones sobre formularios
    publico/                     Armazón de la experiencia pública
    resultados/                  Tablero de resultados
    ui/                          Piezas básicas
  db/                            Esquema Drizzle y cliente
  lib/
    auth/                        Guard de workspace, rutas, cookies
    editor/                      Documento, diagnóstico y contraste
    forms/                       Contratos Zod, motor de recorrido y validador
    storage/                     Cliente S3 tras una interfaz
    theme/                       Tokens visuales
  server/
    forms/  media/  publish/  responses/  results/  rate-limit/
                                 Capa de servicio, sin conocer HTTP
docs/                            Puesta en marcha, migraciones, Slack, R2, despliegue, E2E
drizzle/                         Migraciones SQL versionadas
e2e/                             Suite Playwright y sus utilidades
scripts/                         migrate.mjs · seed-demo.mjs · verificar-bypass.mjs
```

El renderer de `src/components/formulario` es **el mismo componente** en la previsualización del
editor y en la experiencia pública, sin ramas `if (esPreview)`. Es la decisión que impide que las
dos vistas diverjan, y conviene no revertirla.

## Endpoint de salud

`GET /api/health` es público a propósito: lo usan el `HEALTHCHECK` del contenedor, el balanceador
y la auditoría externa del bypass.

```json
{ "status": "ok", "db": "up", "authMode": "email" }
```

`authMode` puede ser `"email"` (modo estándar con email y contraseña), `"slack"` (cuando
Slack OIDC está configurado) o `"dev-bypass"` si el bypass de desarrollo está activo.
Nunca se exponen cadenas de conexión, credenciales ni detalles del error.

## Documentación

| Documento | Cuándo se lee |
|-----------|---------------|
| [Puesta en marcha local](./docs/puesta-en-marcha.md) | La primera vez que se clona el repositorio |
| [Migraciones](./docs/migraciones.md) | Al cambiar el esquema y en cada despliegue |
| [Envío de correo con Resend](./docs/resend.md) | Configuración de Resend y fallback a consola en desarrollo |
| [Suscripciones con Stripe](./docs/stripe.md) | Configuración de Stripe, webhooks y límites de planes |
| [Aplicación de Slack](./docs/slack.md) | Opcional: inicio de sesión alternativo con Slack |
| [Buckets R2 y CORS](./docs/r2.md) | Antes del primer despliegue en producción |
| [Despliegue y operación](./docs/despliegue.md) | En cada despliegue, y para el cron de limpieza |
| [Suite end-to-end](./docs/e2e.md) | Al escribir o depurar pruebas de `e2e/` |

## Integración continua

`.github/workflows/ci.yml` corre en cada push a `main` y en cada pull request, en cuatro jobs:

- **verify** — lint, typecheck, verificación del bypass, tests unitarios y build.
- **migrations** — aplica las migraciones sobre PostgreSQL, comprueba que reaplicarlas no hace
  nada y que el esquema y `drizzle/` no divergen.
- **e2e** — Playwright contra el build de producción, con PostgreSQL y MinIO. Va en un job aparte
  porque compilar, levantar los servicios y descargar Chromium son varios minutos que no tienen
  por qué retrasar el aviso de un error de tipos.
- **demo** — siembra los datos de demostración, comprueba que repetirlo no duplica nada y que
  `--limpiar` los retira por completo.
