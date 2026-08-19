/**
 * Sal de proceso del control de abuso (PLAN.md · §2.6).
 *
 * La sal se genera **en memoria al arrancar el proceso** y no se persiste en
 * ningún sitio: ni en la base de datos, ni en disco, ni en una variable de
 * entorno. Sin ella, el `key_hash` de `rate_limits` no se puede revertir a una
 * dirección IP ni siquiera por fuerza bruta sobre el espacio de IPv4, y al
 * reiniciar el proceso los hashes antiguos dejan de significar nada.
 *
 * Ese olvido es intencionado: la prohibición de almacenar IP aplica a la
 * respuesta (`response_sessions` no tiene columna de IP y no la tendrá), y esta
 * tabla es lo único que se le parece. Mantenerla irreversible y efímera es lo
 * que hace que las dos cosas sigan deliberadamente desconectadas.
 *
 * Se cachea en `globalThis` porque el hot reload de desarrollo recarga los
 * módulos: sin ello, cada recarga estrenaría sal y los contadores en curso
 * quedarían huérfanos a mitad de ventana.
 */

import { randomBytes } from 'node:crypto';

const globalParaSal = globalThis as typeof globalThis & {
  __tpSalRateLimit?: Buffer;
};

/** 32 bytes: el mismo tamaño que la salida de SHA-256. */
const LONGITUD_SAL_BYTES = 32;

function crearSal(): Buffer {
  return randomBytes(LONGITUD_SAL_BYTES);
}

/**
 * Sal viva del proceso. Es la misma durante toda la vida del proceso y distinta
 * en cada arranque.
 */
export function salDeProceso(): Buffer {
  const existente = globalParaSal.__tpSalRateLimit;
  if (existente !== undefined) return existente;

  const nueva = crearSal();
  globalParaSal.__tpSalRateLimit = nueva;
  return nueva;
}

/**
 * Rota la sal. **Solo para tests**: en producción nada debe llamarla, porque
 * invalida todos los contadores en vuelo.
 */
export function rotarSalDeProceso(): Buffer {
  const nueva = crearSal();
  globalParaSal.__tpSalRateLimit = nueva;
  return nueva;
}
