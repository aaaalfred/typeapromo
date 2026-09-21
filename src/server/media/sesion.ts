/**
 * Guard de sesión para las rutas de media.
 *
 * Reutiliza íntegramente la capa de autenticación de la fase 1: la sesión la lee
 * `sesionActual()` y el veredicto de workspace lo da `evaluarSesion()`, las dos
 * de `@/lib/auth/sesion`. Aquí no se decide nada sobre quién entra.
 *
 * Lo único que cambia es **cómo se comunica el rechazo**. `requiereSesion()`
 * llama a `redirect()`, que en una página es exactamente lo que se quiere y en
 * un endpoint JSON produce un `307` hacia HTML: el componente de subida recibiría
 * una redirección donde espera un cuerpo con la URL prefirmada, y el error
 * llegaría al usuario como un fallo de parseo. Por eso estas rutas usan las
 * mismas dos funciones y lanzan `MediaError` 401, que el borde HTTP serializa
 * igual que cualquier otro error de dominio.
 */

import { evaluarSesion, sesionActual } from '@/lib/auth/sesion';

import { noAutenticado } from './errores';

/** Usuario autenticado que ejecuta la operación. */
export interface ActorMedia {
  /** `sesion.user.id` — garantizado por la estrategia de sesión en base de datos. */
  readonly id: string;
  readonly email: string | null;
}

/**
 * Exige sesión válida del workspace autorizado.
 *
 * Todos los miembros del workspace tienen los mismos permisos sobre cualquier
 * formulario (PR.md · «Panel del equipo»), así que no hay comprobación de
 * propiedad sobre el activo: quien puede editar un formulario puede gestionar
 * sus imágenes. La autoridad de borrado son las referencias, no `created_by`.
 */
export async function requiereActorMedia(): Promise<ActorMedia> {
  const sesion = await sesionActual();
  if (sesion?.user === undefined) throw noAutenticado();

  const veredicto = evaluarSesion(sesion);
  if (!veredicto.permitido) throw noAutenticado();

  return { id: sesion.user.id, email: sesion.user.email ?? null };
}
