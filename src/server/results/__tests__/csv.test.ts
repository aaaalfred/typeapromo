/**
 * Serialización CSV: escapado, cabeceras y streaming.
 *
 * El escapado no se comprueba solo mirando la cadena resultante: hay además un
 * **viaje de ida y vuelta** con el analizador RFC 4180 de `./utiles`, escrito
 * aparte del código que se prueba. Comparar contra un literal esperado demuestra
 * que la salida es la que alguien escribió; volver a leerla demuestra que Excel
 * —o cualquier otro lector— recupera exactamente los mismos campos, que es lo
 * que de verdad importa cuando el texto lleva comas, comillas y saltos de
 * línea.
 */

import { describe, expect, it } from 'vitest';

import {
  BOM_UTF8,
  FIN_DE_LINEA,
  cabeceraDeDescarga,
  cabecerasCsv,
  escaparCampoCsv,
  filaCsv,
  flujoCsv,
  nombreArchivoCsv,
} from '../csv';

import { analizarCsv } from './utiles';

/* -------------------------------------------------------------------------- */
/* Escapado                                                                    */
/* -------------------------------------------------------------------------- */

describe('escaparCampoCsv', () => {
  it('deja intacto lo que no necesita comillas', () => {
    expect(escaparCampoCsv('Satisfacción')).toBe('Satisfacción');
    expect(escaparCampoCsv('sin-nada-raro')).toBe('sin-nada-raro');
  });

  it('entrecomilla las comas', () => {
    expect(escaparCampoCsv('rápido, claro y barato')).toBe('"rápido, claro y barato"');
  });

  it('duplica las comillas internas', () => {
    expect(escaparCampoCsv('dijo "hola"')).toBe('"dijo ""hola"""');
  });

  it('entrecomilla los saltos de línea, tanto LF como CRLF', () => {
    expect(escaparCampoCsv('línea uno\nlínea dos')).toBe('"línea uno\nlínea dos"');
    expect(escaparCampoCsv('línea uno\r\nlínea dos')).toBe('"línea uno\r\nlínea dos"');
  });

  it('entrecomilla los espacios de los bordes para que no se pierdan al abrir', () => {
    expect(escaparCampoCsv('  con sangría')).toBe('"  con sangría"');
    expect(escaparCampoCsv('con cola  ')).toBe('"con cola  "');
  });

  it('la ausencia de valor es la celda en blanco, no la palabra «null»', () => {
    expect(escaparCampoCsv(null)).toBe('');
    expect(escaparCampoCsv(undefined)).toBe('');
    expect(escaparCampoCsv('')).toBe('');
  });
});

describe('filaCsv', () => {
  it('une los campos y termina el registro en CRLF, como manda RFC 4180', () => {
    expect(filaCsv(['a', 'b'])).toBe(`a,b${FIN_DE_LINEA}`);
    expect(FIN_DE_LINEA).toBe('\r\n');
  });

  it('un texto con coma, comilla y salto de línea vuelve idéntico al leerlo', () => {
    const respuesta = 'Me gustó, pero:\n«el envío» dijo "tarde"\r\ny llegó el día 3';
    const texto = filaCsv(['sesion-1', respuesta, 'Completada']);

    const filas = analizarCsv(texto);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toEqual(['sesion-1', respuesta, 'Completada']);
  });

  it('un salto de línea dentro de un campo no parte el registro en dos', () => {
    const texto = filaCsv(['uno\r\ndos', 'tres']) + filaCsv(['cuatro', 'cinco']);
    const filas = analizarCsv(texto);

    expect(filas).toHaveLength(2);
    expect(filas[0]).toEqual(['uno\r\ndos', 'tres']);
    expect(filas[1]).toEqual(['cuatro', 'cinco']);
  });

  it('conserva los acentos y la eñe tras codificar en UTF-8 con BOM', () => {
    const cabecera = ['Satisfacción', 'Año de compra', '¿Nos recomendarías?'];
    const texto = BOM_UTF8 + filaCsv(cabecera);

    const bytes = new TextEncoder().encode(texto);
    // El BOM son exactamente estos tres bytes, y van los primeros: es lo que
    // hace que Excel en Windows no lea «SatisfacciÃ³n».
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const devuelto = new TextDecoder('utf-8').decode(bytes);
    expect(analizarCsv(devuelto)[0]).toEqual(cabecera);
  });
});

/* -------------------------------------------------------------------------- */
/* Cabeceras                                                                   */
/* -------------------------------------------------------------------------- */

describe('cabeceras de descarga', () => {
  it('emite un nombre ASCII y otro codificado en UTF-8', () => {
    const cabecera = cabeceraDeDescarga('encuesta-verano-v2-resultados.csv');
    expect(cabecera).toContain('attachment;');
    expect(cabecera).toContain('filename="encuesta-verano-v2-resultados.csv"');
    expect(cabecera).toContain("filename*=UTF-8''");
  });

  it('un nombre con acentos, comillas o saltos no rompe la cabecera', () => {
    const cabecera = cabeceraDeDescarga('opinión "final"\n.csv');
    // La forma ASCII no puede llevar comillas ni saltos: reventarían el valor.
    const ascii = /filename="([^"]*)"/u.exec(cabecera)?.[1] ?? '';
    expect(ascii).toMatch(/^[\w.-]+$/u);
    expect(cabecera).not.toContain('\n');
    expect(cabecera).toContain(encodeURIComponent('opinión "final"\n.csv'));
  });

  it('el tipo declara UTF-8 y la respuesta no se cachea nunca', () => {
    const cabeceras = cabecerasCsv(nombreArchivoCsv('encuesta-verano', 2));
    expect(cabeceras['content-type']).toBe('text/csv; charset=utf-8');
    expect(cabeceras['cache-control']).toBe('no-store');
    expect(cabeceras['content-disposition']).toContain('encuesta-verano-v2-resultados.csv');
  });
});

/* -------------------------------------------------------------------------- */
/* Streaming                                                                   */
/* -------------------------------------------------------------------------- */

describe('flujoCsv', () => {
  /** Generador que lleva la cuenta de cuántos trozos ha producido. */
  function generadorContado(trozos: readonly string[]) {
    const producidos: string[] = [];
    async function* emitir(): AsyncGenerator<string> {
      for (const trozo of trozos) {
        producidos.push(trozo);
        yield await Promise.resolve(trozo);
      }
    }
    return { producidos, emitir };
  }

  async function leerTodo(flujo: ReadableStream<Uint8Array>): Promise<string> {
    const lector = flujo.getReader();
    // `ignoreBOM: true` conserva el U+FEFF inicial en lugar de comérselo, que es
    // lo que hace `TextDecoder` por defecto: aquí se está comprobando justamente
    // que el flujo lo emite.
    const decodificador = new TextDecoder('utf-8', { ignoreBOM: true });
    let texto = '';
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      texto += decodificador.decode(value, { stream: true });
    }
    return texto + decodificador.decode();
  }

  it('entrega el texto completo y en orden', async () => {
    const { emitir } = generadorContado([BOM_UTF8 + filaCsv(['a', 'b']), filaCsv(['1', 'ñ'])]);
    const texto = await leerTodo(flujoCsv(emitir()));

    expect(texto.startsWith(BOM_UTF8)).toBe(true);
    expect(analizarCsv(texto)).toEqual([
      ['a', 'b'],
      ['1', 'ñ'],
    ]);
  });

  it('no monta el fichero entero: produce un trozo por lectura', async () => {
    const { producidos, emitir } = generadorContado(['uno\r\n', 'dos\r\n', 'tres\r\n']);
    const lector = flujoCsv(emitir()).getReader();

    await lector.read();
    // Si el flujo volcara el generador de golpe, aquí ya habría tres.
    expect(producidos).toEqual(['uno\r\n']);

    await lector.read();
    expect(producidos).toEqual(['uno\r\n', 'dos\r\n']);

    await lector.cancel();
  });

  it('cancelar la descarga cierra también el recorrido de la base de datos', async () => {
    let cerrado = false;
    async function* emitir(): AsyncGenerator<string> {
      try {
        for (;;) yield await Promise.resolve('fila\r\n');
      } finally {
        cerrado = true;
      }
    }

    const lector = flujoCsv(emitir()).getReader();
    await lector.read();
    await lector.cancel();

    expect(cerrado).toBe(true);
  });

  it('un fallo a mitad de emisión aborta el flujo en lugar de truncarlo en silencio', async () => {
    async function* emitir(): AsyncGenerator<string> {
      yield 'primera\r\n';
      await Promise.resolve();
      throw new Error('se cayó la consulta');
    }

    const lector = flujoCsv(emitir()).getReader();
    expect(new TextDecoder().decode((await lector.read()).value)).toBe('primera\r\n');
    await expect(lector.read()).rejects.toThrow('se cayó la consulta');
  });
});
