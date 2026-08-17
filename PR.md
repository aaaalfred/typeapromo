# PR: MVP de formularios conversacionales con Slack, PostgreSQL y Cloudflare R2

## Resumen

Construir una aplicación nueva con Next.js, TypeScript y PostgreSQL para que un único equipo interno cree, publique y analice formularios conversacionales. El acceso administrativo será exclusivamente mediante Slack; quienes respondan usarán enlaces públicos sin registrarse.

El PR entregará el producto vertical completo: autenticación, editor dinámico, temas visuales, imágenes almacenadas en R2, lógica condicional, publicación versionada, experiencia de respuesta, resultados y exportación CSV.

## Producto y experiencia

### Panel del equipo

- Inicio con listado de formularios, búsqueda, estado, respuestas, fecha de edición y acciones para editar, duplicar, publicar, cerrar o archivar.
- Todos los usuarios del workspace de Slack autorizado pueden crear, editar, publicar y consultar cualquier formulario.
- Estados: `draft`, `published`, `closed` y `archived`.
- Duplicar crea un formulario nuevo con su propio borrador y referencias a los mismos activos visuales.

### Editor de formularios

Interfaz de tres áreas:

- Izquierda: preguntas, orden mediante arrastrar y soltar y botón para añadir bloques.
- Centro: previsualización conversacional idéntica a la experiencia pública.
- Derecha: contenido, validación, apariencia, media y lógica de la pregunta seleccionada.
- Guardado automático con debounce y estado visible: guardando, guardado o error.
- Control de revisión para impedir que dos pestañas sobrescriban silenciosamente el mismo borrador.
- Vista previa de escritorio y móvil, además de ejecución completa de prueba sin guardar respuestas reales.

### Bloques soportados

- Texto corto.
- Texto largo.
- Email.
- Fecha.
- Selección única.
- Selección múltiple.
- Escala numérica.
- Valoración visual.
- Declaración informativa.
- Pantalla de bienvenida.
- Pantalla final.

`Rating` será un único tipo configurable:

- Apariencia: estrellas, caras o corazones.
- Escala: 3, 5, 7 o 10 valores.
- Etiquetas opcionales para extremos.
- Almacenamiento del valor entero seleccionado y cálculo normalizado para comparaciones entre escalas.
- Analítica con promedio, distribución y total de respuestas.

Las preguntas de selección podrán mostrarse como:

- Lista textual.
- Botones.
- Tarjetas con imagen.
- Cuadrícula visual.

### Media y personalización

Las imágenes podrán utilizarse como:

- Logo del formulario.
- Portada o fondo.
- Imagen asociada a una pregunta.
- Imagen de una declaración.
- Imagen de cada opción de respuesta.

Tema configurable por formulario:

- Colores de fondo, texto, controles, botones y acento.
- Tipografía de un catálogo local.
- Radio de bordes y estilo de botones.
- Alineación del contenido.
- Logo e imagen de fondo.
- Contraste validado en el editor con advertencias de accesibilidad.

El MVP permitirá carga, reemplazo y eliminación directa; no incluirá recorte manual, filtros, biblioteca multimedia ni búsqueda en servicios externos.

### Lógica dinámica

- Flujo secuencial por defecto.
- Reglas basadas en selección, valor de rating, escala, fecha, email o presencia de texto.
- Operadores según tipo: igual, distinto, contiene, seleccionado, mayor que y menor que.
- Destino de regla: otra pregunta posterior o una pantalla final.
- Prioridad explícita cuando existan varias reglas.
- Solo se permitirán saltos hacia adelante para evitar ciclos.
- El editor validará destinos inexistentes, reglas contradictorias y preguntas inalcanzables antes de publicar.

### Experiencia de respuesta

- Una pregunta por pantalla con transiciones suaves.
- Diseño responsivo con prioridad móvil.
- Navegación por teclado, estados de foco y etiquetas accesibles.
- Barra de progreso basada en el recorrido efectivo, no únicamente en el total de preguntas.
- Validación inmediata sin perder la respuesta introducida.
- Autosave al avanzar.
- Reanudación en el mismo navegador mediante un token anónimo y firmado.
- Pantalla final configurable.
- No se almacenará la dirección IP como parte de la respuesta.

## Arquitectura e implementación

### Base técnica

- Next.js con App Router y runtime Node.js.
- TypeScript estricto.
- Tailwind CSS, componentes accesibles basados en Radix/shadcn, `dnd-kit` para ordenar y Motion para las transiciones.
- Zod como contrato compartido entre editor, API y experiencia pública.
- Zustand para el estado temporal del editor.
- PostgreSQL con Drizzle ORM y migraciones versionadas.
- Auth.js configurado como cliente OpenID Connect de Slack.
- Imagen Docker multi-stage y `docker-compose` local con aplicación, PostgreSQL y MinIO como sustituto S3-compatible de R2.
- Endpoint de salud que compruebe aplicación y PostgreSQL sin exponer secretos.

### Autenticación Slack

- Usar el flujo moderno OpenID Connect con scopes `openid`, `profile` y `email`.
- Validar que el `team_id` de Slack coincida con `SLACK_TEAM_ID`.
- Rechazar el acceso de otros workspaces aunque la autenticación sea correcta.
- Guardar identificador Slack, workspace, nombre, email y avatar.
- Sesiones persistentes en PostgreSQL.
- No solicitar permisos de canales, mensajes, bots ni webhooks. [Flujo oficial de Sign in with Slack](https://api.slack.com/authentication/sign-in-with-slack)

### Modelo de datos

- `users`: identidad de Slack y estado de acceso.
- `auth_accounts` y `auth_sessions`: OAuth y sesiones.
- `forms`: identidad estable, slug público, propietario inicial, estado y versión activa.
- `form_drafts`: definición JSONB editable, revisión y fecha de guardado.
- `form_versions`: snapshot JSONB inmutable, número de versión y fecha de publicación.
- `media_assets`: propietario, bucket, claves, variantes, tipo, tamaño, hash y estado.
- `response_sessions`: formulario, versión, token anónimo, estado, progreso y timestamps.
- `answers`: respuesta por pregunta con `value_json`, tipo y versión.
- `form_events`: inicio, avance, abandono y finalización para métricas.

La definición JSONB se validará con una estructura compartida:

- `FormDefinition`: metadatos, tema, bloques, reglas y pantallas finales.
- `QuestionDefinition`: ID estable, tipo, contenido, configuración, validaciones y media.
- `ChoiceDefinition`: ID estable, etiqueta, valor e imagen opcional.
- `LogicRule`: pregunta origen, operador, valor, prioridad y destino.
- `ThemeDefinition`: tokens visuales y referencias a activos.

Las respuestas serán relacionales para permitir analítica y CSV sin reinterpretar borradores actuales.

### Publicación y versionado

- El creador siempre edita `form_drafts`.
- Publicar valida el documento completo y crea un snapshot inmutable en `form_versions`.
- `forms.active_version_id` cambia de forma atómica dentro de la misma transacción.
- Cada sesión de respuesta queda ligada a una versión concreta.
- Una nueva publicación no cambia recorridos, etiquetas ni resultados históricos.
- Cerrar un formulario conserva resultados y muestra un mensaje configurable.
- Un activo usado por una versión publicada no puede eliminarse físicamente mientras esa versión exista.

### Cloudflare R2

Usar dos buckets:

- `forms-media-staging`: privado, para cargas temporales.
- `forms-media-public`: conectado a `MEDIA_PUBLIC_BASE_URL`, para activos procesados y publicados.

Flujo de carga:

1. Un creador autenticado solicita `POST /api/media/upload-intent`.
2. La API valida formulario, MIME y tamaño; crea `media_assets` en estado `uploading`.
3. Devuelve una URL `PUT` temporal para el endpoint S3 de R2.
4. El navegador carga directamente al bucket privado.
5. El cliente llama `POST /api/media/:id/complete`.
6. El servidor verifica el objeto, firma real del archivo, tamaño y dimensiones.
7. Procesa con Sharp, elimina EXIF y genera WebP de 640 px y 1920 px.
8. Guarda las variantes con claves inmutables basadas en UUID y hash en el bucket público.
9. Elimina el objeto de staging y marca el activo `ready`.

Reglas:

- Formatos de entrada: JPEG, PNG y WebP.
- Tamaño máximo: 8 MB.
- SVG y GIF quedan excluidos por seguridad, rendimiento y accesibilidad.
- Las credenciales R2 solo estarán disponibles en el servidor.
- CORS de staging permitirá `PUT` y `HEAD` únicamente desde los orígenes configurados.
- Las URLs temporales usarán el dominio S3 de R2; el dominio personalizado se utilizará solo para lectura pública.
- Los objetos públicos tendrán nombres impredecibles y caché inmutable.
- Un trabajo programado eliminará cargas incompletas de staging después de 24 horas.
- Los activos públicos sin referencias podrán eliminarse después de un periodo de gracia de siete días.

Esta separación sigue el comportamiento documentado de R2: las URLs prefirmadas funcionan sobre el endpoint S3, mientras que el dominio personalizado sirve el contenido público y permite cachearlo. [URLs prefirmadas](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) · [Buckets públicos](https://developers.cloudflare.com/r2/buckets/public-buckets/) · [CORS](https://developers.cloudflare.com/r2/buckets/cors/)

### Interfaces HTTP

Administración autenticada:

- `POST /api/forms`
- `GET /api/forms`
- `GET /api/forms/:id`
- `PATCH /api/forms/:id`
- `PUT /api/forms/:id/draft`
- `POST /api/forms/:id/publish`
- `POST /api/forms/:id/duplicate`
- `POST /api/forms/:id/close`
- `GET /api/forms/:id/results`
- `GET /api/forms/:id/results.csv`
- `POST /api/media/upload-intent`
- `POST /api/media/:id/complete`
- `DELETE /api/media/:id`

Experiencia pública:

- `GET /f/:slug`
- `POST /api/public/forms/:slug/sessions`
- `PUT /api/public/sessions/:token/answers/:questionId`
- `POST /api/public/sessions/:token/complete`

Todas las mutaciones validarán sesión, pertenencia al workspace, revisión del borrador y esquema Zod. Las rutas públicas validarán siempre contra la versión publicada, nunca contra el borrador.

### Resultados

- Resumen de sesiones iniciadas, completadas, abandonadas y tasa de finalización.
- Abandono por pregunta.
- Distribución para selección, escala y rating.
- Promedio para escala y rating.
- Tabla paginada de respuestas individuales.
- Filtro por versión, estado y rango de fechas.
- CSV generado por versión, con una columna por pregunta y metadatos mínimos de sesión.
- Respuestas textuales visibles completas, sin análisis de sentimiento ni IA.

## Estructura del PR

1. Base Next.js, Docker, PostgreSQL, migraciones y configuración.
2. Slack OIDC, sesiones y restricción de workspace.
3. Modelo de formularios, contratos Zod y CRUD.
4. Editor visual, temas, bloques, autosave y lógica condicional.
5. Pipeline de R2, procesamiento de imágenes y componentes visuales.
6. Publicación versionada y experiencia pública.
7. Resultados, métricas y CSV.
8. Pruebas, accesibilidad, documentación y guía de despliegue.

El PR incluirá `.env.example`, migraciones, datos de demostración, configuración local, documentación para crear la aplicación Slack y pasos para preparar ambos buckets R2 y su política CORS.

## Pruebas y aceptación

### Pruebas automatizadas

- Unitarias: contratos, validación por tipo, motor de saltos, detección de ciclos, rating normalizado, publicación y CSV.
- Integración: Slack permitido/rechazado, autosave con revisión, snapshot inmutable, pipeline de media, respuestas por versión y eliminación segura.
- End-to-end:
  - iniciar sesión;
  - crear y tematizar formulario;
  - subir imagen;
  - crear opciones visuales;
  - configurar estrellas/caras;
  - añadir una bifurcación;
  - publicar;
  - responder cada recorrido;
  - reanudar sesión;
  - publicar una segunda versión;
  - verificar resultados históricos;
  - descargar CSV.
- Accesibilidad automatizada sobre login, editor y recorrido público.
- Prueba responsiva en móvil y escritorio.
- CI con lint, typecheck, unitarias, integración, build Docker y end-to-end.

### Criterios de aceptación

- Un usuario del workspace configurado puede entrar con Slack; cualquier otro workspace es rechazado.
- Un creador puede construir un formulario visual completo sin editar JSON.
- Las imágenes pasan por staging privado y solo se muestran desde el bucket público después de validarse.
- Estrellas, caras y corazones funcionan visualmente, se navegan con teclado y producen valores analizables.
- La lógica condicional ejecuta el recorrido correcto y no permite ciclos.
- El formulario publicado funciona sin login y puede reanudarse en el mismo navegador.
- Publicar una nueva versión no modifica respuestas anteriores.
- El tablero y CSV coinciden con las respuestas almacenadas.
- La aplicación inicia mediante contenedor y aplica migraciones de forma controlada.

## Supuestos y exclusiones

- Un solo workspace de Slack equivale a un solo equipo.
- Todos los miembros autenticados tienen los mismos permisos.
- El idioma inicial será español.
- La aplicación se desplegará en infraestructura propia mediante contenedor.
- PostgreSQL será el único almacén relacional y R2 el único almacenamiento persistente de archivos.
- No incluye integraciones de CRM, correo, calendarios, pagos, webhooks, IA ni servicios de imágenes.
- No incluye archivos enviados por participantes, audio, video, firma, CSS personalizado, roles granulares ni colaboración en tiempo real.
