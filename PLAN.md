# Plan de implementación

Plan de ejecución para `PR.md`. Este documento manda sobre el original allí donde lo contradice: las diferencias están recogidas en «Ajustes al spec».

---

## 1. Decisiones cerradas

| Tema | Decisión |
|------|----------|
| Empaquetado | **8 PRs apilados**, uno por fase, cada uno mergeable y con CI en verde. No una rama única. |
| Slack | Workspace único, plan Free. Validación por comparación directa de `team_id`. Sin Enterprise Grid. |
| Auth en dev/CI | **Login sin credenciales tras flag** (`AUTH_DEV_BYPASS`). Slack OIDC solo en producción. |
| Limpieza R2 | **Endpoint `/api/internal/cleanup` con secreto**, invocado por el cron del servidor. Sin scheduler en proceso. |
| Sesión pública | **Cookie `HttpOnly`**. El token no viaja nunca en la URL. |

---

## 2. Ajustes al spec

Diez puntos detectados en la revisión de `PR.md` y cómo se resuelven.

1. **Token de respuesta en la URL** → sustituido por cookie `HttpOnly` + `SameSite=Lax`. En base de datos se guarda solo el **hash SHA-256** del token; la cookie lleva el valor en claro. Las rutas públicas pierden el segmento `:token`.
2. **No hay scheduler en el stack** → `POST /api/internal/cleanup`, autenticado con `CLEANUP_SECRET` por cabecera, idempotente. El cron del host lo llama a diario. Documentado en el README de despliegue.
3. **E2E imposibles contra Slack real** → provider de acceso directo activado solo con `AUTH_DEV_BYPASS=1`. Ver «Seguridad del bypass».
4. **Borrado seguro de media contra JSONB** → tabla `media_asset_refs` mantenida en cada guardado de borrador y en cada publicación. Convierte «¿este activo está en uso?» en un `COUNT`, sin escanear JSONB. Necesaria además porque duplicar formularios comparte activos y el `created_by` deja de ser autoridad de borrado.
5. **Snapshots sin versión de esquema** → `FormDefinition` incluye `schemaVersion: number` desde el primer commit. Sin esto, el primer cambio de forma en `QuestionDefinition` rompe la lectura de versiones ya publicadas.
6. **Rate limiting sin IP y sin Redis** → la prohibición de almacenar IP aplica a la **respuesta**; para frenar abuso en endpoints públicos se usa IP hasheada con sal de proceso, en tabla con TTL corto, purgada por el mismo cron. Queda explícito para que no se lea como contradicción.
7. **«Progreso según recorrido efectivo» sin definir** → se define como: *número de preguntas alcanzables desde la actual dadas las respuestas ya introducidas*, recalculado en cada avance. Es una estimación y puede variar al responder; se documenta así.
8. **Sharp en Docker** → imagen base `node:22-bookworm-slim`, no Alpine (evita el binario `linuxmusl` de libvips). Se añade `limitInputPixels` y verificación de dimensiones **antes** de decodificar, contra decompression bombs.
9. **Evento de abandono requeriría otro job** → se deriva en consulta: sesión sin `completed_at` y con `last_activity_at` anterior a 30 minutos. Sin job adicional.
10. **MinIO no es R2** → el cliente S3 vive tras una interfaz (`lib/storage`), con `forcePathStyle` conmutable. Antes de cerrar la fase 6 se prueba el presign contra R2 real al menos una vez; MinIO valida el flujo, no la compatibilidad.

Añadido menor: el orden del spec deja el renderer implícito dentro del editor. Aquí se extrae a una fase propia **antes** del editor (fase 4) para que la previsualización y la experiencia pública sean literalmente el mismo componente y no puedan divergir.

---

## 3. Stack

- Next.js con App Router, runtime Node.js en todas las rutas (Drizzle con driver `pg` no funciona en Edge).
- TypeScript en modo estricto. Sin `any` en código de producción.
- Tailwind CSS + Radix/shadcn. `dnd-kit` para reordenar. Motion para transiciones.
- Zod como contrato único entre editor, API y experiencia pública.
- Zustand solo para estado efímero del editor. Nada de estado de servidor en Zustand.
- PostgreSQL + Drizzle ORM, migraciones versionadas en el repo.
- Auth.js como cliente OIDC de Slack, estrategia de sesión en base de datos.
- Docker multi-stage; `docker-compose` local con app + PostgreSQL + MinIO.

Las versiones exactas se fijan en el primer commit de la fase 0 (`package.json` con versiones ancladas, sin rangos `^`).

---

## 4. Fases

Cada fase es un PR sobre la anterior. «Hecho cuando» es la condición de merge.

### Fase 0 — Base

`git init` y remoto primero: el directorio actual no es un repositorio.

**Entregables**: esqueleto Next + TS estricto + Tailwind · Dockerfile multi-stage · `docker-compose` con app, PostgreSQL y MinIO · Drizzle configurado con la primera migración vacía · `GET /api/health` que comprueba app y base de datos sin exponer secretos · CI con lint, typecheck y build · `.env.example` completo.

**Hecho cuando**: `docker compose up` levanta los tres servicios, `/api/health` responde `ok` y CI pasa en verde.

### Fase 1 — Autenticación

**Entregables**: Auth.js con provider Slack OIDC (`openid`, `profile`, `email`) · adapter Drizzle con `users`, `auth_accounts`, `auth_sessions` · guard que compara el claim `https://slack.com/team_id` con `SLACK_TEAM_ID` y rechaza cualquier otro workspace · provider de bypass tras flag · middleware que protege todo `/app/**` · página de login y de acceso denegado.

Detalles verificados contra la documentación de Slack:

- Endpoints: `https://slack.com/openid/connect/authorize`, `https://slack.com/api/openid.connect.token`, `https://slack.com/api/openid.connect.userInfo`.
- Claims relevantes: `https://slack.com/team_id`, `https://slack.com/user_id`, `email`, `name`, `picture`.
- Slack exige **redirect URLs por HTTPS**; la propia documentación recomienda ngrok para pruebas locales. Como en desarrollo usamos el bypass, esto solo afecta a la puesta en producción.
- La app se crea dentro del workspace y **no se distribuye**: nadie externo llega siquiera a la pantalla de autorización.
- La validación de `team_id` se hace en el callback de `signIn` **y** se persiste en `users`, de modo que una sesión antigua de otro workspace tampoco pasaría.

**Hecho cuando**: un usuario del workspace entra; un usuario de otro workspace es rechazado con mensaje claro; la sesión sobrevive a un reinicio del contenedor.

#### Seguridad del bypass

El acceso sin credenciales es la única pieza de este plan que puede convertirse en un agujero. Tres protecciones, todas en esta fase:

1. El provider solo se registra si `AUTH_DEV_BYPASS=1`. La variable **no existe** en el compose ni en el entorno de producción.
2. Con el bypass activo, la interfaz muestra una franja permanente de aviso, y `/api/health` devuelve `authMode: "dev-bypass"` — comprobable desde fuera, sin entrar al servidor.
3. Un test de CI falla si el entorno de producción define esa variable.

### Fase 2 — Contratos y motor de lógica

Sin interfaz de usuario. Es la fase que más determina la calidad del resto.

**Entregables**: esquemas Zod `FormDefinition` (con `schemaVersion`), `QuestionDefinition` como unión discriminada por tipo, `ChoiceDefinition`, `LogicRule`, `ThemeDefinition` · motor de recorrido (dada una definición y un conjunto de respuestas, cuál es la siguiente pantalla) · validador de publicación: destinos inexistentes, saltos hacia atrás, preguntas inalcanzables, reglas contradictorias · normalización de rating (`(valor - 1) / (escala - 1)`, calculada al leer, no almacenada) · batería de tests unitarios exhaustiva.

**Hecho cuando**: el motor y el validador tienen cobertura de tests sobre todos los tipos de bloque y todos los operadores, incluidos los casos límite de saltos.

### Fase 3 — CRUD de formularios

**Entregables**: tablas `forms`, `form_drafts`, `form_versions` · `POST/GET/PATCH /api/forms` · `PUT /api/forms/:id/draft` con control de revisión optimista (devuelve `409` con la revisión del servidor si no coincide) · duplicar · cerrar y archivar · listado del panel con búsqueda, estado y contadores.

**Hecho cuando**: dos pestañas editando el mismo borrador producen un `409` limpio en la segunda, nunca una sobrescritura silenciosa.

### Fase 4 — Renderer compartido

**Entregables**: componente único dirigido por `FormDefinition` que pinta una pregunta por pantalla, con los once tipos de bloque, los cuatro estilos de selección, el rating configurable (estrellas, caras, corazones × 3/5/7/10), aplicación de tokens de tema, navegación por teclado y foco accesible.

**Hecho cuando**: el mismo componente, sin ramas `if (esPreview)`, renderiza tanto la previsualización del editor como la experiencia pública.

### Fase 5 — Editor

**Entregables**: layout de tres áreas · lista de preguntas con `dnd-kit` · panel de propiedades por tipo · panel de tema con validación de contraste WCAG y advertencias · interfaz de reglas de lógica con validación en vivo · autosave con debounce y estado visible (guardando / guardado / error / conflicto) · vistas de escritorio y móvil · ejecución de prueba que no persiste respuestas.

**Hecho cuando**: se construye un formulario completo con lógica y tema sin tocar JSON en ningún momento.

### Fase 6 — Pipeline de media

**Entregables**: `POST /api/media/upload-intent` → presign `PUT` sobre el bucket privado · carga directa desde el navegador · `POST /api/media/:id/complete` con verificación de bytes mágicos, tamaño y dimensiones · procesado con Sharp (elimina EXIF, genera WebP de 640 y 1920 px) · publicación en el bucket público con claves basadas en UUID + hash y caché inmutable · `DELETE /api/media/:id` respetando `media_asset_refs` · `POST /api/internal/cleanup` (staging > 24 h, huérfanos > 7 días, rate limits caducados) · componentes de subida en el editor para logo, portada, imagen de pregunta, de declaración y de opción.

**Hecho cuando**: una imagen recorre staging privado → validación → bucket público, y un activo referenciado por una versión publicada no se puede borrar.

### Fase 7 — Publicación y experiencia pública

**Entregables**: `POST /api/forms/:id/publish` que valida el documento completo, crea el snapshot inmutable y mueve `active_version_id` **en la misma transacción** · `/f/:slug` sirviendo siempre la versión activa, nunca el borrador · `response_sessions` y `answers` · creación de sesión con cookie `HttpOnly` · autosave al avanzar · reanudación en el mismo navegador · barra de progreso según alcanzables · pantalla final configurable · mensaje de formulario cerrado · rate limiting con IP hasheada.

**Hecho cuando**: publicar una segunda versión no altera ni un solo recorrido, etiqueta ni respuesta de la primera.

### Fase 8 — Resultados y cierre

**Entregables**: panel con sesiones iniciadas, completadas, abandonadas (derivado en consulta) y tasa de finalización · abandono por pregunta · distribuciones y promedios · tabla paginada · filtros por versión, estado y fechas · `GET /api/forms/:id/results.csv` generado en streaming, por versión, una columna por pregunta · suite E2E completa · accesibilidad automatizada sobre login, editor y recorrido público · datos de demostración · documentación de despliegue, creación de la app de Slack y configuración CORS de ambos buckets.

**Hecho cuando**: los nueve criterios de aceptación de `PR.md` se verifican de punta a punta.

---

## 5. Modelo de datos

Delta sobre lo descrito en `PR.md`; el resto se mantiene.

- **`media_asset_refs`** *(nueva)* — `asset_id`, `form_id`, `scope` (`draft` | `version`), `version_id` nullable. Única por combinación. Es lo que hace viable el borrado seguro.
- **`response_sessions`** — guarda `token_hash` (SHA-256), nunca el token. Sin columna de IP. Añade `last_activity_at` para derivar el abandono.
- **`answers`** — índice único `(session_id, question_id)` para permitir upsert idempotente al reeditar una respuesta.
- **`form_versions`** — única por `(form_id, version_number)`.
- **`rate_limits`** *(nueva)* — `key_hash`, `window_start`, `count`. Purgada por el cron.
- **`forms.active_version_id`** — clave foránea nullable a `form_versions`; un borrador nunca publicado la tiene a `null`.

---

## 6. Variables de entorno

```
DATABASE_URL
PUBLIC_BASE_URL
AUTH_SECRET
AUTH_URL

SLACK_CLIENT_ID          # solo producción
SLACK_CLIENT_SECRET      # solo producción
SLACK_TEAM_ID            # solo producción
AUTH_DEV_BYPASS          # solo desarrollo y CI — ausente en producción

R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_STAGING
R2_BUCKET_PUBLIC
MEDIA_PUBLIC_BASE_URL
S3_FORCE_PATH_STYLE      # 1 en local con MinIO

CLEANUP_SECRET
```

---

## 7. Orden crítico y riesgos

El camino crítico real es **2 → 4 → 5**. Los contratos Zod y el renderer compartido son los cimientos: si se hacen bien, el editor y la experiencia pública son trabajo mecánico. Si se dejan para el final, la lógica de render se duplica y las dos vistas divergen — es el fallo más caro y más frecuente en este tipo de producto.

Riesgos vivos, por orden de probabilidad:

1. **Alcance de la fase 5.** El editor visual es, por sí solo, la mitad del esfuerzo del proyecto. Si algo se desborda, será aquí.
2. **Primer contacto con R2 real.** MinIO no garantiza compatibilidad de presign ni de CORS. Probar pronto, no en la fase 6.
3. **El bypass de autenticación.** Mitigado por triple protección, pero es la única puerta que no debe abrirse nunca en producción.
4. **`schemaVersion` olvidado.** Barato ahora, migración de datos si se olvida.
