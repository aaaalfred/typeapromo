# Capa de datos

PostgreSQL + Drizzle ORM. El esquema vive en `src/db/schema/`, dividido por dominio,
con `schema/index.ts` como único punto de reexportación (es a lo que apunta
`drizzle.config.ts`). Las migraciones versionadas están en `drizzle/`.

```
src/db/
  client.ts          pool `pg` + instancia de drizzle (runtime Node.js, nunca Edge)
  index.ts           `import { db } from "@/db"`
  schema/
    enums.ts         tipos enumerados de PostgreSQL
    auth.ts          users · auth_accounts · auth_sessions
    forms.ts         forms · form_drafts · form_versions
    media.ts         media_assets · media_asset_refs
    responses.ts     response_sessions · answers · form_events
    rate-limits.ts   rate_limits
    relations.ts     relaciones para `db.query.*`
    index.ts         reexporta todo
```

## Comandos

```bash
npm run db:generate   # genera SQL en drizzle/ a partir del esquema
npm run db:migrate    # aplica migraciones pendientes (drizzle-kit, desarrollo)
npm run db:deploy     # ídem con scripts/migrate.mjs (despliegue y CI)
```

Los dos últimos hacen lo mismo, pero `db:deploy` usa el migrador de `drizzle-orm`
en lugar de drizzle-kit, que es `devDependency` y no viaja en la imagen de
producción. Es el que ejecuta el servicio `migrate` del compose antes de que
arranque la aplicación, y el que verifica CI.

Nunca se edita una migración ya aplicada: se genera una nueva.

## Decisiones que conviene conocer antes de tocar nada

**El JSONB no está tipado a propósito.** `form_drafts.definition`, `form_versions.definition`,
`answers.value_json` y `form_events.metadata` son `unknown`. El contrato es Zod
(`FormDefinition`) y debe aplicarse en el borde: tipar la columna daría una falsa
seguridad sobre filas escritas por versiones anteriores del esquema. Para eso está
`form_versions.schema_version`, copia desnormalizada de `definition.schemaVersion`.

**Privacidad.** `response_sessions` no tiene columna de IP y no la tendrá; guarda
únicamente `token_hash` (SHA-256 del token de reanudación, que viaja sólo en una
cookie `HttpOnly`). El control de abuso vive aislado en `rate_limits`, con la IP
hasheada con una sal de proceso que no se persiste y filas efímeras purgadas por
`POST /api/internal/cleanup`. Las dos tablas no se relacionan, y ese aislamiento
es el requisito, no un descuido.

**El abandono no se almacena, se deriva:**

```sql
SELECT * FROM response_sessions
WHERE completed_at IS NULL
  AND last_activity_at < now() - interval '30 minutes';
```

**Concurrencia optimista del borrador.** `form_drafts.revision` se incrementa en cada
guardado; el `UPDATE` filtra por la revisión que envió el cliente y, si no afecta a
ninguna fila, la ruta devuelve `409` con la revisión del servidor.

```sql
UPDATE form_drafts
   SET definition = $1, revision = revision + 1, updated_at = now(), updated_by = $2
 WHERE form_id = $3 AND revision = $4
RETURNING revision;
```

**Upsert idempotente de respuestas.** Índice único `(session_id, question_id)`:

```sql
INSERT INTO answers (...) VALUES (...)
ON CONFLICT (session_id, question_id)
DO UPDATE SET value_json = excluded.value_json, updated_at = now();
```

**Borrado seguro de media.** `media_asset_refs` mantiene una fila por
(activo, formulario, ámbito). Hay que escribirla en **cada guardado de borrador**
(reconciliando: borrar las de `scope='draft'` de ese formulario e insertar las
actuales) y en **cada publicación** (insertando las de `scope='version'` con el
`version_id` del snapshot). Sin ese mantenimiento, la tabla miente y el borrado
deja de ser seguro. Un activo es borrable cuando:

```sql
SELECT count(*) FROM media_asset_refs WHERE asset_id = $1;  -- 0 ⇒ borrable
```

La unicidad se implementa con dos índices parciales, no con un `UNIQUE` de cuatro
columnas, porque PostgreSQL considera distintos entre sí los `NULL`. Un `CHECK`
garantiza la invariante `scope='version' ⇔ version_id IS NOT NULL`.

**Referencia circular.** `forms.active_version_id → form_versions.id` y
`form_versions.form_id → forms.id`. drizzle-kit las emite como `ALTER TABLE` tras
crear ambas tablas, así que no hay problema de orden. Al publicar, crear el
snapshot y mover `active_version_id` van en la misma transacción.

**Compatibilidad con Auth.js.** `users`, `auth_accounts` y `auth_sessions` respetan
los nombres de propiedad que espera el adapter de Drizzle (`emailVerified`,
`refresh_token`, `sessionToken`, …). Al configurar el adapter hay que mapear las
tablas por nombre:

```ts
DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: authAccounts,
  sessionsTable: authSessions,
});
```

No existe `verification_tokens` porque no hay provider de email; si alguna vez se
añade uno, esa tabla es un requisito del adapter.
