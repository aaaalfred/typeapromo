/**
 * Lectura y validación de la configuración del almacenamiento S3-compatible.
 *
 * **Las credenciales solo existen en el servidor.** Ninguna de estas variables
 * lleva el prefijo `NEXT_PUBLIC_`, así que Next nunca las incrusta en el bundle
 * del navegador: en un componente de cliente valdrían `undefined`. Como red de
 * seguridad adicional, `leerConfiguracion()` se niega a ejecutarse si detecta un
 * `window`, de modo que un import accidental desde el cliente falla ruidosamente
 * en vez de degradar en silencio.
 *
 * El guard vive dentro de la función y no en el cuerpo del módulo a propósito:
 * el entorno de tests es `jsdom` y `window` existe, pero los tests puros de
 * claves y formatos no llaman aquí.
 */

/** Configuración efectiva del almacén. Todos los campos obligatorios. */
export interface ConfiguracionAlmacen {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketStaging: string;
  bucketPublico: string;
  /** Base de lectura pública (`MEDIA_PUBLIC_BASE_URL`), sin barra final. */
  baseUrlPublica: string;
  /**
   * MinIO exige rutas `endpoint/bucket/clave`; R2 usa el bucket en el host.
   * Conmutable con `S3_FORCE_PATH_STYLE` (PLAN.md · §2.10).
   */
  forcePathStyle: boolean;
}

/** R2 ignora la región pero el SDK exige una; `auto` es la que documenta Cloudflare. */
const REGION_POR_DEFECTO = 'auto';

/** Variables sin las que el pipeline de media no puede funcionar. */
const VARIABLES_REQUERIDAS = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_STAGING',
  'R2_BUCKET_PUBLIC',
  'MEDIA_PUBLIC_BASE_URL',
] as const;

function leerVariable(nombre: string): string {
  const valor = process.env[nombre];
  return typeof valor === 'string' ? valor.trim() : '';
}

/** `true` solo con `1` o `true`; cualquier otra cosa deja el estilo de R2. */
export function interpretarForcePathStyle(valor: string | undefined): boolean {
  const normalizado = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  return normalizado === '1' || normalizado === 'true';
}

/** Quita las barras finales para poder concatenar claves sin duplicarlas. */
export function normalizarBaseUrl(valor: string): string {
  return valor.replace(/\/+$/, '');
}

/**
 * `true` si están todas las variables. Lo usan los tests de integración para
 * saltarse solos cuando no hay MinIO, y `/api/health` podría usarlo igual.
 */
export function hayConfiguracionDeAlmacen(): boolean {
  return VARIABLES_REQUERIDAS.every((nombre) => leerVariable(nombre) !== '');
}

/** Nombres de las variables que faltan, en orden de declaración. */
export function variablesDeAlmacenAusentes(): string[] {
  return VARIABLES_REQUERIDAS.filter((nombre) => leerVariable(nombre) === '');
}

/**
 * Configuración completa o error. Falla cerrado: sin credenciales no se
 * construye un cliente «a medias» que reviente más tarde con un error del SDK.
 */
export function leerConfiguracion(): ConfiguracionAlmacen {
  if (typeof window !== 'undefined') {
    throw new Error(
      'La configuración de almacenamiento es exclusiva del servidor: no importes @/lib/storage desde un componente de cliente.',
    );
  }

  const ausentes = variablesDeAlmacenAusentes();
  if (ausentes.length > 0) {
    throw new Error(
      `Falta la configuración de almacenamiento: ${ausentes.join(', ')}.`,
    );
  }

  return {
    endpoint: leerVariable('R2_ENDPOINT'),
    region: leerVariable('R2_REGION') || REGION_POR_DEFECTO,
    accessKeyId: leerVariable('R2_ACCESS_KEY_ID'),
    secretAccessKey: leerVariable('R2_SECRET_ACCESS_KEY'),
    bucketStaging: leerVariable('R2_BUCKET_STAGING'),
    bucketPublico: leerVariable('R2_BUCKET_PUBLIC'),
    baseUrlPublica: normalizarBaseUrl(leerVariable('MEDIA_PUBLIC_BASE_URL')),
    forcePathStyle: interpretarForcePathStyle(process.env.S3_FORCE_PATH_STYLE),
  };
}
