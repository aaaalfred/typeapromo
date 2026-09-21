/**
 * Lectura del entorno relacionada con autenticación.
 *
 * Es el único sitio del módulo que toca `process.env`: el resto de la lógica es
 * pura y recibe los valores por parámetro, de modo que se pueda testear sin
 * manipular variables globales.
 */

/**
 * Modo de autenticación efectivo. `dev-bypass` es deliberadamente observable
 * desde fuera (`GET /api/health`), protección 2 de PLAN.md.
 */
export type ModoAuth = 'dev-bypass' | 'slack';

export interface CredencialesSlack {
  clientId: string;
  clientSecret: string;
}

function leerVariable(nombre: string): string | null {
  const valor = process.env[nombre];
  if (typeof valor !== 'string') return null;
  const recortado = valor.trim();
  return recortado === '' ? null : recortado;
}

/**
 * `true` únicamente con `AUTH_DEV_BYPASS=1`.
 *
 * La comparación es exacta contra `'1'` a propósito: `'true'`, `'0'` o cualquier
 * otro valor dejan el bypass apagado. La variable no existe ni en el compose ni
 * en producción (PLAN.md · «Seguridad del bypass», protección 1).
 */
export function esBypassActivo(): boolean {
  return process.env.AUTH_DEV_BYPASS === '1';
}

/** Workspace autorizado (`SLACK_TEAM_ID`), o `null` si no está configurado. */
export function teamIdAutorizado(): string | null {
  return leerVariable('SLACK_TEAM_ID');
}

/**
 * Credenciales de la aplicación de Slack, o `null` si falta alguna. Sin ellas el
 * provider no se registra: en desarrollo se entra por el acceso directo.
 */
export function credencialesSlack(): CredencialesSlack | null {
  const clientId = leerVariable('SLACK_CLIENT_ID');
  const clientSecret = leerVariable('SLACK_CLIENT_SECRET');
  if (clientId === null || clientSecret === null) return null;
  return { clientId, clientSecret };
}

/** `true` si el provider de Slack está registrado. */
export function esSlackConfigurado(): boolean {
  return credencialesSlack() !== null;
}

/** Modo mostrado por `/api/health` y por la franja de aviso. */
export function modoAuth(): ModoAuth {
  return esBypassActivo() ? 'dev-bypass' : 'slack';
}
