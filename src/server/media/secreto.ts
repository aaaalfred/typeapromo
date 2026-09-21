/**
 * Autenticación de `POST /api/internal/cleanup`.
 *
 * Tres decisiones, las tres deliberadas:
 *
 * - **Solo por cabecera.** El secreto no se lee nunca de la query string. Una
 *   URL con el secreto dentro acaba en el log de acceso del servidor, en el
 *   historial del shell del cron y en la cabecera `Referer` de cualquier
 *   redirección. La cabecera no aparece en ninguno de esos sitios.
 * - **Comparación en tiempo constante.** `timingSafeEqual` sobre el hash de cada
 *   valor: hashear primero iguala las longitudes, que es la fuga que
 *   `timingSafeEqual` no cubre por sí solo (lanza si difieren).
 * - **Falla cerrado.** Sin `CLEANUP_SECRET` configurado no se puede invocar. Un
 *   endpoint que borra objetos y filas no puede quedarse abierto porque falte
 *   una variable de entorno.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** Cabecera propia. Se admite también `Authorization: Bearer <secreto>`. */
export const CABECERA_CLEANUP = 'x-cleanup-secret';

export type VeredictoSecreto =
  | { autorizado: true }
  | { autorizado: false; motivo: 'no-configurado' | 'ausente' | 'incorrecto' };

/** Compara sin filtrar por tiempo ni la longitud ni el contenido. */
export function comparaSecreto(recibido: string, esperado: string): boolean {
  const a = createHash('sha256').update(recibido, 'utf8').digest();
  const b = createHash('sha256').update(esperado, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** Extrae el secreto de las cabeceras. **Nunca** mira la URL. */
export function leerSecretoDeCabeceras(headers: Headers): string | null {
  const directo = headers.get(CABECERA_CLEANUP);
  if (typeof directo === 'string' && directo.trim() !== '') return directo.trim();

  const autorizacion = headers.get('authorization');
  if (typeof autorizacion === 'string') {
    const bearer = /^Bearer\s+(.+)$/i.exec(autorizacion.trim());
    if (bearer?.[1] !== undefined && bearer[1].trim() !== '') return bearer[1].trim();
  }

  return null;
}

export function autorizarLimpieza(headers: Headers): VeredictoSecreto {
  const esperado = process.env.CLEANUP_SECRET;
  if (typeof esperado !== 'string' || esperado.trim() === '') {
    return { autorizado: false, motivo: 'no-configurado' };
  }

  const recibido = leerSecretoDeCabeceras(headers);
  if (recibido === null) return { autorizado: false, motivo: 'ausente' };

  return comparaSecreto(recibido, esperado.trim())
    ? { autorizado: true }
    : { autorizado: false, motivo: 'incorrecto' };
}
