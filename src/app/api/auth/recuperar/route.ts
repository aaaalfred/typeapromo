/**
 * `POST /api/auth/recuperar` — Solicitud de restablecimiento de contraseña.
 *
 * Limita a 3 solicitudes/hora por IP.
 * Siempre responde 200 con mensaje genérico para evitar enumeración.
 * Si el usuario existe y está activo, genera un token válido durante 1 hora y envía el correo.
 */

import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';
import { crearTokenRestablecimiento } from '@/server/auth/tokens';
import { urlBaseDePeticion } from '@/server/auth/session-helpers';
import { enviarCorreo, plantillaRestablecimiento } from '@/server/email';
import { clienteDePeticion } from '@/server/rate-limit/clave';
import { consumirLimite } from '@/server/rate-limit/limitador';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esquemaRecuperar = z.object({
  email: z.string().trim().email('Dirección de correo no válida').toLowerCase(),
});

const MENSAJE_RESPUESTA_GENERICA =
  'Si existe una cuenta asociada a este correo electrónico, recibirás un mensaje con las instrucciones para restablecer tu contraseña.';

export async function POST(request: Request): Promise<Response> {
  const ip = clienteDePeticion(request.headers);
  const limite = await consumirLimite({ ambito: 'recuperar', cliente: ip });
  if (!limite.permitido) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes de recuperación. Inténtalo de nuevo más tarde.' },
      { status: 429, headers: { 'Retry-After': String(limite.reintentarEnSegundos) } },
    );
  }

  const contentType = request.headers.get('content-type') ?? '';
  let cuerpo: unknown;
  if (contentType.includes('application/json')) {
    cuerpo = await request.json().catch(() => null);
  } else {
    const formData = await request.formData().catch(() => null);
    if (formData) {
      cuerpo = { email: formData.get('email') ?? undefined };
    }
  }

  const validacion = esquemaRecuperar.safeParse(cuerpo);
  if (!validacion.success) {
    const primerError = validacion.error.issues[0]?.message ?? 'Correo no válido';
    return NextResponse.json({ error: primerError }, { status: 400 });
  }

  const { email } = validacion.data;

  // Buscar usuario
  const [usuario] = await db
    .select({
      id: users.id,
      email: users.email,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);

  if (usuario && usuario.isActive !== false) {
    const token = await crearTokenRestablecimiento(usuario.id);
    const baseOrigen = urlBaseDePeticion(request);
    const enlace = `${baseOrigen}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
    const plantilla = plantillaRestablecimiento(enlace);

    await enviarCorreo({
      para: usuario.email ?? email,
      asunto: plantilla.asunto,
      texto: plantilla.texto,
      html: plantilla.html,
    });
  }

  return NextResponse.json({ ok: true, mensaje: MENSAJE_RESPUESTA_GENERICA });
}
