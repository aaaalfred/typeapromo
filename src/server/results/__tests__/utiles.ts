/**
 * Utilidades compartidas por los tests de resultados.
 *
 * El analizador CSV está escrito **aparte del código que se prueba** a
 * propósito: si compartiera implementación con `../csv`, un error de escapado se
 * cancelaría con el mismo error al leer y el test pasaría igual.
 */

import { BOM_UTF8 } from '../csv';

/** Analizador CSV mínimo conforme a RFC 4180. Devuelve filas de campos. */
export function analizarCsv(texto: string): string[][] {
  const sinBom = texto.startsWith(BOM_UTF8) ? texto.slice(1) : texto;
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;

  for (let indice = 0; indice < sinBom.length; indice += 1) {
    const caracter = sinBom[indice];

    if (entreComillas) {
      if (caracter === '"') {
        if (sinBom[indice + 1] === '"') {
          campo += '"';
          indice += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += caracter;
      }
      continue;
    }

    if (caracter === '"') {
      entreComillas = true;
    } else if (caracter === ',') {
      fila.push(campo);
      campo = '';
    } else if (caracter === '\r' && sinBom[indice + 1] === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
      indice += 1;
    } else {
      campo += caracter;
    }
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas;
}

/**
 * Texto de respuesta con todo lo que puede romper un CSV a la vez: coma,
 * comillas dobles, salto de línea y acentuación.
 */
export const TEXTO_DIFICIL =
  'Rápido, claro y "barato".\nPero el envío llegó el día 3; aún así, ¡genial!';
