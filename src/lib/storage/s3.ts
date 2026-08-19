/**
 * Implementación de `AlmacenObjetos` sobre `@aws-sdk/client-s3`.
 *
 * Es el **único** fichero del proyecto que conoce el SDK de S3. Todo lo demás
 * habla con la interfaz de `./tipos`, que es lo que permite conmutar entre MinIO
 * y R2 sin tocar el pipeline (PLAN.md · §2.10) y doblar el almacén en los tests.
 *
 * Runtime Node.js obligatorio: el presigner firma con `crypto` de Node.
 */

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { leerConfiguracion, type ConfiguracionAlmacen } from './entorno';
import type {
  AlmacenObjetos,
  MetadatosObjeto,
  ObjetoDescargado,
  OpcionesGuardado,
  OpcionesSubidaPrefirmada,
} from './tipos';

/** `DeleteObjects` admite 1000 claves por petición, tanto en S3 como en R2. */
const MAXIMO_CLAVES_POR_LOTE = 1000;

/** Un `HEAD`/`GET` sobre una clave inexistente responde con uno de estos. */
function esObjetoInexistente(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const nombre = (error as { name?: unknown }).name;
  const codigo = (error as { Code?: unknown }).Code;
  const estado = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode;
  return (
    nombre === 'NotFound' ||
    nombre === 'NoSuchKey' ||
    codigo === 'NoSuchKey' ||
    estado === 404
  );
}

function numeroOCero(valor: number | undefined): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

/** Trocea las claves en lotes del tamaño que admite `DeleteObjects`. */
export function lotesDeClaves(
  claves: readonly string[],
  tamano = MAXIMO_CLAVES_POR_LOTE,
): string[][] {
  const lotes: string[][] = [];
  for (let inicio = 0; inicio < claves.length; inicio += tamano) {
    lotes.push([...claves.slice(inicio, inicio + tamano)]);
  }
  return lotes;
}

class AlmacenS3 implements AlmacenObjetos {
  readonly bucketStaging: string;
  readonly bucketPublico: string;

  private readonly cliente: S3Client;
  private readonly baseUrlPublica: string;

  constructor(configuracion: ConfiguracionAlmacen) {
    this.bucketStaging = configuracion.bucketStaging;
    this.bucketPublico = configuracion.bucketPublico;
    this.baseUrlPublica = configuracion.baseUrlPublica;
    this.cliente = new S3Client({
      region: configuracion.region,
      endpoint: configuracion.endpoint,
      forcePathStyle: configuracion.forcePathStyle,
      // Checksums solo cuando la operación los exija. Con el valor por defecto
      // (`WHEN_SUPPORTED`) el SDK añade a la URL prefirmada un
      // `x-amz-checksum-crc32` calculado sobre un cuerpo vacío —el presign no
      // ve los bytes—, que Cloudflare R2 puede validar y rechazar aunque MinIO
      // lo ignore. Es justo la clase de diferencia que PLAN.md · §2.10 advierte
      // que MinIO no detecta.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: configuracion.accessKeyId,
        secretAccessKey: configuracion.secretAccessKey,
      },
    });
  }

  async urlDeSubidaPrefirmada(opciones: OpcionesSubidaPrefirmada): Promise<string> {
    const comando = new PutObjectCommand({
      Bucket: opciones.bucket,
      Key: opciones.clave,
      ContentType: opciones.contentType,
      ContentLength: opciones.byteSize,
    });
    return getSignedUrl(this.cliente, comando, {
      expiresIn: opciones.expiraEnSegundos,
      // SigV4 prefirmado solo firma `host` por defecto. Declarando estas dos
      // cabeceras como firmables, el bucket rechaza con `403` cualquier carga
      // que cambie el tipo o el tamaño acordados: el archivo de 500 MB o el SVG
      // disfrazado no llegan siquiera a existir en staging. Verificado contra
      // MinIO en `__tests__/s3.integration.test.ts`.
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  }

  async metadatos(bucket: string, clave: string): Promise<MetadatosObjeto | null> {
    try {
      const respuesta = await this.cliente.send(
        new HeadObjectCommand({ Bucket: bucket, Key: clave }),
      );
      return {
        byteSize: numeroOCero(respuesta.ContentLength),
        contentType: respuesta.ContentType ?? null,
      };
    } catch (error) {
      if (esObjetoInexistente(error)) return null;
      throw error;
    }
  }

  async descargar(bucket: string, clave: string): Promise<ObjetoDescargado> {
    const respuesta = await this.cliente.send(
      new GetObjectCommand({ Bucket: bucket, Key: clave }),
    );
    const cuerpo = respuesta.Body;
    if (cuerpo === undefined) {
      throw new Error(`El objeto ${bucket}/${clave} no tiene cuerpo.`);
    }
    const bytes = await cuerpo.transformToByteArray();
    const buffer = Buffer.from(bytes);
    return {
      cuerpo: buffer,
      byteSize: buffer.byteLength,
      contentType: respuesta.ContentType ?? null,
    };
  }

  async guardar(opciones: OpcionesGuardado): Promise<void> {
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: opciones.bucket,
        Key: opciones.clave,
        Body: opciones.cuerpo,
        ContentType: opciones.contentType,
        ContentLength: opciones.cuerpo.byteLength,
        ...(opciones.cacheControl === undefined
          ? {}
          : { CacheControl: opciones.cacheControl }),
      }),
    );
  }

  async borrar(bucket: string, clave: string): Promise<void> {
    await this.cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: clave }));
  }

  async borrarVarios(bucket: string, claves: readonly string[]): Promise<number> {
    let borradas = 0;
    for (const lote of lotesDeClaves(claves)) {
      const respuesta = await this.cliente.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: lote.map((clave) => ({ Key: clave })), Quiet: false },
        }),
      );
      borradas += respuesta.Deleted?.length ?? 0;
    }
    return borradas;
  }

  urlPublica(clave: string): string {
    return `${this.baseUrlPublica}/${clave.replace(/^\/+/, '')}`;
  }
}

/** Construye un almacén con una configuración explícita (útil en tests). */
export function crearAlmacenS3(configuracion: ConfiguracionAlmacen): AlmacenObjetos {
  return new AlmacenS3(configuracion);
}

/**
 * Almacén compartido del proceso.
 *
 * Se cachea en `globalThis` por la misma razón que el pool de `pg`: el hot
 * reload de desarrollo recarga el módulo y abriría un cliente nuevo —con su
 * propio pool de sockets— en cada recarga.
 */
const globalParaAlmacen = globalThis as typeof globalThis & {
  __almacenObjetos?: AlmacenObjetos;
};

let almacenDelModulo: AlmacenObjetos | null = null;

export function almacen(): AlmacenObjetos {
  const existente = almacenDelModulo ?? globalParaAlmacen.__almacenObjetos;
  if (existente !== undefined && existente !== null) {
    almacenDelModulo = existente;
    return existente;
  }

  const creado = crearAlmacenS3(leerConfiguracion());
  almacenDelModulo = creado;
  if (process.env.NODE_ENV !== 'production') {
    globalParaAlmacen.__almacenObjetos = creado;
  }
  return creado;
}
