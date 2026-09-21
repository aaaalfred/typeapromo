/**
 * Decisiones del ciclo de vida de un activo. **Lógica pura**: recibe filas ya
 * leídas y devuelve un veredicto, sin tocar la base de datos ni el almacén.
 *
 * Existe separado del acceso a datos por dos motivos. El primero es poder
 * testear sin PostgreSQL las dos reglas que más caro salen si se equivocan: qué
 * se puede borrar y qué se puede limpiar. El segundo es documental: las
 * consultas SQL de `borrado.ts` y `limpieza.ts` son la traducción literal de
 * estos predicados, y tenerlos escritos aparte hace evidente cuándo una consulta
 * ha dejado de corresponderse con la regla.
 */

import type { MediaRefScope } from '@/db/schema';

/* -------------------------------------------------------------------------- */
/* Borrado seguro                                                              */
/* -------------------------------------------------------------------------- */

/** Recuento de referencias de un activo, desglosado por ámbito. */
export interface ResumenReferencias {
  total: number;
  /** Referencias desde el borrador vivo de algún formulario. */
  borradores: number;
  /** Referencias desde un snapshot publicado. Son las que blindan el activo. */
  versiones: number;
}

/**
 * Agrupa las filas de `media_asset_refs` de un activo.
 *
 * `src/db/README.md`: «Un activo es borrable cuando
 * `SELECT count(*) FROM media_asset_refs WHERE asset_id = $1` da 0». El desglose
 * no cambia esa regla; sirve para explicar al usuario **por qué** no se puede
 * borrar, que es distinto de si se puede.
 */
export function resumirReferencias(
  filas: readonly { scope: MediaRefScope }[],
): ResumenReferencias {
  let borradores = 0;
  let versiones = 0;
  for (const fila of filas) {
    if (fila.scope === 'version') versiones += 1;
    else borradores += 1;
  }
  return { total: borradores + versiones, borradores, versiones };
}

/** Un activo es borrable si y solo si no lo referencia nadie. */
export function puedeBorrarse(resumen: ResumenReferencias): boolean {
  return resumen.total === 0;
}

/**
 * Explicación del bloqueo, en español y accionable.
 *
 * La referencia desde una versión publicada es un «no» definitivo mientras esa
 * versión exista (PR.md · criterio de aceptación); la referencia desde un
 * borrador se resuelve quitando la imagen del formulario y guardando.
 */
export function mensajeDeBloqueo(resumen: ResumenReferencias): string {
  if (resumen.versiones > 0 && resumen.borradores > 0) {
    return `La imagen se usa en ${plural(resumen.versiones, 'versión publicada', 'versiones publicadas')} y en ${plural(resumen.borradores, 'borrador', 'borradores')}. No se puede borrar mientras exista alguna de esas versiones publicadas.`;
  }
  if (resumen.versiones > 0) {
    return `La imagen se usa en ${plural(resumen.versiones, 'versión publicada', 'versiones publicadas')}. No se puede borrar mientras esa versión exista: borrarla rompería los formularios ya publicados.`;
  }
  if (resumen.borradores > 0) {
    return `La imagen se usa en ${plural(resumen.borradores, 'borrador', 'borradores')}. Quítala del formulario y guarda antes de borrarla.`;
  }
  return 'La imagen está en uso y no se puede borrar.';
}

function plural(cantidad: number, singular: string, plural_: string): string {
  return cantidad === 1 ? `1 ${singular}` : `${cantidad} ${plural_}`;
}

/* -------------------------------------------------------------------------- */
/* Limpieza programada                                                         */
/* -------------------------------------------------------------------------- */

/** Cargas de staging que no llegaron a `complete` (PR.md: 24 horas). */
export const HORAS_STAGING_CADUCADO = 24;

/** Periodo de gracia de los activos publicados sin referencias (PR.md: 7 días). */
export const DIAS_GRACIA_HUERFANOS = 7;

/**
 * Antigüedad a partir de la cual una ventana de `rate_limits` ya no interesa.
 * Las ventanas son de minutos; 24 h es un margen holgado y mantiene la tabla
 * pequeña sin que una purga agresiva pueda borrar una ventana en curso.
 */
export const HORAS_RATE_LIMITS_CADUCADOS = 24;

const UNA_HORA_MS = 60 * 60 * 1000;

export function limiteStagingCaducado(ahora: Date): Date {
  return new Date(ahora.getTime() - HORAS_STAGING_CADUCADO * UNA_HORA_MS);
}

export function limiteHuerfanos(ahora: Date): Date {
  return new Date(ahora.getTime() - DIAS_GRACIA_HUERFANOS * 24 * UNA_HORA_MS);
}

export function limiteRateLimits(ahora: Date): Date {
  return new Date(ahora.getTime() - HORAS_RATE_LIMITS_CADUCADOS * UNA_HORA_MS);
}

/** Forma mínima de un activo para decidir si entra en una purga. */
export interface ActivoParaLimpieza {
  status: 'uploading' | 'ready' | 'failed';
  createdAt: Date;
  readyAt: Date | null;
  referencias: number;
}

/**
 * Carga incompleta caducada: nunca llegó a `ready`, es más vieja que el plazo y
 * nadie la referencia.
 *
 * `failed` entra por la misma puerta que `uploading`: es una carga que tampoco
 * terminó, y su objeto de staging —si quedó alguno— es basura idéntica.
 */
export function esStagingCaducado(activo: ActivoParaLimpieza, ahora: Date): boolean {
  if (activo.status === 'ready') return false;
  if (activo.referencias > 0) return false;
  return activo.createdAt.getTime() < limiteStagingCaducado(ahora).getTime();
}

/**
 * Huérfano publicado: está `ready`, ha pasado el periodo de gracia desde que se
 * publicó y no lo referencia ni un borrador ni una versión.
 *
 * La gracia se cuenta desde `readyAt` y no desde `createdAt`: lo que importa es
 * cuánto lleva disponible, no cuánto lleva existiendo la fila.
 */
export function esHuerfanoCaducado(activo: ActivoParaLimpieza, ahora: Date): boolean {
  if (activo.status !== 'ready') return false;
  if (activo.referencias > 0) return false;
  const desde = activo.readyAt ?? activo.createdAt;
  return desde.getTime() < limiteHuerfanos(ahora).getTime();
}

/** Resumen devuelto por la limpieza. Todos los contadores son de filas borradas. */
export interface ResumenLimpieza {
  /** Cargas de staging incompletas eliminadas. */
  stagingCaducado: number;
  /** Activos publicados sin referencias eliminados tras la gracia. */
  huerfanosPublicados: number;
  /** Objetos borrados en los buckets, sumando staging y público. */
  objetosBorrados: number;
  /** Ventanas de `rate_limits` purgadas. */
  rateLimitsPurgados: number;
}

export const RESUMEN_VACIO: ResumenLimpieza = {
  stagingCaducado: 0,
  huerfanosPublicados: 0,
  objetosBorrados: 0,
  rateLimitsPurgados: 0,
};
