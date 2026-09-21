// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock('@auth/drizzle-adapter', () => ({
  DrizzleAdapter: vi.fn(() => ({})),
}));

vi.mock('@/db', () => ({
  db: {},
}));

import { configuracionAuth } from '@/auth';
import { evaluarSesionPersistida } from '@/lib/auth/workspace';

describe('seguridad de la sesión: passwordHash no expuesto', () => {
  it('el callback de sesión no incluye passwordHash en el objeto devuelto al cliente', () => {
    const callbackSession = configuracionAuth.callbacks?.session;
    expect(callbackSession).toBeDefined();

    const mockSession = {
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    };

    const mockUser = {
      id: 'usr_test_123',
      name: 'Usuario Test',
      email: 'test@typeapromo.local',
      image: null,
      slackUserId: null,
      slackTeamId: null,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$secreto-hash',
      emailVerified: new Date(),
      isActive: true,
    };

    // Invocamos el callback session
    const fn = callbackSession as unknown as (params: {
      session: typeof mockSession;
      user: typeof mockUser;
    }) => { user: Record<string, unknown> };
    const resultado = fn({
      session: mockSession,
      user: mockUser,
    });

    expect(resultado).toBeDefined();
    expect(resultado.user).toBeDefined();
    expect(resultado.user.id).toBe('usr_test_123');
    expect(resultado.user.email).toBe('test@typeapromo.local');
    expect(resultado.user.emailVerified).toEqual(mockUser.emailVerified);
    expect(resultado.user.isActive).toBe(true);

    // Verificación crítica: passwordHash NO debe existir en el objeto resultante
    expect(resultado.user).not.toHaveProperty('passwordHash');
    expect(resultado.user.passwordHash).toBeUndefined();
    expect(Object.keys(resultado.user)).not.toContain('passwordHash');
  });

  it('evaluarSesionPersistida autoriza al usuario verificado sin requerir passwordHash en la sesión', () => {
    const sesionCliente = {
      slackUserId: null,
      slackTeamId: null,
      emailVerified: new Date(),
      isActive: true,
    };

    const veredicto = evaluarSesionPersistida(
      sesionCliente,
      null, // Sin Slack configurado
      { bypassActivo: false },
    );

    expect(veredicto).toEqual({ permitido: true, teamId: null });
  });

  it('evaluarSesionPersistida deniega el acceso a un usuario verificado inactivo', () => {
    const sesionInactiva = {
      slackUserId: null,
      slackTeamId: null,
      emailVerified: new Date(),
      isActive: false,
    };

    const veredicto = evaluarSesionPersistida(
      sesionInactiva,
      null,
      { bypassActivo: false },
    );

    expect(veredicto).toEqual({ permitido: false, motivo: 'cuenta-desactivada' });
  });
});
