/**
 * Configuración de Auth.js v5 (fase 1 de PLAN.md).
 *
 * Tres decisiones que no son negociables y conviene no revertir por descuido:
 *
 * 1. **Sesión en base de datos.** `strategy: 'database'` con el adapter de
 *    Drizzle sobre `users` / `auth_accounts` / `auth_sessions`. Con JWT la
 *    sesión vive en la cookie y no habría forma de revocarla ni de reevaluar el
 *    workspace; además PLAN.md exige que sobreviva al reinicio del contenedor.
 * 2. **Provider de Slack solo si hay credenciales.** En desarrollo y CI no las
 *    hay: se entra por el acceso directo (`src/app/api/auth/acceso-directo`).
 * 3. **Endpoints de Slack explícitos.** No se usa el descubrimiento OIDC
 *    (`/.well-known/openid-configuration`): las tres URL están fijadas y
 *    verificadas contra la documentación de Slack en PLAN.md · fase 1. Así el
 *    arranque no depende de una llamada de red y una migración silenciosa de
 *    Slack no cambia a dónde mandamos las credenciales.
 */

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import type { OIDCConfig } from 'next-auth/providers';

import { db } from '@/db';
import { authAccounts, authSessions, users } from '@/db/schema';
import { DURACION_SESION_SEGUNDOS } from '@/lib/auth/constantes';
import { credencialesSlack, teamIdAutorizado } from '@/lib/auth/entorno';
import { RUTA_ACCESO_DENEGADO, RUTA_LOGIN, urlDeAccesoDenegado } from '@/lib/auth/rutas';
import {
  CLAIM_TEAM_ID,
  CLAIM_USER_ID,
  evaluarPerfilSlack,
  extraerClaimsSlack,
} from '@/lib/auth/workspace';

/** Identificador del provider de Slack. */
export const PROVIDER_SLACK = 'slack';

/**
 * Perfil devuelto por `https://slack.com/api/openid.connect.userInfo`.
 * Solo se declaran los claims que consume el producto; el resto llegan y se
 * ignoran.
 */
export interface PerfilSlack {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  [CLAIM_TEAM_ID]?: string;
  [CLAIM_USER_ID]?: string;
  [claim: string]: unknown;
}

declare module 'next-auth' {
  /** Identidad persistida junto al usuario. */
  interface User {
    slackUserId?: string | null;
    slackTeamId?: string | null;
    passwordHash?: string | null;
    emailVerified?: Date | null;
    isActive?: boolean | null;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      slackUserId: string | null;
      slackTeamId: string | null;
      passwordHash?: string | null;
      emailVerified?: Date | null;
      isActive?: boolean;
    };
  }
}

/**
 * Provider OIDC de Slack con los endpoints exactos del flujo «Sign in with
 * Slack». Scopes mínimos: `openid`, `profile` y `email`. No se piden permisos
 * de canales, mensajes, bots ni webhooks.
 */
function proveedorSlack(clientId: string, clientSecret: string): OIDCConfig<PerfilSlack> {
  return {
    id: PROVIDER_SLACK,
    name: 'Slack',
    type: 'oidc',
    issuer: 'https://slack.com',
    clientId,
    clientSecret,
    // Slack no admite PKCE en este flujo; `nonce` liga el id_token a la petición
    // y `state` protege el callback de CSRF.
    checks: ['nonce', 'state'],
    authorization: {
      url: 'https://slack.com/openid/connect/authorize',
      params: { scope: 'openid profile email' },
    },
    token: 'https://slack.com/api/openid.connect.token',
    userinfo: 'https://slack.com/api/openid.connect.userInfo',
    style: { brandColor: '#611f69' },
    profile(perfil) {
      const claims = extraerClaimsSlack(perfil);
      return {
        id: perfil.sub,
        name: typeof perfil.name === 'string' ? perfil.name : null,
        email: typeof perfil.email === 'string' ? perfil.email : null,
        image: typeof perfil.picture === 'string' ? perfil.picture : null,
        slackUserId: claims.userId,
        slackTeamId: claims.teamId,
      };
    },
  };
}

function proveedores(): NextAuthConfig['providers'] {
  const credenciales = credencialesSlack();
  return credenciales === null
    ? []
    : [proveedorSlack(credenciales.clientId, credenciales.clientSecret)];
}

export const configuracionAuth: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
  }),

  providers: proveedores(),

  session: {
    strategy: 'database',
    maxAge: DURACION_SESION_SEGUNDOS,
  },

  pages: {
    signIn: RUTA_LOGIN,
    error: RUTA_ACCESO_DENEGADO,
  },

  callbacks: {
    /**
     * Guard de workspace. Se ejecuta **antes** de crear el usuario y la sesión,
     * de modo que una cuenta de otro workspace ni siquiera llega a existir en
     * `users`. Devolver una ruta relativa redirige con el motivo concreto.
     */
    signIn({ account, profile }) {
      if (account?.provider !== PROVIDER_SLACK) return true;

      const veredicto = evaluarPerfilSlack(profile, teamIdAutorizado());
      if (veredicto.permitido) return true;

      return urlDeAccesoDenegado(veredicto.motivo);
    },

    /**
     * Construye la sesión pública desde cero en lugar de devolver la fila del
     * adapter. Por defecto Auth.js serializa la sesión entera en
     * `GET /api/auth/session`, incluido el `sessionToken`: eso convertiría en
     * legible por JavaScript el mismo valor que la cookie guarda como
     * `HttpOnly`. Aquí solo sale lo que la interfaz necesita.
     */
    session({ session, user }) {
      const expiracion: unknown = session.expires;
      return {
        expires: expiracion instanceof Date ? expiracion.toISOString() : String(expiracion),
        user: {
          id: user.id,
          name: user.name ?? null,
          email: user.email ?? null,
          image: user.image ?? null,
          slackUserId: user.slackUserId ?? null,
          slackTeamId: user.slackTeamId ?? null,
          passwordHash: user.passwordHash ?? null,
          emailVerified: user.emailVerified ?? null,
          isActive: user.isActive ?? true,
        },
      };
    },
  },

  events: {
    /**
     * Persiste `slackUserId` y `slackTeamId` en cada entrada.
     *
     * Para un usuario nuevo bastaría con el callback `profile()`, porque el
     * adapter inserta lo que devuelve. Para uno que ya existía el adapter no
     * actualiza nada, así que sin esto el workspace guardado se quedaría
     * congelado en el del primer login — justo el escenario que PLAN.md pide
     * cubrir para que «una sesión antigua de otro workspace tampoco pase».
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== PROVIDER_SLACK) return;
      if (typeof user.id !== 'string') return;

      const claims = extraerClaimsSlack(profile);
      if (claims.teamId === null && claims.userId === null) return;

      await db
        .update(users)
        .set({
          slackUserId: claims.userId,
          slackTeamId: claims.teamId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(configuracionAuth);
