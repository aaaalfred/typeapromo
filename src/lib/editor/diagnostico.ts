/**
 * Validación en vivo del editor.
 *
 * **No reimplementa ninguna comprobación.** Ejecuta el validador de publicación
 * de `@/lib/forms` —el mismo que corre `POST /api/forms/:id/publish`— y se
 * limita a indexar sus resultados por bloque, por pantalla y por regla, que es
 * lo que el editor necesita para pintar el aviso junto al elemento culpable en
 * lugar de en una lista suelta al final.
 *
 * Si el editor tuviera su propia copia de las reglas, publicar podría fallar por
 * algo que el editor daba por bueno; que sea literalmente el mismo validador es
 * lo que garantiza que «sin errores en el editor» signifique «publicable».
 */

import {
  validateForPublication,
  type ValidationError,
  type ValidationIssue,
  type ValidationWarning,
  type FormDefinition,
} from '@/lib/forms';

/* -------------------------------------------------------------------------- */
/* Extracción de referencias                                                   */
/* -------------------------------------------------------------------------- */

/** Lee una propiedad opcional de un issue sin recurrir a `any`. */
function cadena(issue: ValidationIssue, clave: string): string | null {
  const valor = (issue as unknown as Record<string, unknown>)[clave];
  return typeof valor === 'string' ? valor : null;
}

function cadenas(issue: ValidationIssue, clave: string): readonly string[] {
  const valor = (issue as unknown as Record<string, unknown>)[clave];
  return Array.isArray(valor) ? valor.filter((elemento): elemento is string => typeof elemento === 'string') : [];
}

/**
 * Identificadores a los que apunta un problema.
 *
 * Los códigos del validador llevan los datos concretos del caso (`blockId`,
 * `ruleId`, `targetId`…) precisamente para no tener que analizar el mensaje.
 */
export function referenciasDe(issue: ValidationIssue): {
  readonly bloques: readonly string[];
  readonly reglas: readonly string[];
} {
  const bloques = new Set<string>();
  const reglas = new Set<string>();

  for (const clave of ['blockId', 'sourceQuestionId', 'endScreenId', 'id']) {
    const valor = cadena(issue, clave);
    if (valor !== null) bloques.add(valor);
  }
  for (const valor of cadenas(issue, 'blockIds')) bloques.add(valor);

  // El destino solo se señala cuando es un bloque; una pantalla final también
  // es un elemento seleccionable del editor, así que entra en el mismo índice.
  const targetId = cadena(issue, 'targetId');
  if (targetId !== null) bloques.add(targetId);

  const ruleId = cadena(issue, 'ruleId');
  if (ruleId !== null) reglas.add(ruleId);
  for (const valor of cadenas(issue, 'ruleIds')) reglas.add(valor);
  const byRuleId = cadena(issue, 'byRuleId');
  if (byRuleId !== null) reglas.add(byRuleId);

  return { bloques: [...bloques], reglas: [...reglas] };
}

/* -------------------------------------------------------------------------- */
/* Diagnóstico                                                                 */
/* -------------------------------------------------------------------------- */

/** Un problema con su gravedad ya resuelta, para pintarlo sin más lógica. */
export interface Aviso {
  readonly gravedad: 'error' | 'advertencia';
  readonly codigo: string;
  readonly mensaje: string;
  readonly bloques: readonly string[];
  readonly reglas: readonly string[];
}

export interface Diagnostico {
  /** `true` si el documento se puede publicar tal cual. */
  readonly publicable: boolean;
  readonly errores: readonly Aviso[];
  readonly advertencias: readonly Aviso[];
  /** Todos los avisos, errores primero. */
  readonly avisos: readonly Aviso[];
  /** Avisos que afectan a cada bloque o pantalla final. */
  readonly porBloque: ReadonlyMap<string, readonly Aviso[]>;
  /** Avisos que afectan a cada regla. */
  readonly porRegla: ReadonlyMap<string, readonly Aviso[]>;
}

function aAviso(gravedad: 'error' | 'advertencia') {
  return (issue: ValidationError | ValidationWarning): Aviso => {
    const referencias = referenciasDe(issue);
    return {
      gravedad,
      codigo: issue.code,
      mensaje: issue.message,
      bloques: referencias.bloques,
      reglas: referencias.reglas,
    };
  };
}

function indexar(avisos: readonly Aviso[], extraer: (aviso: Aviso) => readonly string[]) {
  const indice = new Map<string, Aviso[]>();
  for (const aviso of avisos) {
    for (const clave of extraer(aviso)) {
      const grupo = indice.get(clave);
      if (grupo) grupo.push(aviso);
      else indice.set(clave, [aviso]);
    }
  }
  return indice;
}

const DIAGNOSTICO_VACIO_MAPA = new Map<string, readonly Aviso[]>();

/**
 * Ejecuta el validador de publicación sobre el borrador en curso.
 *
 * Es una operación pura y barata (O(bloques + reglas)); el editor la recalcula
 * en cada cambio con `useMemo`, sin debounce: un aviso que aparece medio segundo
 * tarde se lee como un fallo del editor.
 */
export function analizarDocumento(definicion: FormDefinition): Diagnostico {
  const informe = validateForPublication(definicion);
  const errores = informe.errors.map(aAviso('error'));
  const advertencias = informe.warnings.map(aAviso('advertencia'));
  const avisos = [...errores, ...advertencias];

  return {
    publicable: informe.ok,
    errores,
    advertencias,
    avisos,
    porBloque: indexar(avisos, (aviso) => aviso.bloques),
    porRegla: indexar(avisos, (aviso) => aviso.reglas),
  };
}

/** Avisos de un bloque o pantalla concretos. Nunca `undefined`. */
export function avisosDeBloque(diagnostico: Diagnostico, bloqueId: string): readonly Aviso[] {
  return diagnostico.porBloque.get(bloqueId) ?? [];
}

/** Avisos de una regla concreta. Nunca `undefined`. */
export function avisosDeRegla(diagnostico: Diagnostico, reglaId: string): readonly Aviso[] {
  return diagnostico.porRegla.get(reglaId) ?? [];
}

/** `true` si el elemento tiene al menos un error (no una simple advertencia). */
export function tieneErrores(avisos: readonly Aviso[]): boolean {
  return avisos.some((aviso) => aviso.gravedad === 'error');
}

/** Diagnóstico neutro, útil como valor inicial. */
export const DIAGNOSTICO_VACIO: Diagnostico = {
  publicable: true,
  errores: [],
  advertencias: [],
  avisos: [],
  porBloque: DIAGNOSTICO_VACIO_MAPA,
  porRegla: DIAGNOSTICO_VACIO_MAPA,
};
