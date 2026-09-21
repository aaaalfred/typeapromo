'use client';

/**
 * Página de restablecimiento de contraseña.
 *
 * Si no incluye token en los parámetros de búsqueda, muestra el formulario para solicitar
 * el enlace de recuperación. Si incluye `?token=...`, muestra el formulario para introducir
 * la nueva contraseña.
 */

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { RUTA_LOGIN } from '@/lib/auth/rutas';

function ContenidoRestablecer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  // Estado para solicitud (sin token)
  const [email, setEmail] = useState('');
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);

  // Estado para cambio de contraseña (con token)
  const [password, setPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');

  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const passwordValida = password.length >= 10;
  const passwordsCoinciden = password === confirmarPassword;

  // 1. Manejar solicitud de enlace
  async function manejarSolicitud(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error ?? 'Ha ocurrido un error. Inténtalo de nuevo.');
        setCargando(false);
        return;
      }

      setSolicitudEnviada(true);
      setMensaje(datos.mensaje);
      setCargando(false);
    } catch {
      setError('Error de conexión con el servidor.');
      setCargando(false);
    }
  }

  // 2. Manejar cambio de contraseña
  async function manejarCambio(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordValida) {
      setError('La contraseña debe tener al menos 10 caracteres.');
      return;
    }
    if (!passwordsCoinciden) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/restablecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token?.trim(),
          password,
        }),
      });

      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error ?? 'No se ha podido actualizar la contraseña.');
        setCargando(false);
        return;
      }

      router.push(`${RUTA_LOGIN}?restablecida=1`);
    } catch {
      setError('Error de conexión con el servidor.');
      setCargando(false);
    }
  }

  // Vista cuando viene con token: introducir nueva clave
  if (token && token.trim() !== '') {
    return (
      <section className="rounded-2xl border border-black/10 bg-white/60 p-8 shadow-sm backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/60">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Nueva contraseña</h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            Define una nueva contraseña segura para tu cuenta.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-500/30 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/20 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={manejarCambio} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-medium text-black/80 dark:text-white/80">
                Nueva contraseña
              </label>
              <span
                className={`text-xs font-mono transition-colors ${
                  password.length === 0
                    ? 'text-black/40 dark:text-white/40'
                    : passwordValida
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {password.length}/10 mín.
              </span>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Al menos 10 caracteres"
              className="w-full rounded-lg border border-black/15 bg-white px-3.5 py-2.5 text-sm text-black shadow-xs transition-colors placeholder:text-black/40 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-white/20 dark:bg-zinc-950 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white dark:focus:ring-white"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="confirmarPassword"
              className="text-xs font-medium text-black/80 dark:text-white/80"
            >
              Confirmar nueva contraseña
            </label>
            <input
              id="confirmarPassword"
              type="password"
              required
              value={confirmarPassword}
              onChange={(e) => setConfirmarPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Repite la contraseña"
              className="w-full rounded-lg border border-black/15 bg-white px-3.5 py-2.5 text-sm text-black shadow-xs transition-colors placeholder:text-black/40 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-white/20 dark:bg-zinc-950 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white dark:focus:ring-white"
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="mt-2 flex w-full items-center justify-center rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            {cargando ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-black/70 dark:text-white/70">
          <Link
            href={RUTA_LOGIN}
            className="font-medium text-black underline underline-offset-2 hover:text-black/80 dark:text-white dark:hover:text-white/80"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </section>
    );
  }

  // Vista sin token: solicitar enlace
  return (
    <section className="rounded-2xl border border-black/10 bg-white/60 p-8 shadow-sm backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/60">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar contraseña</h1>
        <p className="mt-1 text-sm text-black/70 dark:text-white/70">
          Introduce tu correo electrónico y te enviaremos un enlace para restablecer tu acceso.
        </p>
      </div>

      {mensaje ? (
        <div
          role="status"
          className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {mensaje}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-500/30 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/20 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}

      {!solicitudEnviada ? (
        <form onSubmit={manejarSolicitud} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-black/80 dark:text-white/80">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="tu@empresa.com"
              className="w-full rounded-lg border border-black/15 bg-white px-3.5 py-2.5 text-sm text-black shadow-xs transition-colors placeholder:text-black/40 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-white/20 dark:bg-zinc-950 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white dark:focus:ring-white"
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="mt-2 flex w-full items-center justify-center rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            {cargando ? 'Enviando...' : 'Enviar enlace de recuperación'}
          </button>
        </form>
      ) : null}

      <div className="mt-6 text-center text-xs text-black/70 dark:text-white/70">
        <Link
          href={RUTA_LOGIN}
          className="font-medium text-black underline underline-offset-2 hover:text-black/80 dark:text-white dark:hover:text-white/80"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    </section>
  );
}

export default function PaginaRestablecerContrasena() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-black/50">Cargando...</div>}>
      <ContenidoRestablecer />
    </Suspense>
  );
}
