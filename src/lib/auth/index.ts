/**
 * Punto de entrada de la capa de autenticación.
 *
 * Solo reexporta los módulos **puros**, los que puede importar cualquiera sin
 * arrastrar la base de datos: `src/proxy.ts` depende de esto.
 *
 * Lo demás se importa por su ruta, porque tiene efectos:
 *
 *   import { requiereSesion } from '@/lib/auth/sesion';           // lee la sesión
 *   import { FranjaAvisoBypass } from '@/lib/auth/aviso-bypass';  // componente
 *   import { crearSesionDeAccesoDirecto } from '@/lib/auth/acceso-directo';
 */

export * from './constantes';
export * from './cookies';
export * from './entorno';
export * from './rutas';
export * from './workspace';
