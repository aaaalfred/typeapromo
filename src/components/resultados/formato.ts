/**
 * Formateo de las cifras de resultados.
 *
 * Todo se pinta en español y con separadores locales: una tasa de finalización
 * escrita como `0.6153846153846154` no es un dato, es ruido. Las fechas
 * reutilizan `formatearFecha` del panel para que las dos pantallas no acaben
 * mostrando el mismo instante de dos maneras distintas.
 */

import type { EstadoSesion, QuestionType } from './tipos';

export { formatearFecha, plural } from '@/components/panel/formato';

const ENTERO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const PORCENTAJE = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  maximumFractionDigits: 1,
});

export function entero(valor: number): string {
  return ENTERO.format(valor);
}

/** Promedio con dos decimales como mucho. `—` cuando no hay valor que mostrar. */
export function decimal(valor: number | null): string {
  return valor === null || !Number.isFinite(valor) ? '—' : DECIMAL.format(valor);
}

/** Proporción de `[0, 1]` como porcentaje. */
export function porcentaje(valor: number): string {
  return Number.isFinite(valor) ? PORCENTAJE.format(valor) : '—';
}

/** Anchura de barra, acotada a `[0, 100]` para que ningún redondeo se desborde. */
export function anchuraDeBarra(parte: number, total: number): string {
  if (total <= 0 || !Number.isFinite(parte)) return '0%';
  const proporcion = Math.min(1, Math.max(0, parte / total));
  return `${String(Math.round(proporcion * 1000) / 10)}%`;
}

export const ETIQUETA_ESTADO_SESION: Readonly<Record<EstadoSesion, string>> = {
  completada: 'Completada',
  abandonada: 'Abandonada',
  en_curso: 'En curso',
};

export const ETIQUETA_TIPO_PREGUNTA: Readonly<Record<QuestionType, string>> = {
  short_text: 'Texto corto',
  long_text: 'Texto largo',
  email: 'Correo',
  date: 'Fecha',
  single_choice: 'Selección única',
  multi_choice: 'Selección múltiple',
  scale: 'Escala',
  rating: 'Valoración',
};

/** Etiqueta de una versión en el selector y en la tabla. */
export function etiquetaDeVersion(versionNumber: number, esActiva: boolean): string {
  return `Versión ${String(versionNumber)}${esActiva ? ' (activa)' : ''}`;
}
