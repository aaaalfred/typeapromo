# Puesta en marcha local

Dos caminos. El primero levanta el producto entero en contenedores y es el que reproduce
producción; el segundo deja la aplicación en el host, que es lo cómodo para desarrollar.

## Requisitos

- Node.js 22.13 o superior (`engines.node` lo exige).
- Docker y Docker Compose.
- Nada más: PostgreSQL y el almacén de objetos vienen en el compose.

## Camino 1 — Todo en Docker

```bash
cp .env.example .env
docker compose up --build
```

El compose levanta cinco piezas:

| Servicio | Puerto | Qué es |
|----------|--------|--------|
| `postgres` | 5432 | PostgreSQL 17, datos en el volumen `postgres-data` |
| `minio` | 9000 / 9001 | Sustituto S3-compatible de R2; la consola web está en el 9001 |
| `minio-init` | — | Job de un solo uso: crea `forms-media-staging` y `forms-media-public` |
| `migrate` | — | Job de un solo uso: aplica las migraciones y termina |
| `app` | 3000 | La aplicación Next.js (imagen multi-stage, salida `standalone`) |

`app` **no arranca** hasta que `migrate` sale con código 0: la aplicación nunca ve un esquema
desactualizado. Comprobación:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","db":"up","authMode":"slack"}
```

`authMode` es `slack` porque el compose **no** define `AUTH_DEV_BYPASS`, y eso es deliberado: sin
credenciales de Slack no hay forma de entrar al panel desde el compose. Para trabajar en el panel,
usa el camino 2.

## Camino 2 — Infraestructura en Docker, aplicación en el host

Es el modo de desarrollo habitual: recarga en caliente y acceso al panel sin Slack.

```bash
cp .env.example .env          # trae AUTH_DEV_BYPASS=1 y apunta a localhost
docker compose up -d postgres minio minio-init
npm ci
npm run db:deploy             # aplica las migraciones
npm run db:seed               # datos de demostración (opcional, idempotente)
npm run dev
```

En <http://localhost:3000/iniciar-sesion> aparece el botón **«Entrar sin credenciales
(desarrollo)»**, que existe solo porque `AUTH_DEV_BYPASS=1`. Una franja de aviso permanente lo
recuerda en toda la interfaz y `/api/health` devuelve `authMode: "dev-bypass"`.

### Sin Docker en absoluto

Necesitas un PostgreSQL propio en `DATABASE_URL` y un almacén S3-compatible en `R2_*`. Todo lo
que dependa de imágenes (subida, procesado, portada, tarjetas con imagen) fallará sin el segundo;
el resto del producto funciona.

## Datos de demostración

```bash
npm run db:seed
```

Crea tres formularios de ejemplo con tema propio, lógica condicional, varios tipos de bloque,
versiones publicadas y respuestas ya registradas, para que un repositorio recién clonado enseñe
algo vivo en el panel y en los resultados.

Es **idempotente**: se identifica por los slugs `demo-*` y reejecutarlo deja la base exactamente
igual, sin duplicar ni acumular. Para quitarlo:

```bash
node scripts/seed-demo.mjs --limpiar
```

El script no toca ningún formulario que no sea suyo.

## Comprobaciones

| Comando | Qué verifica |
|---------|--------------|
| `npm run lint` | ESLint sobre todo el repositorio |
| `npm run typecheck` | `tsc --noEmit`, modo estricto |
| `npm test` | Vitest: unitarias y de integración |
| `npm run test:e2e` | Playwright de punta a punta ([detalle](./e2e.md)) |
| `npm run verify:bypass` | Que ningún artefacto de producción define `AUTH_DEV_BYPASS` |

Los tests de integración de Vitest se saltan solos si falta `DATABASE_URL`; con la base de datos
levantada se ejecutan todos.

## Variables de entorno

Todas están documentadas en [`.env.example`](../.env.example). Resumen por bloques:

- **Núcleo**: `DATABASE_URL`, `PUBLIC_BASE_URL`, `AUTH_SECRET`, `AUTH_URL`.
- **Slack, solo producción**: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_TEAM_ID`
  ([cómo se obtienen](./slack.md)).
- **Bypass, solo desarrollo y CI**: `AUTH_DEV_BYPASS`.
- **Almacenamiento**: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET_STAGING`, `R2_BUCKET_PUBLIC`, `MEDIA_PUBLIC_BASE_URL`, `S3_FORCE_PATH_STYLE`
  ([cómo se preparan](./r2.md)).
- **Limpieza programada**: `CLEANUP_SECRET` ([cron](./despliegue.md#cron-de-limpieza)).

`S3_FORCE_PATH_STYLE=1` es obligatorio con MinIO (exige `endpoint/bucket/clave`) y debe estar
**ausente o a `0`** con R2, que pone el bucket en el host.
