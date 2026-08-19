/**
 * Formas de datos del panel, tal y como **viajan por HTTP**.
 *
 * No se reutilizan los tipos de `@/server/forms` a propósito: allí las fechas
 * son `Date`, pero después de `JSON.stringify` llegan al navegador como cadenas
 * ISO. Copiar la interfaz con `string` es lo que impide que un `.getTime()`
 * compile aquí y reviente en tiempo de ejecución.
 *
 * El contrato de origen está en `src/server/forms/service.ts` (`FormSummary`,
 * `FormListPage`); cualquier cambio allí debe reflejarse aquí.
 */

/** Estados del ciclo de vida. Copia literal del enum de PostgreSQL. */
export const ESTADOS_FORMULARIO = ['draft', 'published', 'closed', 'archived'] as const;

export type EstadoFormulario = (typeof ESTADOS_FORMULARIO)[number];

/** Etiqueta visible de cada estado. */
export const ETIQUETA_ESTADO: Readonly<Record<EstadoFormulario, string>> = {
  draft: 'Borrador',
  published: 'Publicado',
  closed: 'Cerrado',
  archived: 'Archivado',
};

/** Contadores de participación mostrados en cada fila. */
export interface ContadoresRespuestas {
  /** Sesiones iniciadas, completas o no. */
  readonly sessions: number;
  /** Sesiones terminadas. Es la cifra de «respuestas» que pide PR.md. */
  readonly completed: number;
}

/** Estado del borrador vivo, sin el documento. */
export interface EstadoBorrador {
  readonly revision: number;
  /** Fecha ISO. */
  readonly updatedAt: string;
}

/** Fila del listado. */
export interface ResumenFormulario {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: EstadoFormulario;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
  readonly archivedAt: string | null;
  readonly activeVersionId: string | null;
  readonly activeVersionNumber: number | null;
  readonly publishedAt: string | null;
  readonly draft: EstadoBorrador | null;
  readonly responses: ContadoresRespuestas;
}

/** Página del listado devuelta por `GET /api/forms`. */
export interface PaginaFormularios {
  readonly items: readonly ResumenFormulario[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

/** Envoltorio común de las mutaciones: todas devuelven `{ form }`. */
export interface RespuestaFormulario {
  readonly form: ResumenFormulario;
}

/**
 * Filtro del listado. `'todos'` no viaja a la API: se traduce a «sin filtro de
 * estado y sin archivados».
 */
export type FiltroEstado = EstadoFormulario | 'todos';

export interface FiltroListado {
  readonly q: string;
  readonly estado: FiltroEstado;
}

export const FILTRO_INICIAL: FiltroListado = { q: '', estado: 'todos' };

/** Opciones del selector de estado, en el orden en que se muestran. */
export const OPCIONES_FILTRO_ESTADO: readonly { value: FiltroEstado; label: string }[] = [
  { value: 'todos', label: 'Todos (sin archivar)' },
  { value: 'draft', label: ETIQUETA_ESTADO.draft },
  { value: 'published', label: ETIQUETA_ESTADO.published },
  { value: 'closed', label: ETIQUETA_ESTADO.closed },
  { value: 'archived', label: ETIQUETA_ESTADO.archived },
];
