/**
 * Acceso al almacén desde la capa de servicio.
 *
 * Envuelve `almacen()` para dos cosas: traducir «faltan variables de entorno» a
 * un `MediaError` 503 con mensaje limpio —en vez de dejar salir el `Error` del
 * constructor, que lleva nombres de variables al cliente— y permitir inyectar un
 * doble en los tests sin mockear el módulo entero.
 */

import { almacen as almacenReal, variablesDeAlmacenAusentes } from '@/lib/storage';
import type { AlmacenObjetos } from '@/lib/storage';

import { almacenNoConfigurado } from './errores';

let almacenInyectado: AlmacenObjetos | null = null;

/** Sustituye el almacén del proceso. Solo para tests. */
export function inyectarAlmacen(doble: AlmacenObjetos | null): void {
  almacenInyectado = doble;
}

export function obtenerAlmacen(): AlmacenObjetos {
  if (almacenInyectado !== null) return almacenInyectado;

  const ausentes = variablesDeAlmacenAusentes();
  if (ausentes.length > 0) throw almacenNoConfigurado(ausentes);

  return almacenReal();
}
