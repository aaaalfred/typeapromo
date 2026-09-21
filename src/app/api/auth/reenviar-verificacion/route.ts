/**
 * `POST /api/auth/reenviar-verificacion` — Reenvío de correo de verificación.
 *
 * Limita a 3 solicitudes/hora por IP.
 * Siempre responde 200 genérico para evitar enumeración.
 * Si el usuario existe, está activo y su correo no está verificado, genera un nuevo token y lo envía.
 */

import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';
import { crearTokenVerificacion } from '@/server/auth/tokens';
import { urlBaseDePeticion } from '@/server/auth/session-helpers';
import { enviarCorreo, plantillaVerificacion } from '@/server/email';
import { clienteDePeticion } from '@/server/rate-limit/clave';
import { consumirLimite } from '@/server/rate-limit/limitador';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esquemaReenviar = z.object({
  email: z.string().trim().email('Dirección de correo no válida').toLowerCase(),
});

const MENSAJE_RESPUESTA_GENERICA =
  'Si la cuenta existe y está pendiente de verificación, recibirás un nuevo enlace en tu correo.';

export async function POST(request: Request): Promise<Response> {
  const ip = clienteDePeticion(request.headers);
  const limite = await consumirLimite({ ambito: 'reenviar-verificacion', cliente: ip });
  if (!limite.permitido) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes de reenvío. Inténtalo de nuevo más tarde.' },
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

  const validacion = esquemaReenviar.safeParse(cuerpo);
  if (!validacion.success) {
    const primerError = validacion.error.issues[0]?.message ?? 'Correo no válido';
    return NextResponse.json({ error: primerError }, { status: 400 });
  }

  const { email } = validacion.data;

  // Buscar usuario no verificado
  const [usuario] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);

  if (usuario && usuario.isActive !== false && usuario.emailVerified === null) {
    const token = await crearTokenVerificacion(usuario.id);
    const baseOrigen = urlBaseDePeticion(request);
    const enlace = `${baseOrigen}/verificar-correo?token=${encodeURIComponent(token)}`;
    const plantilla = plantillaVerificacion(enlace);

    await enviarCorreo({
      para: usuario.email ?? email,
      asunto: plantilla.asunto,
      texto: plantilla.texto,
      html: plantilla.html,
    });
  }

  return NextResponse.json({ ok: true, mensaje: MENSAJE_RESPUESTA_GENERICA });
}
