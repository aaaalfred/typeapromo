import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { formStatusEnum } from "./enums";
import { users } from "./auth";

/**
 * Identidad estable de un formulario. El contenido vive en `form_drafts`
 * (editable) y en `form_versions` (snapshots inmutables).
 *
 * Nota sobre `definition`: las columnas JSONB se declaran como `unknown`
 * a propósito. El contrato es Zod (`FormDefinition`), y debe aplicarse en el
 * borde de la aplicación al leer y al escribir; tipar la columna aquí daría una
 * falsa sensación de seguridad sobre filas escritas por versiones anteriores.
 */
export const forms = pgTable(
  "forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Slug público servido en `/f/:slug`. */
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    status: formStatusEnum("status").notNull().default("draft"),

    /** Propietario inicial. No otorga permisos: todo el workspace puede editar. */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),

    /**
     * Versión servida en público. `null` mientras el formulario nunca se ha
     * publicado. Se mueve dentro de la misma transacción que crea el snapshot.
     *
     * Referencia circular con `form_versions.form_id`: drizzle-kit emite ambas
     * claves foráneas como `ALTER TABLE … ADD CONSTRAINT` tras crear las tablas.
     */
    activeVersionId: uuid("active_version_id").references(
      (): AnyPgColumn => formVersions.id,
      { onDelete: "set null" },
    ),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("forms_status_idx").on(table.status),
    index("forms_created_by_idx").on(table.createdBy),
    index("forms_updated_at_idx").on(table.updatedAt),
  ],
);

/**
 * Borrador vivo: exactamente uno por formulario.
 *
 * `revision` implementa el control de concurrencia optimista de
 * `PUT /api/forms/:id/draft`: el cliente envía la revisión que leyó, el
 * servidor sólo escribe si coincide y devuelve `409` con la suya si no.
 */
export const formDrafts = pgTable(
  "form_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .unique()
      .references(() => forms.id, { onDelete: "cascade" }),

    /** `FormDefinition` serializado. Validar siempre con Zod al leer/escribir. */
    definition: jsonb("definition").notNull(),

    /** Se incrementa en cada guardado. Nunca decrece. */
    revision: integer("revision").notNull().default(1),

    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    /** Fecha de guardado del borrador. */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("form_drafts_updated_at_idx").on(table.updatedAt)],
);

/**
 * Snapshot inmutable publicado. Nunca se actualiza: publicar crea una fila nueva
 * con el siguiente `version_number` y mueve `forms.active_version_id`.
 */
export const formVersions = pgTable(
  "form_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),

    /** Correlativo por formulario, empezando en 1. */
    versionNumber: integer("version_number").notNull(),

    /** Snapshot de `FormDefinition`. Inmutable. */
    definition: jsonb("definition").notNull(),

    /**
     * Copia desnormalizada de `definition.schemaVersion` (PLAN.md · §2.5).
     * Permite localizar snapshots antiguos sin abrir el JSONB cuando cambie la
     * forma de `QuestionDefinition`.
     */
    schemaVersion: integer("schema_version").notNull().default(1),

    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("form_versions_form_id_version_number_unique").on(
      table.formId,
      table.versionNumber,
    ),
    index("form_versions_form_id_idx").on(table.formId),
  ],
);

export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;
export type FormStatus = (typeof formStatusEnum.enumValues)[number];
export type FormDraft = typeof formDrafts.$inferSelect;
export type NewFormDraft = typeof formDrafts.$inferInsert;
export type FormVersion = typeof formVersions.$inferSelect;
export type NewFormVersion = typeof formVersions.$inferInsert;
