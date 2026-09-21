/**
 * Guard de workspace de Slack.
 *
 * Lógica **pura y sin dependencias**: no lee `process.env`, no toca la base de
 * datos y no importa nada de Auth.js. Todo lo que decide quién entra vive aquí
 * para que sea trivialmente testeable (PLAN.md · fase 1).
 *
 * La comparación es directa contra `SLACK_TEAM_ID` porque el producto asume un
 * único workspace, plan Free, sin Enterprise Grid (PLAN.md · §1).
 */

/** Claim OIDC de Slack con el identificador del workspace. */
export const CLAIM_TEAM_ID = 'https://slack.com/team_id';
/** Claim OIDC de Slack con el identificador del usuario dentro del workspace. */
export const CLAIM_USER_ID = 'https://slack.com/user_id';

/** Motivos por los que se deniega el acceso. Se propagan a `/acceso-denegado`. */
export type MotivoRechazo =
  /** El servidor no tiene `SLACK_TEAM_ID`: se falla cerrado, nunca abierto. */
  | 'workspace-no-configurado'
  /** Slack no devolvió el claim del workspace en el perfil. */
  | 'claim-ausente'
  /** La cuenta es válida, pero pertenece a otro workspace. */
  | 'workspace-ajeno';

export interface ClaimsSlack {
  /** `https://slack.com/team_id`, o `null` si no vino o vino vacío. */
  teamId: string | null;
  /** `https://slack.com/user_id`, o `null` si no vino o vino vacío. */
  userId: string | null;
}

/** Identidad de Slack tal y como queda persistida en `users`. */
export interface IdentidadSlackPersistida {
  slackUserId: string | null;
  slackTeamId: string | null;
}

export type ResultadoGuard =
  | { permitido: true; teamId: string | null }
  | { permitido: false; motivo: MotivoRechazo };

const MOTIVOS: readonly MotivoRechazo[] = [
  'workspace-no-configurado',
  'claim-ausente',
  'workspace-ajeno',
];

/** Textos de rechazo, en español y sin jerga de OAuth para el usuario final. */
export const MENSAJES_RECHAZO: Record<MotivoRechazo, { titulo: string; detalle: string }> = {
  'workspace-no-configurado': {
    titulo: 'El acceso con Slack no está configurado',
    detalle:
      'El servidor no tiene definido el workspace autorizado (SLACK_TEAM_ID), así que no puede comprobar a qué equipo perteneces. Avisa a quien administre la instalación.',
  },
  'claim-ausente': {
    titulo: 'Slack no ha indicado tu workspace',
    detalle:
      'La respuesta de Slack no incluye el identificador del equipo, de modo que no es posible verificar que perteneces al workspace autorizado. Vuelve a intentarlo y, si persiste, revisa los permisos de la aplicación de Slack.',
  },
  'workspace-ajeno': {
    titulo: 'Tu cuenta pertenece a otro workspace',
    detalle:
      'La autenticación con Slack ha funcionado, pero esta herramienta solo admite miembros del workspace autorizado. Entra con una cuenta de ese workspace.',
  },
};

/** Texto genérico para errores que no son un rechazo de workspace conocido. */
export const MENSAJE_RECHAZO_DESCONOCIDO = {
  titulo: 'No se ha podido completar el acceso',
  detalle:
    'La autenticación no ha terminado correctamente. Vuelve a intentarlo; si el problema continúa, avisa a quien administre la instalación.',
} as const;

/** `true` si `valor` es uno de los motivos conocidos. */
export function esMotivoRechazo(valor: unknown): valor is MotivoRechazo {
  return typeof valor === 'string' && (MOTIVOS as readonly string[]).includes(valor);
}

/** Mensaje asociado a un motivo, con texto genérico de reserva. */
export function mensajeDeRechazo(motivo: unknown): { titulo: string; detalle: string } {
  return esMotivoRechazo(motivo) ? MENSAJES_RECHAZO[motivo] : MENSAJE_RECHAZO_DESCONOCIDO;
}

function leerCadena(objeto: Record<string, unknown>, clave: string): string | null {
  const valor = objeto[clave];
  if (typeof valor !== 'string') return null;
  const recortado = valor.trim();
  return recortado === '' ? null : recortado;
}

/**
 * Extrae los claims de Slack de un perfil OIDC sin confiar en su forma.
 * Acepta `unknown` a propósito: el perfil llega de la red.
 */
export function extraerClaimsSlack(perfil: unknown): ClaimsSlack {
  if (typeof perfil !== 'object' || perfil === null) {
    return { teamId: null, userId: null };
  }
  const objeto = perfil as Record<string, unknown>;
  return {
    teamId: leerCadena(objeto, CLAIM_TEAM_ID),
    userId: leerCadena(objeto, CLAIM_USER_ID),
  };
}

/**
 * Núcleo del guard: ¿el workspace recibido es el autorizado?
 *
 * Falla cerrado en los dos casos degenerados —sin `SLACK_TEAM_ID` configurado y
 * sin claim en el perfil—: un guard que deja pasar cuando no puede comprobar
 * nada no es un guard.
 *
 * @param teamIdRecibido Claim `https://slack.com/team_id`; `unknown` porque viene de la red.
 * @param teamIdAutorizado Valor de `SLACK_TEAM_ID`.
 */
export function evaluarWorkspace(
  teamIdRecibido: unknown,
  teamIdAutorizado: string | null | undefined,
): ResultadoGuard {
  const autorizado = typeof teamIdAutorizado === 'string' ? teamIdAutorizado.trim() : '';
  if (autorizado === '') {
    return { permitido: false, motivo: 'workspace-no-configurado' };
  }

  const recibido = typeof teamIdRecibido === 'string' ? teamIdRecibido.trim() : '';
  if (recibido === '') {
    return { permitido: false, motivo: 'claim-ausente' };
  }

  if (recibido !== autorizado) {
    return { permitido: false, motivo: 'workspace-ajeno' };
  }

  return { permitido: true, teamId: recibido };
}

/**
 * Guard aplicado al perfil OIDC completo, tal y como lo entrega Slack en el
 * callback de `signIn`.
 */
export function evaluarPerfilSlack(
  perfil: unknown,
  teamIdAutorizado: string | null | undefined,
): ResultadoGuard {
  return evaluarWorkspace(extraerClaimsSlack(perfil).teamId, teamIdAutorizado);
}

/**
 * Guard aplicado a una sesión ya existente.
 *
 * PLAN.md exige que el `team_id` no solo se valide al entrar, sino que se
 * persista en `users`, «de modo que una sesión antigua de otro workspace tampoco
 * pasaría». Esto es lo que hace efectiva esa segunda mitad: se comprueba en cada
 * petición protegida, no solo en el login.
 *
 * El usuario de acceso directo no tiene identidad de Slack (`slackUserId` a
 * `null`); solo se le deja pasar si el bypass sigue activo.
 */
export function evaluarSesionPersistida(
  usuario: IdentidadSlackPersistida,
  teamIdAutorizado: string | null | undefined,
  opciones: { bypassActivo: boolean },
): ResultadoGuard {
  const sinIdentidadSlack =
    typeof usuario.slackUserId !== 'string' || usuario.slackUserId.trim() === '';

  if (sinIdentidadSlack) {
    return opciones.bypassActivo
      ? { permitido: true, teamId: null }
      : { permitido: false, motivo: 'claim-ausente' };
  }

  return evaluarWorkspace(usuario.slackTeamId, teamIdAutorizado);
}
