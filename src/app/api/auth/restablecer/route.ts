/**
 * `POST /api/auth/restablecer` — Restablecimiento de contraseña mediante token.
 *
 * Valida y consume el token de restablecimiento, actualiza el hash Argon2id de la contraseña
 * e invalida todas las sesiones previas del usuario en `auth_sessions` para forzar un nuevo inicio seguro.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';
import { hashearPassword, LONGITUD_MINIMA_PASSWORD } from '@/server/auth/passwords';
import { consumirTokenRestablecimiento } from '@/server/auth/tokens';
import { invalidarSesionesUsuario } from '@/server/auth/session-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esquemaRestablecer = z.object({
  token: z.string().trim().min(1, 'El token es obligatorio'),
  password: z
    .string()
    .min(
      LONGITUD_MINIMA_PASSWORD,
      `La nueva contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`,
    )
    .max(128, 'La contraseña no puede superar 128 caracteres'),
});

export async function POST(request: Request): Promise<Response> {
  let cuerpo: unknown;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    cuerpo = await request.json().catch(() => null);
  } else {
    const formData = await request.formData().catch(() => null);
    if (formData) {
      cuerpo = {
        token: formData.get('token') ?? undefined,
        password: formData.get('password') ?? undefined,
      };
    }
  }

  const validacion = esquemaRestablecer.safeParse(cuerpo);
  if (!validacion.success) {
    const primerError = validacion.error.issues[0]?.message ?? 'Datos no válidos';
    return NextResponse.json({ error: primerError }, { status: 400 });
  }

  const { token, password } = validacion.data;

  const resultado = await consumirTokenRestablecimiento(token);
  if (!resultado) {
    return NextResponse.json(
      { error: 'El enlace para restablecer la contraseña no es válido o ha caducado.' },
      { status: 400 },
    );
  }

  const { userId } = resultado;

  // Hashear nueva contraseña
  const passwordHash = await hashearPassword(password);

  // Actualizar usuario
  await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Invalida todas las sesiones previas en auth_sessions para forzar un re-login limpio
  await invalidarSesionesUsuario(userId);

  return NextResponse.json({
    ok: true,
    mensaje: 'Tu contraseña ha sido restablecida con éxito. Ya puedes iniciar sesión con tu nueva clave.',
  });
}
