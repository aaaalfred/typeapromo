/**
 * Almacenamiento de objetos S3-compatible (MinIO en local, Cloudflare R2 en
 * producción).
 *
 *   import { almacen, CACHE_INMUTABLE } from '@/lib/storage';
 *
 * **Solo servidor.** Importar esto desde un componente de cliente hace fallar
 * `leerConfiguracion()` a propósito: ver `./entorno`.
 */

export * from './entorno';
export * from './tipos';
export { almacen, crearAlmacenS3, lotesDeClaves } from './s3';
