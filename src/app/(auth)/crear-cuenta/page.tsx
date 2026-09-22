'use client';

/**
 * Página de registro de nueva cuenta.
 *
 * Incluye campos para nombre, correo y contraseña con indicador visual
 * de longitud mínima (10 caracteres).
 */

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { normalizarDestino, RUTA_LOGIN, RUTA_VERIFICAR_CORREO } from '@/lib/auth/rutas';

function FormularioCrearCuenta() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan');
  const destinoParam = searchParams.get('destino');

  const destino = plan === 'business' ? '/app/plan' : (destinoParam ? normalizarDestino(destinoParam) : '');

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordValida = password.length >= 10;

  async function manejarEnvio(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordValida) {
      setError('La contraseña debe tener al menos 10 caracteres.');
      return;
    }

    setCargando(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nombre.trim() || undefined,
          email: email.trim(),
          password,
          destino: destino || undefined,
        }),
      });

      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error ?? 'Ha ocurrido un error al crear la cuenta.');
        setCargando(false);
        return;
      }

      const queryDestino = destino ? `&destino=${encodeURIComponent(destino)}` : '';
      router.push(
        `${RUTA_VERIFICAR_CORREO}?email=${encodeURIComponent(email)}&registrado=1${queryDestino}`,
      );
    } catch {
      setError('Error de conexión con el servidor. Inténtalo de nuevo.');
      setCargando(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white/60 p-8 shadow-sm backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/60">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Crear cuenta</h1>
        <p className="mt-1 text-sm text-black/70 dark:text-white/70">
          Comienza a diseñar formularios interactivos con Typeapromo.
        </p>
        {plan === 'business' ? (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-black/5 px-3 py-1 text-xs font-medium text-black dark:border-white/20 dark:bg-white/10 dark:text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Plan seleccionado: Business
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-500/30 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/20 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}

      <form onSubmit={manejarEnvio} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nombre" className="text-xs font-medium text-black/80 dark:text-white/80">
            Tu nombre (opcional)
          </label>
          <input
            id="nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="name"
            placeholder="María González"
            className="w-full rounded-lg border border-black/15 bg-white px-3.5 py-2.5 text-sm text-black shadow-xs transition-colors placeholder:text-black/40 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-white/20 dark:bg-zinc-950 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white dark:focus:ring-white"
          />
        </div>

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

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-xs font-medium text-black/80 dark:text-white/80">
              Contraseña
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
            className="w-full rounded-lg border border-black/15 bg-white px-3.5 py-2.5 text-sm text-black shadow-xs transition-colors placeholder:text-black/40 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-white/20 dark:bg-zinc-950 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white dark:focus:ring-white"
          />
          <div className="mt-1 flex gap-1">
            <div
              className={`h-1 flex-1 rounded-full transition-all ${
                password.length === 0
                  ? 'bg-black/10 dark:bg-white/10'
                  : password.length < 6
                    ? 'bg-red-500'
                    : passwordValida
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
              }`}
            />
            <div
              className={`h-1 flex-1 rounded-full transition-all ${
                passwordValida ? 'bg-emerald-500' : 'bg-black/10 dark:bg-white/10'
              }`}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={cargando}
          className="mt-3 flex w-full items-center justify-center rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:bg-white dark:text-black dark:hover:bg-white/90"
        >
          {cargando ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-black/70 dark:text-white/70">
        ¿Ya tienes cuenta?{' '}
        <Link
          href={`${RUTA_LOGIN}${destino ? `?destino=${encodeURIComponent(destino)}` : ''}`}
          className="font-medium text-black underline underline-offset-2 hover:text-black/80 dark:text-white dark:hover:text-white/80"
        >
          Iniciar sesión
        </Link>
      </div>
    </section>
  );
}

export default function PaginaCrearCuenta() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-black/50">Cargando...</div>}>
      <FormularioCrearCuenta />
    </Suspense>
  );
}
