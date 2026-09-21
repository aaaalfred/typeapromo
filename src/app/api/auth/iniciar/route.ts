/**
 * `POST /api/auth/iniciar` — Inicio de sesión con email y contraseña.
 *
 * Verifica hash Argon2id, comprueba activación y verificación de correo,
 * protege contra ataques de fuerza bruta con límite de tasa por IP+email (5 intentos / 15 min),
 * crea la sesión persistida en `auth_sessions` y establece la cookie de sesión.
 */

import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';
import { verificarPassword } from '@/server/auth/passwords';
import {
  crearSesionUsuario,
  esPeticionSegura,
  fijarCookieSesion,
  urlBaseDePeticion,
} from '@/server/auth/session-helpers';
import { normalizarDestino, PARAM_DESTINO } from '@/lib/auth/rutas';
import { clienteDePeticion } from '@/server/rate-limit/clave';
import { consumirLimite } from '@/server/rate-limit/limitador';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esquemaInicio = z.object({
  email: z.string().trim().email('Dirección de correo no válida').toLowerCase(),
  password: z.string().min(1, 'Introduce tu contraseña'),
  destino: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  const esJson = contentType.includes('application/json');

  let cuerpo: unknown;
  if (esJson) {
    cuerpo = await request.json().catch(() => null);
  } else {
    const formData = await request.formData().catch(() => null);
    if (formData) {
      cuerpo = {
        email: formData.get('email') ?? undefined,
        password: formData.get('password') ?? undefined,
        destino: formData.get(PARAM_DESTINO) ?? undefined,
      };
    }
  }

  const validacion = esquemaInicio.safeParse(cuerpo);
  if (!validacion.success) {
    const error = validacion.error.issues[0]?.message ?? 'Datos de acceso no válidos';
    if (!esJson) {
      const baseOrigen = urlBaseDePeticion(request);
      return NextResponse.redirect(`${baseOrigen}/iniciar-sesion?error=${encodeURIComponent(error)}`, { status: 303 });
    }
    return NextResponse.json({ error }, { status: 400 });
  }

  const { email, password, destino } = validacion.data;
  const destinoFinal = normalizarDestino(destino);

  // 1. Rate limiting por IP + email
  const ip = clienteDePeticion(request.headers);
  const claveCliente = `${ip}:${email.toLowerCase()}`;

  // 2. Buscar usuario
  const [usuario] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      emailVerified: users.emailVerified,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);

  // Fallo de autenticación si no existe o no tiene contraseña
  if (!usuario || !usuario.passwordHash) {
    await consumirLimite({ ambito: 'login', cliente: claveCliente });
    const mensajeError = 'Credenciales no válidas';
    if (!esJson) {
      const baseOrigen = urlBaseDePeticion(request);
      return NextResponse.redirect(`${baseOrigen}/iniciar-sesion?error=${encodeURIComponent(mensajeError)}`, { status: 303 });
    }
    return NextResponse.json({ error: mensajeError }, { status: 401 });
  }

  // 3. Comprobar contraseña con Argon2id
  const passwordValida = await verificarPassword(usuario.passwordHash, password);
  if (!passwordValida) {
    const limite = await consumirLimite({ ambito: 'login', cliente: claveCliente });
    if (!limite.permitido) {
      const mensajeBloqueo = 'Demasiados intentos fallidos. Inténtalo de nuevo en 15 minutos.';
      return NextResponse.json(
        { error: mensajeBloqueo },
        { status: 429, headers: { 'Retry-After': String(limite.reintentarEnSegundos) } },
      );
    }
    const mensajeError = 'Credenciales no válidas';
    if (!esJson) {
      const baseOrigen = urlBaseDePeticion(request);
      return NextResponse.redirect(`${baseOrigen}/iniciar-sesion?error=${encodeURIComponent(mensajeError)}`, { status: 303 });
    }
    return NextResponse.json({ error: mensajeError }, { status: 401 });
  }

  // 4. Comprobar si la cuenta está desactivada
  if (usuario.isActive === false) {
    const mensajeError = 'Tu cuenta ha sido desactivada. Contacta al administrador.';
    if (!esJson) {
      const baseOrigen = urlBaseDePeticion(request);
      return NextResponse.redirect(`${baseOrigen}/iniciar-sesion?error=${encodeURIComponent(mensajeError)}`, { status: 303 });
    }
    return NextResponse.json({ error: mensajeError }, { status: 403 });
  }

  // 5. Comprobar si el correo está verificado
  if (!usuario.emailVerified) {
    const mensajeError = 'Debes verificar tu correo antes de continuar';
    if (!esJson) {
      const baseOrigen = urlBaseDePeticion(request);
      return NextResponse.redirect(
        `${baseOrigen}/verificar-correo?aviso=pendiente&email=${encodeURIComponent(usuario.email ?? '')}`,
        { status: 303 },
      );
    }
    return NextResponse.json(
      { error: mensajeError, noVerificado: true, email: usuario.email },
      { status: 403 },
    );
  }

  // 6. Credenciales correctas: crear sesión y fijar cookie
  const { token, expira } = await crearSesionUsuario(usuario.id);
  const esSeguro = esPeticionSegura(request);

  if (esJson) {
    const respuesta = NextResponse.json({ ok: true, redirectTo: destinoFinal });
    fijarCookieSesion(respuesta, token, expira, esSeguro);
    return respuesta;
  }

  const respuesta = NextResponse.redirect(destinoFinal, { status: 303 });
  fijarCookieSesion(respuesta, token, expira, esSeguro);
  return respuesta;
}
