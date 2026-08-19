import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Tipo de cuenta OAuth tal y como lo define Auth.js (`AdapterAccountType`).
 *
 * Se declara aquí en local, estructuralmente idéntico, para que el esquema de
 * base de datos no dependa de los tipos de `next-auth` en tiempo de compilación.
 */
export type AuthAccountType = "oauth" | "oidc" | "email" | "webauthn";

/**
 * Identidad del equipo. Compatible con el adapter de Drizzle para Auth.js:
 * las propiedades `id`, `name`, `email`, `emailVerified` e `image` son las que
 * el adapter espera encontrar; el resto son campos propios del producto.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
    image: text("image"),

    /** `https://slack.com/user_id` del claim OIDC. */
    slackUserId: text("slack_user_id").unique(),
    /** `https://slack.com/team_id`; se persiste para que una sesión antigua de
     * otro workspace tampoco pase el guard (PLAN.md · fase 1). */
    slackTeamId: text("slack_team_id"),

    /** Estado de acceso: permite revocar sin borrar la identidad ni sus formularios. */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("users_slack_team_id_idx").on(table.slackTeamId)],
);

/**
 * Cuentas OAuth/OIDC. Estructura exigida por el adapter de Drizzle para Auth.js
 * (nombres de propiedad incluidos: `refresh_token`, `access_token`, …).
 */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AuthAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({
      name: "auth_accounts_provider_provider_account_id_pk",
      columns: [table.provider, table.providerAccountId],
    }),
    index("auth_accounts_user_id_idx").on(table.userId),
  ],
);

/**
 * Sesiones administrativas persistidas en PostgreSQL (estrategia `database`),
 * para que sobrevivan al reinicio del contenedor.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("auth_sessions_user_id_idx").on(table.userId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthAccount = typeof authAccounts.$inferSelect;
export type NewAuthAccount = typeof authAccounts.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
