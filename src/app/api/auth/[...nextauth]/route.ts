/**
 * Rutas de Auth.js: `/api/auth/signin`, `/api/auth/callback/slack`,
 * `/api/auth/session`, `/api/auth/signout`, …
 *
 * Runtime Node.js obligatorio: el adapter de Drizzle usa el driver `pg`, que no
 * funciona en Edge (PLAN.md · §3).
 */

import { handlers } from '@/auth';

export const runtime = 'nodejs';

export const { GET, POST } = handlers;
