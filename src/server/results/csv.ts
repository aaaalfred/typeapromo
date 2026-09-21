/**
 * Serialización CSV (RFC 4180).
 *
 * Módulo **puro**: aquí solo se escapa y se une texto. Quién lee las filas y en
 * qué orden es cosa de `servicio.ts`, que las va emitiendo por lotes sin montar
 * nunca el fichero entero en memoria.
 *
 * Tres decisiones que se ven desde fuera:
 *
 * 1. **BOM UTF-8 al principio.** Sin él, Excel en Windows abre el fichero con
 *    la página de códigos del sistema y «Satisfacción» aparece como
 *    «SatisfacciÃ³n». Es la razón entera por la que el BOM está aquí.
 * 2. **Fin de línea `CRLF`**, como manda RFC 4180.
 * 3. **Comillas solo cuando hacen falta**: si el campo lleva coma, comilla,
 *    salto de línea o espacio en los bordes. Las comillas internas se duplican.
 */

/** Marca de orden de bytes UTF-8. Va una sola vez, al principio del fichero. */
export const BOM_UTF8 = '\uFEFF';

/** Separador de campos. */
export const SEPARADOR_CSV = ',';

/** Fin de registro según RFC 4180. */
export const FIN_DE_LINEA = '\r\n';

const NECESITA_COMILLAS = /[",\r\n]/;

/**
 * Escapa un campo.
 *
 * `null` y `undefined` se escriben como campo vacío, no como la cadena
 * `"null"`: en un CSV la ausencia de valor es la celda en blanco.
 */
export function escaparCampoCsv(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';

  const requiereComillas =
    NECESITA_COMILLAS.test(valor) || valor !== valor.trim();

  if (!requiereComillas) return valor;

  return `"${valor.replaceAll('"', '""')}"`;
}

/** Une los campos ya escapados en un registro terminado en `CRLF`. */
export function filaCsv(campos: readonly (string | null | undefined)[]): string {
  return campos.map(escaparCampoCsv).join(SEPARADOR_CSV) + FIN_DE_LINEA;
}

/**
 * Nombre de fichero seguro para la cabecera `Content-Disposition`.
 *
 * Se emite en dos formas: `filename` con un ASCII conservador para clientes
 * antiguos y `filename*` con el nombre real codificado en UTF-8. Un nombre con
 * acentos, comillas o saltos de línea en `filename` a secas rompe la cabecera.
 */
export function cabeceraDeDescarga(nombre: string): string {
  const limpio = nombre.replaceAll(/[^\w.-]+/gu, '_').replace(/^_+|_+$/gu, '');
  const seguro = limpio === '' ? 'resultados.csv' : limpio;
  return `attachment; filename="${seguro}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

/** Nombre de fichero de la exportación de una versión concreta. */
export function nombreArchivoCsv(slug: string, versionNumber: number): string {
  return `${slug}-v${String(versionNumber)}-resultados.csv`;
}

/** Cabeceras HTTP de la respuesta CSV. */
export function cabecerasCsv(nombre: string): Readonly<Record<string, string>> {
  return {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': cabeceraDeDescarga(nombre),
    // Los resultados cambian con cada respuesta: nunca se cachean.
    'cache-control': 'no-store',
  };
}

/* -------------------------------------------------------------------------- */
/* Columnas                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Metadatos mínimos de sesión que preceden a las preguntas.
 *
 * «Mínimos» es literal: no hay IP, ni token, ni agente de usuario. El
 * identificador de sesión es el UUID que ya está en la base de datos, y sirve
 * para cruzar el CSV con el panel, no para identificar a nadie.
 */
export const COLUMNAS_METADATOS = [
  'sesion_id',
  'version',
  'estado',
  'iniciada_en',
  'ultima_actividad_en',
  'completada_en',
  'respuestas',
] as const;

/* -------------------------------------------------------------------------- */
/* Transporte                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Convierte los trozos de texto en un cuerpo HTTP **en streaming**.
 *
 * Cada trozo se codifica y se encola en cuanto está listo, así que el fichero
 * nunca existe entero en memoria: es el requisito explícito de PLAN.md para la
 * exportación, no una optimización. `pull` pide un trozo por vuelta en lugar de
 * volcar el generador de golpe, de modo que la contrapresión del cliente llega
 * hasta la consulta.
 *
 * Un fallo a mitad de emisión ya no puede convertirse en un error JSON —las
 * cabeceras salieron con el primer byte—, así que se aborta el flujo: quien
 * descarga recibe un fichero truncado y un error de red, nunca un CSV corto que
 * parezca completo.
 */
export function flujoCsv(trozos: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  const iterador = trozos[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controlador) {
      try {
        const { value, done } = await iterador.next();
        if (done === true) {
          controlador.close();
          return;
        }
        if (value !== '') controlador.enqueue(codificador.encode(value));
      } catch (causa) {
        controlador.error(causa);
      }
    },
    async cancel(motivo: unknown) {
      // El cliente ha cerrado la descarga: se cierra también el recorrido para
      // no dejar la consulta paginada abierta detrás.
      await iterador.return?.(motivo);
    },
  });
}
