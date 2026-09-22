/**
 * Clasificación de rutas y saneado de destinos.
 *
 * Módulo **puro**: lo importa `src/proxy.ts`, que se ejecuta antes de que exista
 * cualquier contexto de aplicación, así que no puede arrastrar la base de datos
 * ni Auth.js.
 */

/** Página de inicio de sesión. */
export const RUTA_LOGIN = '/iniciar-sesion';
/** Página de acceso denegado. */
export const RUTA_ACCESO_DENEGADO = '/acceso-denegado';
/** Página de registro / crear cuenta. */
export const RUTA_REGISTRO = '/crear-cuenta';
/** Página de verificación de correo. */
export const RUTA_VERIFICAR_CORREO = '/verificar-correo';
/** Página de recuperación y restablecimiento de contraseña. */
export const RUTA_RESTABLECER_CONTRASENA = '/restablecer-contrasena';
/** Página para solicitar reenvío de correo de verificación. */
export const RUTA_REENVIAR_VERIFICACION = '/reenviar-verificacion';
/** Página de información sobre planes o características en construcción. */
export const RUTA_PROXIMAMENTE = '/proximamente';
/** Raíz del panel autenticado. Todo lo que cuelga de aquí está protegido. */
export const RUTA_PANEL = '/app';

/** Query param con la ruta a la que volver tras iniciar sesión. */
export const PARAM_DESTINO = 'destino';
/** Query param con el motivo de rechazo en `/acceso-denegado`. */
export const PARAM_MOTIVO = 'motivo';

/**
 * Rutas públicas exactas. `/` es la portada y `/api/health` debe responder sin
 * sesión para que la sonda del contenedor y la auditoría externa funcionen.
 */
const PUBLICAS_EXACTAS: ReadonlySet<string> = new Set(['/', '/api/health']);

/**
 * Prefijos públicos. Se comparan por segmento completo: `/f` cubre `/f/mi-slug`
 * pero no `/formularios`.
 */
const PREFIJOS_PUBLICOS: readonly string[] = [
  '/f',
  '/api/auth',
  '/api/stripe',
  RUTA_LOGIN,
  RUTA_ACCESO_DENEGADO,
  RUTA_REGISTRO,
  RUTA_VERIFICAR_CORREO,
  RUTA_RESTABLECER_CONTRASENA,
  RUTA_REENVIAR_VERIFICACION,
  RUTA_PROXIMAMENTE,
];

/** Normaliza quitando la barra final, salvo en la raíz. */
function normalizarRuta(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function empiezaPorSegmento(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

/** `true` para las rutas que nunca exigen sesión. */
export function esRutaPublica(pathname: string): boolean {
  const ruta = normalizarRuta(pathname);
  if (PUBLICAS_EXACTAS.has(ruta)) return true;
  return PREFIJOS_PUBLICOS.some((prefijo) => empiezaPorSegmento(ruta, prefijo));
}

/** `true` para `/app` y todo lo que cuelga de él. */
export function esRutaProtegida(pathname: string): boolean {
  return empiezaPorSegmento(normalizarRuta(pathname), RUTA_PANEL);
}

/**
 * Sanea el destino post-login. Solo se admiten rutas internas: cualquier URL
 * absoluta, esquema o barra doble (`//evil.com`, que el navegador interpreta
 * como protocolo relativo) se descarta y se cae al panel.
 */
export function normalizarDestino(destino: unknown): string {
  if (typeof destino !== 'string') return RUTA_PANEL;

  const valor = destino.trim();
  if (!valor.startsWith('/')) return RUTA_PANEL;
  if (valor.startsWith('//') || valor.startsWith('/\\')) return RUTA_PANEL;
  if (valor.includes('\\')) return RUTA_PANEL;

  // Volver a rutas de autenticación tras entrar sería confuso o un bucle.
  const soloRuta = normalizarRuta(valor.split('?')[0] ?? '');
  const esRutaAuth = [
    RUTA_LOGIN,
    RUTA_ACCESO_DENEGADO,
    RUTA_REGISTRO,
    RUTA_VERIFICAR_CORREO,
    RUTA_RESTABLECER_CONTRASENA,
    RUTA_REENVIAR_VERIFICACION,
  ].some((ruta) => empiezaPorSegmento(soloRuta, ruta));

  if (esRutaAuth) {
    return RUTA_PANEL;
  }

  return valor;
}

/** Construye la URL de login que recuerda a dónde quería ir el usuario. */
export function urlDeLogin(destino?: string | null): string {
  const limpio = normalizarDestino(destino);
  if (limpio === RUTA_PANEL) return RUTA_LOGIN;
  return `${RUTA_LOGIN}?${PARAM_DESTINO}=${encodeURIComponent(limpio)}`;
}

/** Construye la URL de acceso denegado con el motivo. */
export function urlDeAccesoDenegado(motivo: string): string {
  return `${RUTA_ACCESO_DENEGADO}?${PARAM_MOTIVO}=${encodeURIComponent(motivo)}`;
}
