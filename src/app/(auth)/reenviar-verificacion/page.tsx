'use client';

/**
 * Página de reenvío de correo de verificación.
 */

import { useState } from 'react';
import Link from 'next/link';

import { RUTA_LOGIN } from '@/lib/auth/rutas';

export default function PaginaReenviarVerificacion() {
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function manejarEnvio(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setMensaje(null);

    try {
      const res = await fetch('/api/auth/reenviar-verificacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error ?? 'Ha ocurrido un error al reenviar el correo.');
        setCargando(false);
        return;
      }

      setMensaje(datos.mensaje ?? 'Si la cuenta existe, recibirás un nuevo enlace de activación.');
      setCargando(false);
    } catch {
      setError('Error de conexión con el servidor. Inténtalo de nuevo.');
      setCargando(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white/60 p-8 shadow-sm backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/60">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reenviar activación</h1>
        <p className="mt-1 text-sm text-black/70 dark:text-white/70">
          Introduce tu correo electrónico para enviarte un nuevo enlace de verificación.
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

      {!mensaje ? (
        <form onSubmit={manejarEnvio} className="flex flex-col gap-4">
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
            {cargando ? 'Enviando...' : 'Reenviar enlace'}
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
