/**
 * Contrato del almacenamiento de objetos.
 *
 * PLAN.md · §2.10: «el cliente S3 vive tras una interfaz (`lib/storage`), con
 * `forcePathStyle` conmutable». MinIO valida el flujo en local; la compatibilidad
 * real con R2 hay que probarla contra R2 al menos una vez antes de cerrar la
 * fase. Todo lo que consume media (`@/server/media`) depende de esta interfaz y
 * no de `@aws-sdk/client-s3`, de modo que sustituir la implementación —o
 * doblarla en un test— no obliga a tocar el pipeline.
 *
 * Este módulo es solo de tipos: no importa el SDK ni lee `process.env`, así que
 * puede importarse desde cualquier sitio sin arrastrar credenciales.
 */

/** Objeto descargado completo en memoria. Solo para originales acotados a 8 MB. */
export interface ObjetoDescargado {
  cuerpo: Buffer;
  byteSize: number;
  /** `Content-Type` declarado por quien subió el objeto. **No es de fiar.** */
  contentType: string | null;
}

/** Metadatos de un `HEAD`, sin descargar el cuerpo. */
export interface MetadatosObjeto {
  byteSize: number;
  /** `Content-Type` declarado por quien subió el objeto. **No es de fiar.** */
  contentType: string | null;
}

export interface OpcionesSubidaPrefirmada {
  bucket: string;
  clave: string;
  /** Se firma: la carga debe enviar exactamente este `Content-Type`. */
  contentType: string;
  /** Se firma: la carga debe enviar exactamente este `Content-Length`. */
  byteSize: number;
  expiraEnSegundos: number;
}

export interface OpcionesGuardado {
  bucket: string;
  clave: string;
  cuerpo: Buffer;
  contentType: string;
  /** Los objetos públicos se sirven inmutables; ver `CACHE_INMUTABLE`. */
  cacheControl?: string;
}

/** Cabecera de caché de los objetos publicados: claves inmutables ⇒ un año. */
export const CACHE_INMUTABLE = 'public, max-age=31536000, immutable';

export interface AlmacenObjetos {
  /** Bucket privado de cargas temporales. */
  readonly bucketStaging: string;
  /** Bucket de lectura pública con las variantes ya procesadas. */
  readonly bucketPublico: string;

  /**
   * URL `PUT` temporal contra el endpoint S3. El navegador sube directamente
   * al bucket privado sin que los bytes pasen por la aplicación.
   */
  urlDeSubidaPrefirmada(opciones: OpcionesSubidaPrefirmada): Promise<string>;

  /** `HEAD` del objeto, o `null` si no existe. */
  metadatos(bucket: string, clave: string): Promise<MetadatosObjeto | null>;

  /** Descarga completa en memoria. Quien llama debe haber validado el tamaño antes. */
  descargar(bucket: string, clave: string): Promise<ObjetoDescargado>;

  guardar(opciones: OpcionesGuardado): Promise<void>;

  /** Borrado idempotente: borrar algo que no existe no es un error en S3. */
  borrar(bucket: string, clave: string): Promise<void>;

  /** Borrado por lotes. Devuelve cuántas claves se han borrado sin error. */
  borrarVarios(bucket: string, claves: readonly string[]): Promise<number>;

  /**
   * URL de lectura pública de una clave, construida sobre
   * `MEDIA_PUBLIC_BASE_URL` (dominio personalizado de R2), nunca sobre el
   * endpoint S3.
   */
  urlPublica(clave: string): string;
}
