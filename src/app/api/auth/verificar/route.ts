/**
 * `GET /api/auth/verificar` — Verificación de correo electrónico mediante token.
 *
 * Consume el token, marca `emailVerified = now()`, crea la sesión persistida en
 * `auth_sessions`, establece la cookie de sesión y redirige a `/app`.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema';
import { normalizarDestino } from '@/lib/auth/rutas';
import { consumirTokenVerificacion } from '@/server/auth/tokens';
import {
  crearSesionUsuario,
  esPeticionSegura,
  fijarCookieSesion,
  urlBaseDePeticion,
} from '@/server/auth/session-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const destinoParam = url.searchParams.get('destino');
  const baseOrigen = urlBaseDePeticion(request);

  if (!token || token.trim() === '') {
    return NextResponse.redirect(`${baseOrigen}/verificar-correo?error=token-ausente`, { status: 303 });
  }

  const resultado = await consumirTokenVerificacion(token);
  if (!resultado) {
    return NextResponse.redirect(`${baseOrigen}/verificar-correo?error=token-invalido`, { status: 303 });
  }

  const { userId } = resultado;

  // Actualizar emailVerified en users
  await db
    .update(users)
    .set({
      emailVerified: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Crear sesión y fijar cookie
  const { token: sessionToken, expira } = await crearSesionUsuario(userId);
  const esSeguro = esPeticionSegura(request);

  const destinoFinal = normalizarDestino(destinoParam);
  const respuesta = NextResponse.redirect(`${baseOrigen}${destinoFinal}`, { status: 303 });
  fijarCookieSesion(respuesta, sessionToken, expira, esSeguro);

  return respuesta;
}

