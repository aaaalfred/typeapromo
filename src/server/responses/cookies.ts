/**
 * Cookie de sesión de respuesta.
 *
 * Módulo **puro**: decide nombre y atributos, pero no escribe nada. Quien la
 * pone es el borde HTTP (`src/app/api/public`), y quien la lee es el componente
 * de servidor de `/f/:slug`.
 *
 * Atributos, y por qué cada uno:
 *
 * - `HttpOnly`: el token no debe ser legible desde JavaScript. Es lo que hace
 *   que un XSS en una imagen de terceros no se lleve las sesiones.
 * - `SameSite=Lax`: el formulario se abre navegando a su enlace, que es
 *   exactamente lo que `Lax` permite. `Strict` rompería la reanudación al llegar
 *   desde un correo o desde Slack; `None` abriría la puerta a peticiones
 *   entre sitios sin ganar nada.
 * - `Path=/`: la cookie tiene que viajar tanto a `/f/:slug` como a
 *   `/api/public/**`.
 * - `Secure` en cuanto la aplicación se sirve por HTTPS. En desarrollo sobre
 *   `http://localhost` no se puede activar, porque el navegador descartaría la
 *   cookie y la reanudación no funcionaría nunca en local.
 */

/** Prefijo del nombre. El identificador del formulario lo completa. */
export const PREFIJO_COOKIE_SESION = 'tp_sesion_';

/** 30 días. Pasado ese plazo el enlace sigue funcionando, pero empieza de cero. */
export const MAX_EDAD_COOKIE_SEGUNDOS = 60 * 60 * 24 * 30;

/**
 * Una cookie **por formulario**.
 *
 * Con una sola cookie global, responder a un segundo formulario pisaría la
 * sesión del primero y la reanudación dejaría de funcionar en cuanto alguien
 * tuviera dos pestañas abiertas. El identificador del formulario es estable
 * (el slug puede renombrarse) y no revela nada: es el mismo UUID que ya está en
 * el HTML de la página.
 */
export function nombreCookieSesion(formId: string): string {
  return `${PREFIJO_COOKIE_SESION}${formId}`;
}

/** `true` si el nombre corresponde a una cookie de sesión de respuesta. */
export function esCookieDeSesion(nombre: string): boolean {
  return nombre.startsWith(PREFIJO_COOKIE_SESION);
}

/** Atributos de la cookie, en la forma que espera `NextResponse.cookies.set`. */
export interface OpcionesCookieSesion {
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly path: '/';
  readonly secure: boolean;
  readonly maxAge: number;
}

/**
 * `Secure` se decide por la URL pública configurada, no por `NODE_ENV`: un
 * despliegue de prueba en HTTPS también debe marcarla, y un `next start` local
 * sobre HTTP no puede.
 */
export function debeSerSegura(baseUrl: string | undefined): boolean {
  if (baseUrl === undefined || baseUrl === '') return false;
  return baseUrl.trim().toLowerCase().startsWith('https://');
}

export function opcionesCookieSesion(segura: boolean): OpcionesCookieSesion {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: segura,
    maxAge: MAX_EDAD_COOKIE_SEGUNDOS,
  };
}

/** Atributos para borrar la cookie (sesión completada o inexistente). */
export function opcionesBorradoCookie(segura: boolean): OpcionesCookieSesion {
  return { ...opcionesCookieSesion(segura), maxAge: 0 };
}
