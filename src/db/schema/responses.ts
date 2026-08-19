import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { formEventTypeEnum, responseSessionStatusEnum } from "./enums";
import { forms, formVersions } from "./forms";

/**
 * Sesión anónima de respuesta, ligada siempre a una versión concreta.
 *
 * Privacidad (PR.md · «Experiencia de respuesta» y PLAN.md · §2.1):
 * - **No hay columna de IP.** Es un requisito explícito de producto: la
 *   dirección IP no se almacena como parte de la respuesta. El control de abuso
 *   vive en `rate_limits`, con la IP hasheada y efímera, sin relación con esta tabla.
 * - Se guarda únicamente el **SHA-256 del token** de reanudación. El valor en
 *   claro viaja sólo en una cookie `HttpOnly`, nunca en la URL ni en la base de datos.
 */
export const responseSessions = pgTable(
  "response_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => formVersions.id, { onDelete: "cascade" }),

    /** SHA-256 hexadecimal del token de sesión. Nunca el token en claro. */
    tokenHash: text("token_hash").notNull().unique(),

    status: responseSessionStatusEnum("status").notNull().default("in_progress"),

    /** ID estable (dentro de `FormDefinition`) de la pantalla actual. */
    currentQuestionId: text("current_question_id"),
    /** Número de preguntas respondidas; alimenta la barra de progreso. */
    answeredCount: integer("answered_count").notNull().default(0),

    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    /**
     * Última interacción. El abandono se deriva de aquí en consulta
     * (sin `completed_at` y con más de 30 minutos de inactividad).
     */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("response_sessions_form_id_started_at_idx").on(table.formId, table.startedAt),
    index("response_sessions_version_id_idx").on(table.versionId),
    index("response_sessions_status_last_activity_at_idx").on(
      table.status,
      table.lastActivityAt,
    ),
  ],
);

/**
 * Respuesta a una pregunta. Relacional (no dentro del JSONB de la sesión) para
 * poder analizar y exportar sin reinterpretar el borrador actual.
 *
 * El índice único `(session_id, question_id)` permite el upsert idempotente:
 * reeditar una respuesta al retroceder actualiza la fila, nunca duplica.
 */
export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    sessionId: uuid("session_id")
      .notNull()
      .references(() => responseSessions.id, { onDelete: "cascade" }),
    /** Desnormalizado desde la sesión: evita un join en resultados y CSV. */
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => formVersions.id, { onDelete: "cascade" }),

    /** ID estable de la pregunta dentro de `FormDefinition`. */
    questionId: text("question_id").notNull(),
    /** Tipo de bloque en el momento de responder (`short_text`, `rating`, …). */
    questionType: text("question_type").notNull(),

    /**
     * Valor tal cual, según el tipo. El rating guarda el entero seleccionado;
     * la normalización `(valor - 1) / (escala - 1)` se calcula al leer.
     */
    valueJson: jsonb("value_json").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("answers_session_id_question_id_unique").on(
      table.sessionId,
      table.questionId,
    ),
    index("answers_version_id_question_id_idx").on(table.versionId, table.questionId),
    index("answers_form_id_idx").on(table.formId),
  ],
);

/**
 * Traza de recorrido para métricas: inicio, avance, abandono y finalización.
 * `abandoned` sólo se registra si alguna vez se materializa; el panel lo deriva
 * en consulta sobre `response_sessions.last_activity_at`.
 */
export const formEvents = pgTable(
  "form_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => formVersions.id, {
      onDelete: "cascade",
    }),
    sessionId: uuid("session_id").references(() => responseSessions.id, {
      onDelete: "cascade",
    }),

    type: formEventTypeEnum("type").notNull(),
    /** Pregunta implicada en el evento, cuando aplica (abandono por pregunta). */
    questionId: text("question_id"),
    /** Contexto adicional, sin datos personales. */
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("form_events_form_id_created_at_idx").on(table.formId, table.createdAt),
    index("form_events_session_id_idx").on(table.sessionId),
    index("form_events_type_question_id_idx").on(table.type, table.questionId),
  ],
);

export type ResponseSession = typeof responseSessions.$inferSelect;
export type NewResponseSession = typeof responseSessions.$inferInsert;
export type ResponseSessionStatus = (typeof responseSessionStatusEnum.enumValues)[number];
export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
export type FormEvent = typeof formEvents.$inferSelect;
export type NewFormEvent = typeof formEvents.$inferInsert;
export type FormEventType = (typeof formEventTypeEnum.enumValues)[number];
