/**
 * Identificadores estables del editor.
 *
 * Los identificadores de bloques, opciones, pantallas finales y reglas los crea
 * **el editor** (así lo documenta `lib/forms/definition.ts`) y sobreviven a
 * reordenaciones, reetiquetados y publicaciones. Por eso no se derivan del
 * título ni de la posición: un identificador derivado cambiaría al renombrar y
 * rompería las reglas que lo apuntan y las respuestas ya recogidas.
 *
 * El alfabeto omite `l`, `1`, `i` y `7` para que un identificador leído en un
 * mensaje de error no se transcriba mal.
 */

/** Alfabeto sin caracteres confundibles. Todos válidos para `idSchema`. */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Longitud del sufijo aleatorio: 31^8 combinaciones, de sobra por documento. */
const LONGITUD = 8;

function bytesAleatorios(longitud: number): Uint8Array {
  const bytes = new Uint8Array(longitud);
  const cripto: Crypto | undefined = globalThis.crypto;
  if (typeof cripto?.getRandomValues === 'function') {
    cripto.getRandomValues(bytes);
    return bytes;
  }
  for (let indice = 0; indice < longitud; indice += 1) {
    bytes[indice] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** Cadena aleatoria del alfabeto seguro. */
export function sufijoAleatorio(longitud: number = LONGITUD): string {
  let salida = '';
  for (const byte of bytesAleatorios(longitud)) {
    salida += ALFABETO[byte % ALFABETO.length] ?? 'a';
  }
  return salida;
}

/**
 * Identificador nuevo con prefijo legible, garantizado distinto de los ya
 * usados en el documento.
 *
 * @param prefijo Prefijo corto, solo `[A-Za-z0-9_-]` (p. ej. `b`, `op`, `r`).
 * @param ocupados Identificadores que ya existen en el documento.
 */
export function nuevoId(prefijo: string, ocupados: Iterable<string> = []): string {
  const usados = ocupados instanceof Set ? ocupados : new Set(ocupados);
  for (let intento = 0; intento < 50; intento += 1) {
    const candidato = `${prefijo}-${sufijoAleatorio()}`;
    if (!usados.has(candidato)) return candidato;
  }
  // Improbable hasta el absurdo; aun así, no devolver nunca un duplicado.
  return `${prefijo}-${sufijoAleatorio(16)}`;
}

/**
 * Convierte un texto libre en un valor de opción admisible por el contrato
 * (`[A-Za-z0-9_-]`, sin diacríticos). Se usa como *sugerencia* al escribir la
 * etiqueta de una opción nueva; nunca reescribe el valor de una ya guardada,
 * porque las respuestas históricas lo comparan tal cual.
 */
export function valorSugerido(etiqueta: string): string {
  const base = etiqueta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return base.length > 0 ? base : sufijoAleatorio(6);
}
