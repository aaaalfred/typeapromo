# Despliegue y operación

La aplicación se despliega como **contenedor** en infraestructura propia. Necesita PostgreSQL y
un almacén S3-compatible (Cloudflare R2); nada más.

## Imagen

`Dockerfile` es multi-stage (`deps` → `builder` → `runner`) sobre **`node:22-bookworm-slim`**.

No es Alpine a propósito: Sharp depende de libvips y el binario `linuxmusl` da peores resultados
en rendimiento y soporte de formatos (`PLAN.md` §2.8). La imagen final corre como usuario sin
privilegios (`nextjs`, uid 1001), usa la salida `standalone` de Next e incluye un `HEALTHCHECK`
contra `/api/health`.

```bash
docker build -t typeapromo:$(git rev-parse --short HEAD) .
```

## Secuencia de despliegue

1. Construir la imagen.
2. **Migrar** con esa misma imagen: `docker run --rm -e DATABASE_URL=… <imagen> node scripts/migrate.mjs`.
3. Solo si el paso 2 sale con código 0, sustituir las réplicas.

El detalle y el porqué están en [Migraciones](./migraciones.md). La aplicación **no migra al
arrancar**: con varias réplicas eso provocaría migraciones concurrentes.

## Variables de entorno de producción

```bash
# Núcleo
DATABASE_URL=postgresql://usuario:clave@host:5432/typeapromo
PUBLIC_BASE_URL=https://formularios.tu-dominio.com
AUTH_URL=https://formularios.tu-dominio.com
AUTH_SECRET=<openssl rand -base64 32>

# Slack — ver docs/slack.md
SLACK_CLIENT_ID=…
SLACK_CLIENT_SECRET=…
SLACK_TEAM_ID=T01ABCDE2FG

# Almacenamiento — ver docs/r2.md
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET_STAGING=forms-media-staging
R2_BUCKET_PUBLIC=forms-media-public
MEDIA_PUBLIC_BASE_URL=https://media.tu-dominio.com

# Limpieza programada
CLEANUP_SECRET=<openssl rand -base64 32>

# AUTH_DEV_BYPASS  ← NO DEBE EXISTIR. Ver más abajo.
# S3_FORCE_PATH_STYLE ← ausente con R2; solo `1` con MinIO en local.
```

`AUTH_SECRET` debe ser **estable entre despliegues**: si cambia, todas las sesiones activas dejan
de valer y el equipo entero tiene que volver a entrar.

`PUBLIC_BASE_URL` decide además si la cookie de sesión pública lleva `Secure`: se marca en cuanto
empieza por `https://`. Un despliegue HTTPS con esta variable apuntando a `http://` emite cookies
sin `Secure`.

## El bypass de autenticación: jamás en producción

`AUTH_DEV_BYPASS=1` habilita `POST /api/auth/acceso-directo`, que crea una sesión administrativa
**sin credenciales de ningún tipo**. Cualquiera que alcance esa URL entra al panel con permisos
completos: crear, editar, publicar, leer todas las respuestas y exportarlas.

Existe porque las pruebas E2E no pueden hablar con Slack real y porque Slack exige redirecciones
por HTTPS (`PLAN.md` §2.3). Tiene tres protecciones, y las tres importan:

1. **La ruta solo existe con la variable puesta.** Sin ella devuelve `404`, no `403`: no revela
   siquiera que el endpoint esté ahí.
2. **Es observable desde fuera.** `GET /api/health` devuelve `authMode`. Con el bypass abierto
   dice `dev-bypass`, y la interfaz muestra una franja de aviso permanente en todas las páginas.
3. **CI lo verifica.** `npm run verify:bypass` falla si `Dockerfile` o `docker-compose.yml`
   definen la variable.

### Qué comprobar en cada despliegue

```bash
curl -s https://formularios.tu-dominio.com/api/health
# {"status":"ok","db":"up","authMode":"slack"}   ← authMode DEBE ser "slack"

curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://formularios.tu-dominio.com/api/auth/acceso-directo
# 404
```

Si `authMode` dice `dev-bypass` o el POST no devuelve `404`, **el panel está abierto a internet**.
Quita la variable y reinicia antes que ninguna otra cosa.

Es una comprobación barata: merece la pena automatizarla en el *smoke test* posterior al
despliegue.

## Cron de limpieza

No hay scheduler dentro del proceso (`PLAN.md` §1 y §2.2). El cron del host llama una vez al día
a `POST /api/internal/cleanup` con el secreto **en una cabecera**:

```cron
# /etc/cron.d/typeapromo-cleanup
17 4 * * * root curl -fsS -X POST https://formularios.tu-dominio.com/api/internal/cleanup \
  -H "x-cleanup-secret: $CLEANUP_SECRET" >> /var/log/typeapromo-cleanup.log 2>&1
```

También se admite `Authorization: Bearer <secreto>`. **Nunca** por query string: una URL con el
secreto dentro acaba en el log de acceso, en el historial del shell y en la cabecera `Referer` de
cualquier redirección. Una petición con `?secret=…` es tan anónima como una sin nada y recibe el
mismo `401`.

El endpoint hace tres purgas independientes:

| Purga | Criterio |
|-------|----------|
| Cargas de staging incompletas | Estado `uploading` con más de **24 h** |
| Activos públicos huérfanos | `ready`, sin ninguna referencia en `media_asset_refs`, con más de **7 días** |
| Ventanas de `rate_limits` | Ventanas ya caducadas |

Es **idempotente**: cada purga selecciona por estado y antigüedad, así que un cron solapado o un
reintento no borran nada de más. Y en cada activo se borran primero los objetos y después la
fila: si el bucket falla, la fila sobrevive y el siguiente pase reintenta, en vez de perder el
rastro de unos objetos que ya nadie sabría nombrar.

Cada pase procesa como mucho 500 activos por categoría, para acotar la duración de la llamada. Si
hay un atraso grande, ejecútalo varias veces seguidas: por ser idempotente, no hay riesgo.

Respuesta típica:

```json
{
  "ejecutadoEn": "2026-08-17T04:17:03.221Z",
  "resumen": {
    "stagingCaducado": 3,
    "huerfanosPublicados": 1,
    "objetosBorrados": 7,
    "rateLimitsPurgados": 412
  }
}
```

Códigos de error: `401` con secreto ausente o incorrecto; `500` con `NO_CONFIGURADO` si
`CLEANUP_SECRET` no está definida en el servidor — falla cerrado y lo dice, porque un `401` ahí
haría pensar que el cron tiene mal el secreto cuando el problema está en el despliegue.

## Sonda de salud

`GET /api/health` es público a propósito: lo usan el `HEALTHCHECK` del contenedor, el balanceador
y la auditoría externa del bypass.

```json
{ "status": "ok", "db": "up", "authMode": "slack" }
```

| Campo | Valores | Significado |
|-------|---------|-------------|
| `status` | `ok`, `degraded` | `degraded` (HTTP 503) en cuanto `db` no sea `up` |
| `db` | `up`, `down`, `not-configured` | `not-configured` es que falta `DATABASE_URL`, distinto de que la base no responda |
| `authMode` | `slack`, `dev-bypass` | `dev-bypass` si `AUTH_DEV_BYPASS=1` |

Nunca expone cadenas de conexión, credenciales ni detalles del error.

## Proxy inverso

La aplicación escucha en el puerto 3000 dentro del contenedor. Delante hace falta un proxy que
termine TLS y envíe:

- `X-Forwarded-Proto: https` — la ruta de acceso directo y las URL de callback lo usan para
  construir el origen correcto.
- `X-Forwarded-For` — es de donde sale la IP que alimenta el rate limiting. **Se hashea con una
  sal de proceso y nunca se almacena en claro ni se asocia a ninguna respuesta**; la tabla
  `rate_limits` no tiene relación alguna con `response_sessions`.

Los cuerpos que la aplicación recibe son pequeños (JSON de borradores): las imágenes van directas
al bucket y no pasan por el proxy. El CSV sale **en streaming**, así que conviene desactivar el
buffering de respuesta del proxy para exportaciones grandes.

## Copias de seguridad

PostgreSQL es el único almacén relacional y guarda todo lo que no se puede regenerar: los
formularios, los snapshots publicados y las respuestas.

```bash
pg_dump --format=custom --file=typeapromo-$(date +%F).dump "$DATABASE_URL"
```

R2 guarda las imágenes procesadas. Perderlas no rompe ningún formulario, pero deja huecos en los
publicados: los `media_assets` seguirían apuntando a claves inexistentes.

Restaurar es `pg_restore` sobre una base vacía y después `node scripts/migrate.mjs`, que no hará
nada si el volcado ya venía al día.

## Qué mirar cuando algo va mal

| Síntoma | Dónde mirar |
|---------|-------------|
| `503` en `/api/health` | `db` en el cuerpo: `down` es PostgreSQL, `not-configured` es la variable |
| Nadie puede entrar | `SLACK_TEAM_ID`, y `authMode` en `/api/health` |
| Las imágenes no suben | CORS del bucket de staging ([docs/r2.md](./r2.md#3-cors-del-bucket-de-staging)) |
| Las imágenes no se ven | `MEDIA_PUBLIC_BASE_URL` y el dominio público del bucket |
| Staging crece sin parar | El cron de limpieza no se está ejecutando |
| `429` en el formulario público | Rate limiting; los cupos están en `src/server/rate-limit` |
| Sesiones perdidas tras desplegar | `AUTH_SECRET` cambió entre despliegues |
