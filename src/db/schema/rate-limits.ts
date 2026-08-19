import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Contador de ventana fija para frenar abuso en endpoints públicos
 * (PLAN.md · §2.6).
 *
 * Privacidad: la IP **nunca** se almacena en claro ni queda asociada a una
 * respuesta. `key_hash` es el SHA-256 de `ámbito + IP + sal de proceso`, la sal
 * no se persiste y las filas son efímeras: el cron de `/api/internal/cleanup`
 * purga las ventanas caducadas. Esta tabla no tiene ninguna relación con
 * `response_sessions` ni con `answers`, y ese aislamiento es intencionado.
 *
 * La clave primaria compuesta `(key_hash, window_start)` permite el incremento
 * atómico con `INSERT … ON CONFLICT DO UPDATE SET count = count + 1`.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    /** SHA-256 hexadecimal de ámbito + IP + sal de proceso. */
    keyHash: text("key_hash").notNull(),
    /** Inicio de la ventana, truncado al tamaño de ventana configurado. */
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    /** Peticiones contabilizadas en la ventana. */
    count: integer("count").notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "rate_limits_key_hash_window_start_pk",
      columns: [table.keyHash, table.windowStart],
    }),
    /** Purga de ventanas caducadas. */
    index("rate_limits_window_start_idx").on(table.windowStart),
  ],
);

export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;

export const _drift = 1;
