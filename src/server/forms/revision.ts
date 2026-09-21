/**
 * Decisión del guardado optimista del borrador.
 *
 * La consulta es la de `src/db/README.md`:
 *
 * ```sql
 * UPDATE form_drafts
 *    SET definition = $1, revision = revision + 1, updated_at = now(), updated_by = $2
 *  WHERE form_id = $3 AND revision = $4
 * RETURNING revision;
 * ```
 *
 * Que no devuelva ninguna fila admite exactamente dos lecturas, y confundirlas
 * sería grave: o el borrador no existe (404) o alguien escribió antes (409). La
 * distinción se hace con una segunda lectura de la revisión actual, y esa
 * decisión —pura y sin base de datos— es lo que resuelve este módulo, para poder
 * probarla sin PostgreSQL.
 */

export type DraftWriteDecision =
  /** El `UPDATE` afectó a la fila: la revisión enviada era la vigente. */
  | { readonly kind: 'saved'; readonly revision: number; readonly updatedAt: Date }
  /** No hay borrador para ese formulario. */
  | { readonly kind: 'missing' }
  /** Otra pestaña escribió antes: hay que devolver `409` con la revisión real. */
  | {
      readonly kind: 'conflict';
      readonly expectedRevision: number;
      readonly serverRevision: number;
    };

/** Fila devuelta por el `UPDATE … RETURNING`, o `undefined` si no afectó a ninguna. */
export interface DraftWriteRow {
  readonly revision: number;
  readonly updatedAt: Date;
}

/**
 * @param expectedRevision Revisión que envió el cliente.
 * @param written          Fila devuelta por el `UPDATE`, si la hubo.
 * @param currentRevision  Revisión leída después, o `null` si no hay borrador.
 */
export function decideDraftWrite(
  expectedRevision: number,
  written: DraftWriteRow | undefined,
  currentRevision: number | null,
): DraftWriteDecision {
  if (written !== undefined) {
    return { kind: 'saved', revision: written.revision, updatedAt: written.updatedAt };
  }
  if (currentRevision === null) {
    return { kind: 'missing' };
  }
  return { kind: 'conflict', expectedRevision, serverRevision: currentRevision };
}

/**
 * `true` si la revisión enviada puede volver a intentarse tal cual. Solo lo es
 * cuando coincide con la del servidor; cualquier otra cosa —incluida una
 * revisión *mayor*, que solo puede venir de un cliente corrupto— es conflicto.
 */
export function revisionMatches(expectedRevision: number, serverRevision: number): boolean {
  return expectedRevision === serverRevision;
}
