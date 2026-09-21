import { relations } from "drizzle-orm";

import {
  authAccounts,
  authSessions,
  emailVerificationTokens,
  passwordResetTokens,
  users,
} from "./auth";
import { formDrafts, formVersions, forms } from "./forms";
import { mediaAssetRefs, mediaAssets } from "./media";
import { answers, formEvents, responseSessions } from "./responses";
import { workspaceMembers, workspaces } from "./workspaces";

/**
 * Relaciones para la API de consultas de Drizzle (`db.query.*`).
 *
 * `forms` y `form_versions` se referencian mutuamente, así que ambas parejas
 * llevan `relationName` explícito para deshacer la ambigüedad.
 */

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(authAccounts),
  sessions: many(authSessions),
  workspaceMemberships: many(workspaceMembers),
  createdForms: many(forms),
  editedDrafts: many(formDrafts),
  publishedVersions: many(formVersions),
  uploadedAssets: many(mediaAssets),
  emailVerificationTokens: many(emailVerificationTokens),
  passwordResetTokens: many(passwordResetTokens),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  forms: many(forms),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
  }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(users, { fields: [authAccounts.userId], references: [users.id] }),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));

export const formsRelations = relations(forms, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [forms.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, { fields: [forms.createdBy], references: [users.id] }),
  draft: one(formDrafts),
  versions: many(formVersions, { relationName: "form_versions" }),
  activeVersion: one(formVersions, {
    fields: [forms.activeVersionId],
    references: [formVersions.id],
    relationName: "form_active_version",
  }),
  responseSessions: many(responseSessions),
  answers: many(answers),
  events: many(formEvents),
  mediaRefs: many(mediaAssetRefs),
}));

export const formDraftsRelations = relations(formDrafts, ({ one }) => ({
  form: one(forms, { fields: [formDrafts.formId], references: [forms.id] }),
  editor: one(users, { fields: [formDrafts.updatedBy], references: [users.id] }),
}));

export const formVersionsRelations = relations(formVersions, ({ one, many }) => ({
  form: one(forms, {
    fields: [formVersions.formId],
    references: [forms.id],
    relationName: "form_versions",
  }),
  activeForForms: many(forms, { relationName: "form_active_version" }),
  publisher: one(users, { fields: [formVersions.publishedBy], references: [users.id] }),
  responseSessions: many(responseSessions),
  answers: many(answers),
  events: many(formEvents),
  mediaRefs: many(mediaAssetRefs),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
  uploader: one(users, { fields: [mediaAssets.createdBy], references: [users.id] }),
  refs: many(mediaAssetRefs),
}));

export const mediaAssetRefsRelations = relations(mediaAssetRefs, ({ one }) => ({
  asset: one(mediaAssets, {
    fields: [mediaAssetRefs.assetId],
    references: [mediaAssets.id],
  }),
  form: one(forms, { fields: [mediaAssetRefs.formId], references: [forms.id] }),
  version: one(formVersions, {
    fields: [mediaAssetRefs.versionId],
    references: [formVersions.id],
  }),
}));

export const responseSessionsRelations = relations(responseSessions, ({ one, many }) => ({
  form: one(forms, { fields: [responseSessions.formId], references: [forms.id] }),
  version: one(formVersions, {
    fields: [responseSessions.versionId],
    references: [formVersions.id],
  }),
  answers: many(answers),
  events: many(formEvents),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  session: one(responseSessions, {
    fields: [answers.sessionId],
    references: [responseSessions.id],
  }),
  form: one(forms, { fields: [answers.formId], references: [forms.id] }),
  version: one(formVersions, {
    fields: [answers.versionId],
    references: [formVersions.id],
  }),
}));

export const formEventsRelations = relations(formEvents, ({ one }) => ({
  form: one(forms, { fields: [formEvents.formId], references: [forms.id] }),
  version: one(formVersions, {
    fields: [formEvents.versionId],
    references: [formVersions.id],
  }),
  session: one(responseSessions, {
    fields: [formEvents.sessionId],
    references: [responseSessions.id],
  }),
}));
