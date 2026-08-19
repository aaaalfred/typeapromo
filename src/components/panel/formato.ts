/**
 * Formateo de textos del panel.
 *
 * Las fechas se pintan absolutas y no en relativo («hace 3 h»): el listado se
 * ordena por fecha de edición y un valor relativo obliga a comparar mentalmente
 * dos unidades distintas. El valor ISO se conserva en el atributo `dateTime` del
 * elemento `<time>`, que es lo que leen los lectores de pantalla y las pruebas.
 */

const FORMATO_FECHA = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Fecha legible, o `null` si el valor no es una fecha válida. */
export function formatearFecha(iso: string | null): string | null {
  if (iso === null) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return FORMATO_FECHA.format(fecha);
}

/** Concuerda el sustantivo con la cifra: `1 respuesta`, `4 respuestas`. */
export function plural(cantidad: number, singular: string, pluralizado: string): string {
  return `${String(cantidad)} ${cantidad === 1 ? singular : pluralizado}`;
}

/** Iniciales para el avatar de reserva cuando no hay imagen de Slack. */
export function iniciales(nombre: string | null, correo: string | null): string {
  const origen = (nombre ?? correo ?? '').trim();
  if (origen.length === 0) return '?';

  const palabras = origen.split(/[\s@._-]+/u).filter((palabra) => palabra.length > 0);
  const primera = palabras[0] ?? '';
  const segunda = palabras[1] ?? '';
  const letras = `${primera.slice(0, 1)}${segunda.slice(0, 1)}`;

  return (letras.length > 0 ? letras : origen.slice(0, 1)).toUpperCase();
}
