/**
 * `POST /api/auth/registro` — Registro de nueva cuenta con email y contraseña.
 *
 * Exige contraseña de al menos 10 caracteres, limita la tasa a 5 registros/hora por IP,
 * responde 200 genérico si el correo ya existe para evitar enumeración, y envía el correo
 * de verificación con enlace de 24 horas.
 */

import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { users, workspaces, workspaceMembers } from '@/db/schema';
import { hashearPassword, LONGITUD_MINIMA_PASSWORD } from '@/server/auth/passwords';
import { crearTokenVerificacion } from '@/server/auth/tokens';
import { urlBaseDePeticion } from '@/server/auth/session-helpers';
import { enviarCorreo, plantillaVerificacion } from '@/server/email';
import { clienteDePeticion } from '@/server/rate-limit/clave';
import { consumirLimite } from '@/server/rate-limit/limitador';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esquemaRegistro = z.object({
  name: z.string().trim().max(100).optional(),
  email: z
    .string()
    .trim()
    .email('Dirección de correo electrónico no válida')
    .toLowerCase(),
  password: z
    .string()
    .min(
      LONGITUD_MINIMA_PASSWORD,
      `La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`,
    )
    .max(128, 'La contraseña no puede superar 128 caracteres'),
});

const MENSAJE_RESPUESTA_GENERICA =
  'Si la dirección de correo es válida, recibirás un mensaje con un enlace para verificar tu cuenta y activar tu espacio de trabajo.';

export async function POST(request: Request): Promise<Response> {
  // 1. Limitación de tasa por IP
  const clienteIp = clienteDePeticion(request.headers);
  const limite = await consumirLimite({ ambito: 'registro', cliente: clienteIp });
  if (!limite.permitido) {
    return NextResponse.json(
      { error: 'Demasiados intentos de registro. Por favor, inténtalo de nuevo más tarde.' },
      { status: 429, headers: { 'Retry-After': String(limite.reintentarEnSegundos) } },
    );
  }

  // 2. Extracción y validación de datos
  let cuerpo: unknown;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    cuerpo = await request.json().catch(() => null);
  } else {
    const formData = await request.formData().catch(() => null);
    if (formData) {
      cuerpo = {
        name: formData.get('name') ?? undefined,
        email: formData.get('email') ?? undefined,
        password: formData.get('password') ?? undefined,
      };
    }
  }

  const validacion = esquemaRegistro.safeParse(cuerpo);
  if (!validacion.success) {
    const primerError = validacion.error.issues[0]?.message ?? 'Datos de registro no válidos';
    return NextResponse.json({ error: primerError }, { status: 400 });
  }

  const { name, email, password } = validacion.data;

  // 3. Comprobación opaca de existencia para evitar enumeración de cuentas
  const [usuarioExistente] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);

  if (usuarioExistente) {
    // Respondemos 200 con el mismo mensaje genérico para no filtrar si el email ya existe
    return NextResponse.json({ ok: true, mensaje: MENSAJE_RESPUESTA_GENERICA });
  }

  // 4. Hashing de contraseña y transacción de creación
  const passwordHash = await hashearPassword(password);
  const nombreUsuario = name && name !== '' ? name : null;
  const nombreEspacio = nombreUsuario ? `Espacio de ${nombreUsuario}` : 'Espacio personal';

  let nuevoUsuarioId: string | null = null;

  await db.transaction(async (tx) => {
    const [nuevoUsuario] = await tx
      .insert(users)
      .values({
        email,
        name: nombreUsuario,
        passwordHash,
        emailVerified: null,
        isActive: true,
      })
      .returning({ id: users.id });

    if (!nuevoUsuario) {
      throw new Error('No se pudo crear el usuario');
    }

    nuevoUsuarioId = nuevoUsuario.id;

    // Crear workspace personal para el nuevo usuario
    const slugBase = `espacio-${nuevoUsuario.id.slice(0, 8)}`;
    const [nuevoWorkspace] = await tx
      .insert(workspaces)
      .values({
        name: nombreEspacio,
        slug: slugBase,
        plan: 'free',
        planStatus: 'active',
      })
      .returning({ id: workspaces.id });

    if (!nuevoWorkspace) {
      throw new Error('No se pudo crear el espacio de trabajo');
    }

    // Asignar membresía de owner
    await tx.insert(workspaceMembers).values({
      workspaceId: nuevoWorkspace.id,
      userId: nuevoUsuario.id,
      role: 'owner',
    });
  });

  if (!nuevoUsuarioId) {
    return NextResponse.json(
      { error: 'No se pudo completar el registro. Inténtalo de nuevo.' },
      { status: 500 },
    );
  }

  // 5. Creación del token de verificación y envío del correo
  const tokenPlano = await crearTokenVerificacion(nuevoUsuarioId);
  const baseOrigen = urlBaseDePeticion(request);
  const enlaceVerificacion = `${baseOrigen}/verificar-correo?token=${encodeURIComponent(tokenPlano)}`;
  const plantilla = plantillaVerificacion(enlaceVerificacion);

  await enviarCorreo({
    para: email,
    asunto: plantilla.asunto,
    texto: plantilla.texto,
    html: plantilla.html,
  });

  return NextResponse.json({ ok: true, mensaje: MENSAJE_RESPUESTA_GENERICA });
}
