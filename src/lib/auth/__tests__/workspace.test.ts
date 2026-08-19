import { describe, expect, it } from 'vitest';

import {
  CLAIM_TEAM_ID,
  CLAIM_USER_ID,
  esMotivoRechazo,
  evaluarPerfilSlack,
  evaluarSesionPersistida,
  evaluarWorkspace,
  extraerClaimsSlack,
  MENSAJE_RECHAZO_DESCONOCIDO,
  MENSAJES_RECHAZO,
  mensajeDeRechazo,
} from '../workspace';

const TEAM_AUTORIZADO = 'T0123ABCDEF';
const TEAM_AJENO = 'T9999ZZZZZZ';

function perfilSlack(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: 'U0123ABCDEF',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    picture: 'https://example.com/ada.png',
    [CLAIM_USER_ID]: 'U0123ABCDEF',
    [CLAIM_TEAM_ID]: TEAM_AUTORIZADO,
    ...extra,
  };
}

describe('evaluarWorkspace', () => {
  it('permite el workspace configurado', () => {
    expect(evaluarWorkspace(TEAM_AUTORIZADO, TEAM_AUTORIZADO)).toEqual({
      permitido: true,
      teamId: TEAM_AUTORIZADO,
    });
  });

  it('ignora los espacios sobrantes a ambos lados de la comparación', () => {
    expect(evaluarWorkspace(`  ${TEAM_AUTORIZADO}  `, ` ${TEAM_AUTORIZADO} `)).toEqual({
      permitido: true,
      teamId: TEAM_AUTORIZADO,
    });
  });

  it('rechaza un workspace ajeno aunque la autenticación sea correcta', () => {
    expect(evaluarWorkspace(TEAM_AJENO, TEAM_AUTORIZADO)).toEqual({
      permitido: false,
      motivo: 'workspace-ajeno',
    });
  });

  it('distingue mayúsculas y minúsculas: un identificador con otra caja no es el mismo', () => {
    expect(evaluarWorkspace(TEAM_AUTORIZADO.toLowerCase(), TEAM_AUTORIZADO)).toEqual({
      permitido: false,
      motivo: 'workspace-ajeno',
    });
  });

  it.each([
    ['ausente', undefined],
    ['nulo', null],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['de otro tipo', 42],
  ])('rechaza cuando el claim está %s', (_caso, claim) => {
    expect(evaluarWorkspace(claim, TEAM_AUTORIZADO)).toEqual({
      permitido: false,
      motivo: 'claim-ausente',
    });
  });

  it.each([
    ['ausente', undefined],
    ['nulo', null],
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('falla cerrado cuando SLACK_TEAM_ID está %s', (_caso, configurado) => {
    expect(evaluarWorkspace(TEAM_AUTORIZADO, configurado)).toEqual({
      permitido: false,
      motivo: 'workspace-no-configurado',
    });
  });

  it('prioriza la falta de configuración sobre la falta de claim', () => {
    // Sin SLACK_TEAM_ID no hay nada contra lo que comparar: el problema es del
    // servidor, no de quien intenta entrar, y el mensaje debe decir eso.
    expect(evaluarWorkspace(undefined, undefined)).toEqual({
      permitido: false,
      motivo: 'workspace-no-configurado',
    });
  });
});

describe('extraerClaimsSlack', () => {
  it('lee los dos claims con espacio de nombres de Slack', () => {
    expect(extraerClaimsSlack(perfilSlack())).toEqual({
      teamId: TEAM_AUTORIZADO,
      userId: 'U0123ABCDEF',
    });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['una cadena', 'no soy un perfil'],
    ['un número', 7],
  ])('devuelve claims nulos si el perfil es %s', (_caso, perfil) => {
    expect(extraerClaimsSlack(perfil)).toEqual({ teamId: null, userId: null });
  });

  it('trata como ausente un claim que no es una cadena no vacía', () => {
    expect(extraerClaimsSlack(perfilSlack({ [CLAIM_TEAM_ID]: '  ', [CLAIM_USER_ID]: 123 }))).toEqual(
      { teamId: null, userId: null },
    );
  });
});

describe('evaluarPerfilSlack', () => {
  it('permite el perfil del workspace autorizado', () => {
    expect(evaluarPerfilSlack(perfilSlack(), TEAM_AUTORIZADO)).toEqual({
      permitido: true,
      teamId: TEAM_AUTORIZADO,
    });
  });

  it('rechaza el perfil de otro workspace', () => {
    expect(evaluarPerfilSlack(perfilSlack({ [CLAIM_TEAM_ID]: TEAM_AJENO }), TEAM_AUTORIZADO)).toEqual(
      { permitido: false, motivo: 'workspace-ajeno' },
    );
  });

  it('rechaza un perfil sin el claim del workspace', () => {
    const { [CLAIM_TEAM_ID]: _omitido, ...sinTeam } = perfilSlack();
    expect(evaluarPerfilSlack(sinTeam, TEAM_AUTORIZADO)).toEqual({
      permitido: false,
      motivo: 'claim-ausente',
    });
  });
});

describe('evaluarSesionPersistida', () => {
  const opciones = { bypassActivo: false };

  it('permite una sesión cuyo workspace persistido sigue siendo el autorizado', () => {
    expect(
      evaluarSesionPersistida(
        { slackUserId: 'U1', slackTeamId: TEAM_AUTORIZADO },
        TEAM_AUTORIZADO,
        opciones,
      ),
    ).toEqual({ permitido: true, teamId: TEAM_AUTORIZADO });
  });

  it('rechaza una sesión antigua emitida para otro workspace', () => {
    expect(
      evaluarSesionPersistida({ slackUserId: 'U1', slackTeamId: TEAM_AJENO }, TEAM_AUTORIZADO, opciones),
    ).toEqual({ permitido: false, motivo: 'workspace-ajeno' });
  });

  it('rechaza una sesión de Slack sin workspace guardado', () => {
    expect(
      evaluarSesionPersistida({ slackUserId: 'U1', slackTeamId: null }, TEAM_AUTORIZADO, opciones),
    ).toEqual({ permitido: false, motivo: 'claim-ausente' });
  });

  it('rechaza una sesión sin identidad de Slack cuando el bypass está apagado', () => {
    expect(
      evaluarSesionPersistida({ slackUserId: null, slackTeamId: null }, TEAM_AUTORIZADO, opciones),
    ).toEqual({ permitido: false, motivo: 'claim-ausente' });
  });

  it('permite la sesión de acceso directo solo mientras el bypass siga activo', () => {
    expect(
      evaluarSesionPersistida({ slackUserId: null, slackTeamId: null }, TEAM_AUTORIZADO, {
        bypassActivo: true,
      }),
    ).toEqual({ permitido: true, teamId: null });
  });

  it('el bypass no salva a una sesión de Slack de otro workspace', () => {
    expect(
      evaluarSesionPersistida({ slackUserId: 'U1', slackTeamId: TEAM_AJENO }, TEAM_AUTORIZADO, {
        bypassActivo: true,
      }),
    ).toEqual({ permitido: false, motivo: 'workspace-ajeno' });
  });
});

describe('mensajes', () => {
  it('reconoce los motivos conocidos', () => {
    expect(esMotivoRechazo('workspace-ajeno')).toBe(true);
    expect(esMotivoRechazo('otra-cosa')).toBe(false);
    expect(esMotivoRechazo(undefined)).toBe(false);
  });

  it('devuelve un mensaje propio para cada motivo', () => {
    expect(mensajeDeRechazo('workspace-ajeno')).toBe(MENSAJES_RECHAZO['workspace-ajeno']);
    expect(mensajeDeRechazo('claim-ausente')).toBe(MENSAJES_RECHAZO['claim-ausente']);
    expect(mensajeDeRechazo('workspace-no-configurado')).toBe(
      MENSAJES_RECHAZO['workspace-no-configurado'],
    );
  });

  it('cae en un texto genérico ante un motivo desconocido', () => {
    expect(mensajeDeRechazo('AccessDenied')).toBe(MENSAJE_RECHAZO_DESCONOCIDO);
    expect(mensajeDeRechazo(null)).toBe(MENSAJE_RECHAZO_DESCONOCIDO);
  });

  it('ningún mensaje filtra detalles técnicos del proveedor', () => {
    for (const { detalle } of Object.values(MENSAJES_RECHAZO)) {
      expect(detalle).not.toMatch(/token|oauth|id_token/i);
    }
  });
});
