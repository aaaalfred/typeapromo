# Typeapromo

Formularios conversacionales para un equipo interno: creación, publicación versionada, respuesta
pública sin registro y analítica. Acceso administrativo mediante Slack (OpenID Connect);
almacenamiento de imágenes en Cloudflare R2.

El alcance funcional está en [`PR.md`](./PR.md); el plan de ejecución por fases, en
[`PLAN.md`](./PLAN.md). Este README cubre la **fase 0**: la base del proyecto.

## Stack

| Pieza | Elección |
|-------|----------|
| Framework | Next.js 16 (App Router, runtime Node.js en todas las rutas) |
| Lenguaje | TypeScript 5.9 en modo estricto, con `noUncheckedIndexedAccess` |
| Estilos | Tailwind CSS 4 (plugin de PostCSS) |
| Base de datos | PostgreSQL 17 + Drizzle ORM, migraciones versionadas |
| Contratos | Zod |
| Tests | Vitest |
| Almacenamiento | Cloudflare R2 en producción; MinIO en local (S3-compatible) |

Todas las versiones están **ancladas exactas** en `package.json` (sin `^` ni `~`): el mismo
`package.json` produce siempre el mismo árbol de dependencias.

El runtime es Node.js en todas las rutas de forma deliberada: el driver `pg` que usa Drizzle no
funciona en el runtime Edge.

## Requisitos

- Node.js 22.13 o superior
- Docker y Docker Compose (para el entorno local completo)

## Puesta en marcha

### Con Docker (recomendado)

```bash
cp .env.example .env       # revisa los valores; no hace falta tocar nada para arrancar
docker compose up --build
```

Levanta cuatro contenedores:

| Servicio | Puerto | Notas |
|----------|--------|-------|
| `app` | 3000 | La aplicación Next.js (imagen multi-stage, salida `standalone`) |
| `postgres` | 5432 | PostgreSQL 17, datos en el volumen `postgres-data` |
| `minio` | 9000 / 9001 | S3-compatible; la consola web está en el 9001 |
| `minio-init` | — | Job de un solo uso: crea los dos buckets y publica el bucket público |

Comprobación:

```bash
curl http://localhost:3000/api/health
```

### Sin Docker

Necesitas un PostgreSQL accesible en `DATABASE_URL`.

```bash
cp .env.example .env
npm ci
npm run dev
```

## Scripts

| Script | Qué hace |
|--------|----------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build de producción |
| `npm run lint` | ESLint (configuración plana, `eslint-config-next`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, una pasada |
| `npm run db:generate` | Genera migraciones SQL desde el esquema Drizzle |
| `npm run db:migrate` | Aplica las migraciones pendientes |

## Endpoint de salud

`GET /api/health` responde `200` cuando todo está en pie y `503` en cuanto la base de datos no
responde. No expone nunca cadenas de conexión, credenciales ni detalles del error.

```json
{ "status": "ok", "db": "up", "authMode": "slack" }
```

| Campo | Valores | Significado |
|-------|---------|-------------|
| `status` | `ok`, `degraded` | `degraded` en cuanto `db` no sea `up` |
| `db` | `up`, `down`, `not-configured` | `not-configured` significa que falta `DATABASE_URL`; es distinto de que la base de datos no responda |
| `authMode` | `slack`, `dev-bypass` | `dev-bypass` si `AUTH_DEV_BYPASS=1` |

Que `authMode` sea observable desde fuera es intencionado: permite auditar desde el exterior si un
despliegue de producción tiene abierto el bypass de autenticación, sin entrar al servidor.

## Variables de entorno

Todas están documentadas en [`.env.example`](./.env.example). Resumen:

- **Núcleo**: `DATABASE_URL`, `PUBLIC_BASE_URL`, `AUTH_SECRET`, `AUTH_URL`.
- **Slack, solo producción**: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_TEAM_ID`.
- **Bypass, solo desarrollo y CI**: `AUTH_DEV_BYPASS`.
- **Almacenamiento**: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET_STAGING`, `R2_BUCKET_PUBLIC`, `MEDIA_PUBLIC_BASE_URL`, `S3_FORCE_PATH_STYLE`.
- **Limpieza programada**: `CLEANUP_SECRET`.

> `AUTH_DEV_BYPASS` habilita el acceso sin credenciales. **No debe existir en producción**: no está
> definida en `docker-compose.yml` a propósito. `.env` está en `.gitignore`; solo se versiona
> `.env.example`.

## Base de datos

El esquema Drizzle vive en `src/db/schema` y las migraciones generadas en `drizzle/`.
`drizzle.config.ts` lee `DATABASE_URL` del entorno.

```bash
npm run db:generate   # tras cambiar el esquema
npm run db:migrate    # aplica lo pendiente
```

Las migraciones se aplican de forma controlada en el despliegue; el contenedor de la aplicación no
las ejecuta al arrancar.

## Docker

La imagen es multi-stage (`deps` → `builder` → `runner`) sobre **`node:22-bookworm-slim`**.

No se usa Alpine deliberadamente: el procesado de imágenes con Sharp depende de libvips, y el
binario `linuxmusl` de Alpine da peores resultados en rendimiento y soporte de formatos
(`PLAN.md`, sección 2, punto 8). La imagen final corre como usuario sin privilegios (`nextjs`,
uid 1001) e incluye un `HEALTHCHECK` contra `/api/health`.

## Integración continua

`.github/workflows/ci.yml` ejecuta en cada push a `main` y en cada pull request: instalación con
`npm ci`, **lint**, **typecheck** y **build**. Las fases siguientes añadirán tests unitarios, de
integración, build de Docker y end-to-end.

## Estructura

```
src/
  app/
    api/health/route.ts   Estado de la app y de PostgreSQL
    globals.css           Tailwind y tokens base
    layout.tsx            Layout raíz
    page.tsx              Portada
  db/                     Esquema Drizzle y acceso a datos
  lib/forms/              Contratos Zod y motor de lógica
drizzle/                  Migraciones SQL versionadas
public/                   Activos estáticos
```
