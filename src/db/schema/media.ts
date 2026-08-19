import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { mediaAssetStatusEnum, mediaRefScopeEnum } from "./enums";
import { users } from "./auth";
import { forms, formVersions } from "./forms";

/** Variante derivada por Sharp y publicada en el bucket público. */
export type MediaVariant = {
  /** Etiqueta de la variante, p. ej. `w640` o `w1920`. */
  label: string;
  /** Clave del objeto dentro del bucket público. */
  key: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
};

/**
 * Activo de imagen. Recorre `uploading` (bucket privado de staging) →
 * `ready` (variantes WebP en el bucket público) o `failed`.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Quien subió el activo. No es autoridad de borrado: lo son las referencias. */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),

    status: mediaAssetStatusEnum("status").notNull().default("uploading"),

    /** Bucket donde vive el activo ahora mismo (staging o público). */
    bucket: text("bucket").notNull(),
    /** Clave temporal en el bucket privado. Se limpia al promocionar. */
    stagingKey: text("staging_key"),
    /** Clave inmutable del original procesado en el bucket público. */
    publicKey: text("public_key"),

    /** Variantes publicadas (WebP 640 y 1920 px). */
    variants: jsonb("variants").$type<MediaVariant[]>().notNull().default(sql`'[]'::jsonb`),

    mimeType: text("mime_type").notNull(),
    /** Tamaño en bytes del original. Máximo de producto: 8 MB. */
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),

    /** SHA-256 en hexadecimal del original; se conoce tras `complete`. */
    sha256: text("sha256"),

    originalFilename: text("original_filename"),
    /** Motivo del fallo cuando `status = 'failed'`. */
    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    /** Cargas incompletas de staging con más de 24 h (cron de limpieza). */
    index("media_assets_status_created_at_idx").on(table.status, table.createdAt),
    index("media_assets_sha256_idx").on(table.sha256),
    index("media_assets_created_by_idx").on(table.createdBy),
  ],
);

/**
 * Referencias explícitas de un activo a un formulario (PLAN.md · §2.4).
 *
 * Se mantiene en cada guardado de borrador y en cada publicación. Convierte
 * «¿este activo sigue en uso?» en un `COUNT`, sin escanear JSONB, y hace viable
 * el borrado seguro cuando duplicar un formulario comparte activos.
 *
 * Invariante: `scope = 'version'` ⇒ `version_id` no nulo; `scope = 'draft'` ⇒
 * `version_id` nulo. Como PostgreSQL considera los `NULL` distintos entre sí en
 * un `UNIQUE`, la unicidad se implementa con dos índices parciales en lugar de
 * una única restricción sobre las cuatro columnas.
 */
export const mediaAssetRefs = pgTable(
  "media_asset_refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),

    scope: mediaRefScopeEnum("scope").notNull(),

    /** Snapshot que referencia el activo. Nulo cuando `scope = 'draft'`. */
    versionId: uuid("version_id").references(() => formVersions.id, {
      onDelete: "cascade",
    }),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("media_asset_refs_draft_unique")
      .on(table.assetId, table.formId)
      .where(sql`${table.scope} = 'draft'`),
    uniqueIndex("media_asset_refs_version_unique")
      .on(table.assetId, table.formId, table.versionId)
      .where(sql`${table.scope} = 'version'`),
    index("media_asset_refs_asset_id_idx").on(table.assetId),
    index("media_asset_refs_form_id_idx").on(table.formId),
    index("media_asset_refs_version_id_idx").on(table.versionId),
    check(
      "media_asset_refs_scope_version_ck",
      sql`(${table.scope} = 'version' AND ${table.versionId} IS NOT NULL)
       OR (${table.scope} = 'draft' AND ${table.versionId} IS NULL)`,
    ),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
export type MediaAssetStatus = (typeof mediaAssetStatusEnum.enumValues)[number];
export type MediaAssetRef = typeof mediaAssetRefs.$inferSelect;
export type NewMediaAssetRef = typeof mediaAssetRefs.$inferInsert;
export type MediaRefScope = (typeof mediaRefScopeEnum.enumValues)[number];
