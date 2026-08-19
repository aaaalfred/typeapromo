# Migraciones de base de datos

El esquema vive en `src/db/schema/` (Drizzle) y las migraciones SQL generadas, en `drizzle/`.
Ambos se versionan en el repositorio: **el esquema TypeScript no es la fuente de verdad de la base
de datos, el SQL de `drizzle/` sí lo es.**

## Los dos migradores, y por qué hay dos

| Comando | Herramienta | Dónde se usa |
|---------|-------------|--------------|
| `npm run db:generate` | `drizzle-kit generate` | Desarrollo: escribe el SQL a partir del esquema |
| `npm run db:migrate` | `drizzle-kit migrate` | Desarrollo: aplica lo pendiente |
| `npm run db:deploy` | `node scripts/migrate.mjs` | **Despliegue**: aplica lo pendiente |

`drizzle-kit` es una `devDependency` y la imagen de producción es la salida `standalone` de Next:
ahí no está instalado, así que el contenedor no podría migrarse a sí mismo. `scripts/migrate.mjs`
usa el migrador de `drizzle-orm`, que sí viaja en la imagen.

Usa siempre `db:deploy` en cualquier entorno que no sea tu máquina: es exactamente lo que ejecuta
el job `migrate` del compose y lo que verifica CI.

## Cambiar el esquema

```bash
# 1. Edita src/db/schema/*.ts
npm run db:generate      # escribe drizzle/NNNN_<nombre>.sql y actualiza drizzle/meta
# 2. Revisa el SQL generado. Siempre. drizzle-kit acierta casi siempre, no siempre.
npm run db:deploy        # aplícalo en tu base local
# 3. Commitea el esquema y la migración juntos.
```

CI tiene un paso que falla si `src/db/schema` y `drizzle/` divergen: genera de nuevo y compara.
Es la red que atrapa el olvido clásico de tocar el esquema y no generar la migración.

## Aplicar en despliegue

```bash
DATABASE_URL=postgresql://usuario:clave@host:5432/basedatos node scripts/migrate.mjs
```

Tres propiedades que hacen que esto sea seguro de automatizar:

1. **Transaccional.** Cada migración se aplica dentro de su propia transacción; si falla a mitad,
   no queda medio aplicada.
2. **Idempotente.** El registro vive en `drizzle.__drizzle_migrations`. Volver a ejecutarlo no
   aplica nada dos veces, así que el paso puede repetirse sin pensarlo.
3. **Separado del arranque.** El contenedor de la aplicación **no** migra al arrancar. Con varias
   réplicas, hacerlo provocaría migraciones concurrentes; y una migración que falla debe parar el
   despliegue, no dejar réplicas subiendo y cayendo en bucle.

En `docker-compose.yml` esto se implementa con un servicio `migrate` de un solo uso del que `app`
depende con `condition: service_completed_successfully`. En cualquier otro orquestador, el
equivalente es un *job* o *init container* previo al despliegue.

## Orden recomendado en un despliegue

1. Construir la imagen nueva.
2. Ejecutar `node scripts/migrate.mjs` con la imagen nueva, contra la base de producción.
3. Solo si el paso 2 sale con código 0, sustituir las réplicas de la aplicación.

Esto obliga a que **toda migración sea compatible hacia atrás** con la versión que todavía está
sirviendo: añadir columnas nullable, no renombrar en un solo paso, y borrar en un despliegue
posterior. La alternativa es una ventana de mantenimiento.

## Estado actual

`drizzle/0000_initial_schema.sql` crea las doce tablas del modelo: `users`, `auth_accounts`,
`auth_sessions`, `forms`, `form_drafts`, `form_versions`, `media_assets`, `media_asset_refs`,
`response_sessions`, `answers`, `form_events` y `rate_limits`.
