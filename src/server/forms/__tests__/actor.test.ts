import type { Session } from 'next-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireActor, resolveActor } from '../actor';
import { isFormsError } from '../errors';

/**
 * El seam de identidad debe **fallar cerrado**: sin sesión válida no hay actor y
 * las rutas responden 401, nunca una redirección al login (un cliente de API no
 * sabría distinguirla de una respuesta legítima).
 *
 * Se sustituye el módulo de sesión y la base de datos para que los tests
 * unitarios no requieran PostgreSQL ni variables de entorno.
 */
vi.mock('@/lib/auth/sesion', () => ({
  sesionActual: vi.fn(),
  evaluarSesion: vi.fn(),
}));

let membresiaMock: { workspaceId: string; role: 'owner' | 'member' } | null = {
  workspaceId: '00000000-0000-0000-0000-000000000001',
  role: 'owner',
};

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockImplementation(() => Promise.resolve(membresiaMock ? [membresiaMock] : [])),
        })),
      })),
    })),
  },
}));

const { evaluarSesion, sesionActual } = await import('@/lib/auth/sesion');

const sesionValida = {
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Ana',
    email: 'ana@equipo.test',
    image: null,
    slackUserId: 'U123',
    slackTeamId: 'T123',
  },
  expires: '2099-01-01T00:00:00.000Z',
} as unknown as Session;

beforeEach(() => {
  vi.mocked(sesionActual).mockReset();
  vi.mocked(evaluarSesion).mockReset();
  vi.mocked(evaluarSesion).mockReturnValue({ permitido: true, teamId: 'T123' });
  membresiaMock = {
    workspaceId: '00000000-0000-0000-0000-000000000001',
    role: 'owner',
  };
});

describe('resolveActor', () => {
  it('no devuelve actor cuando no hay sesión', async () => {
    vi.mocked(sesionActual).mockResolvedValue(null);
    await expect(resolveActor()).resolves.toBeNull();
  });

  it('no devuelve actor cuando la sesión no trae identificador', async () => {
    vi.mocked(sesionActual).mockResolvedValue({ user: {} } as unknown as Session);
    await expect(resolveActor()).resolves.toBeNull();
  });

  it('no devuelve actor cuando el workspace ya no está autorizado', async () => {
    vi.mocked(sesionActual).mockResolvedValue(sesionValida);
    vi.mocked(evaluarSesion).mockReturnValue({ permitido: false, motivo: 'workspace-ajeno' });

    await expect(resolveActor()).resolves.toBeNull();
  });

  it('no devuelve actor si el usuario no tiene membresía en ningún workspace', async () => {
    vi.mocked(sesionActual).mockResolvedValue(sesionValida);
    membresiaMock = null;

    await expect(resolveActor()).resolves.toBeNull();
  });

  it('reevalúa el workspace en cada petición, no solo al iniciar sesión', async () => {
    vi.mocked(sesionActual).mockResolvedValue(sesionValida);

    await resolveActor();

    expect(vi.mocked(evaluarSesion)).toHaveBeenCalledWith(sesionValida);
  });

  it('devuelve el actor de una sesión válida con workspace y rol', async () => {
    vi.mocked(sesionActual).mockResolvedValue(sesionValida);

    await expect(resolveActor()).resolves.toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'ana@equipo.test',
      name: 'Ana',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
    });
  });

  it('normaliza a null los campos opcionales ausentes conservando workspaceId', async () => {
    vi.mocked(sesionActual).mockResolvedValue({
      user: { id: '22222222-2222-2222-2222-222222222222' },
    } as unknown as Session);

    await expect(resolveActor()).resolves.toEqual({
      id: '22222222-2222-2222-2222-222222222222',
      email: null,
      name: null,
      workspaceId: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
    });
  });
});

describe('requireActor', () => {
  it('lanza un error de dominio 401 en lugar de dejar pasar', async () => {
    vi.mocked(sesionActual).mockResolvedValue(null);

    const error: unknown = await requireActor().catch((reason: unknown) => reason);

    expect(isFormsError(error)).toBe(true);
    if (isFormsError(error)) {
      expect(error.code).toBe('NO_AUTENTICADO');
      expect(error.status).toBe(401);
      expect(error.message).toMatch(/iniciar sesión/i);
    }
  });

  it('devuelve el actor cuando la sesión es válida', async () => {
    vi.mocked(sesionActual).mockResolvedValue(sesionValida);

    await expect(requireActor()).resolves.toMatchObject({
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
    });
  });
});
