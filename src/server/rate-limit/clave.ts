/**
 * Derivación de la clave de `rate_limits` y extracción del cliente.
 *
 * Módulo **puro**: recibe la sal como argumento y no toca la base de datos, así
 * que sus tests corren sin PostgreSQL. Lo único que sale de aquí es un hash
 * hexadecimal; la dirección IP nunca se devuelve, nunca se registra y nunca se
 * escribe.
 */

import { createHash } from 'node:crypto';

/** Ámbitos de limitación. Cada endpoint público cuenta en su propio cubo. */
export const AMBITOS_LIMITE = ['sesiones', 'respuestas', 'completar'] as const;

export type AmbitoLimite = (typeof AMBITOS_LIMITE)[number];

/**
 * Cuando no hay forma de identificar al cliente (petición sin cabeceras de
 * proxy y sin socket, como en un test o tras un proxy mal configurado) se usa
 * este marcador. Todos los anónimos comparten cubo a propósito: es preferible
 * limitar de más a dejar un hueco sin límite.
 */
export const CLIENTE_DESCONOCIDO = 'desconocido';

/**
 * SHA-256 de `ámbito : cliente : sal`. Es lo único que se guarda.
 *
 * El ámbito entra en el hash para que la misma IP produzca claves distintas en
 * endpoints distintos, de modo que ni siquiera cruzando filas de la tabla se
 * pueda saber que dos cubos son de la misma persona.
 */
export function claveDeLimite(
  ambito: AmbitoLimite,
  cliente: string,
  sal: Buffer,
): string {
  return createHash('sha256')
    .update(ambito)
    .update(':')
    .update(cliente)
    .update(':')
    .update(sal)
    .digest('hex');
}

/**
 * Inicio de la ventana fija que contiene `ahora`, truncado al tamaño de ventana.
 *
 * Una ventana fija (y no deslizante) es lo que permite el incremento atómico con
 * `ON CONFLICT DO UPDATE` sobre la clave primaria `(key_hash, window_start)`,
 * sin leer antes ni bloquear nada.
 */
export function inicioDeVentana(ahora: Date, ventanaMs: number): Date {
  return new Date(Math.floor(ahora.getTime() / ventanaMs) * ventanaMs);
}

/**
 * Identificador del cliente a partir de las cabeceras de la petición.
 *
 * Se prefiere la **primera** entrada de `x-forwarded-for`, que es la que añade
 * el proxy más cercano al cliente; las siguientes las controla quien envía la
 * petición y no son de fiar. El valor devuelto solo se usa para alimentar el
 * hash y no debe guardarse ni registrarse en ningún sitio.
 */
export function clienteDePeticion(cabeceras: Headers): string {
  const reenviada = cabeceras.get('x-forwarded-for');
  if (reenviada !== null) {
    const primera = reenviada.split(',')[0]?.trim();
    if (primera !== undefined && primera !== '') return primera;
  }

  for (const nombre of ['x-real-ip', 'cf-connecting-ip', 'x-vercel-forwarded-for']) {
    const valor = cabeceras.get(nombre)?.trim();
    if (valor !== undefined && valor !== '') return valor;
  }

  return CLIENTE_DESCONOCIDO;
}
