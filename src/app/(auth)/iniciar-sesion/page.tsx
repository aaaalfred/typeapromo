/**
 * Página de inicio de sesión.
 *
 * Admite acceso mediante email y contraseña, con Slack como método secundario si está configurado,
 * y bypass de desarrollo si `AUTH_DEV_BYPASS=1`.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { signIn } from '@/auth';
import { esBypassActivo, esSlackConfigurado } from '@/lib/auth/entorno';
import {
  normalizarDestino,
  PARAM_DESTINO,
  RUTA_REGISTRO,
  RUTA_RESTABLECER_CONTRASENA,
} from '@/lib/auth/rutas';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Inicia sesión en tu cuenta de Typeapromo.',
};

export const dynamic = 'force-dynamic';

interface PropiedadesPagina {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function primerValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaIniciarSesion({ searchParams }: PropiedadesPagina) {
  const parametros = await searchParams;
  const destino = normalizarDestino(primerValor(parametros[PARAM_DESTINO]));
  const errorMensaje = primerValor(parametros['error']);
  const restablecida = primerValor(parametros['restablecida']) === '1';

  const slackDisponible = esSlackConfigurado();
  const bypassDisponible = esBypassActivo();

  async function entrarConSlack(datos: FormData) {
    'use server';
    const redirectTo = normalizarDestino(datos.get(PARAM_DESTINO));
    await signIn('slack', { redirectTo });
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white/60 p-8 shadow-sm backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/60">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Typeapromo</h1>
        <p className="mt-1 text-sm text-black/70 dark:text-white/70">
          Inicia sesión para gestionar tus formularios conversacionales.
        </p>
      </div>

      {restablecida ? (
        <div
          role="status"
          className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          Tu contraseña se ha restablecido correctamente. Ya puedes acceder con ella.
        </div>
      ) : null}

      {errorMensaje ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-500/30 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/20 dark:bg-red-950/40 dark:text-red-200"
        >
          {errorMensaje}
        </div>
      ) : null}

      <form method="post" action="/api/auth/iniciar" className="flex flex-col gap-4">
        <input type="hidden" name={PARAM_DESTINO} value={destino} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-medium text-black/80 dark:text-white/80">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            name="email"
            required
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
            <Link
              href={RUTA_RESTABLECER_CONTRASENA}
              className="text-xs text-black/60 hover:text-black hover:underline dark:text-white/60 dark:hover:text-white"
            >
              ¿Has olvidado la contraseña?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-black/15 bg-white px-3.5 py-2.5 text-sm text-black shadow-xs transition-colors placeholder:text-black/40 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-white/20 dark:bg-zinc-950 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white dark:focus:ring-white"
          />
        </div>

        <button
          type="submit"
          className="mt-2 flex w-full items-center justify-center rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:bg-white dark:text-black dark:hover:bg-white/90"
        >
          Iniciar sesión
        </button>
      </form>

      <div className="mt-5 text-center text-xs text-black/70 dark:text-white/70">
        ¿No tienes cuenta?{' '}
        <Link
          href={RUTA_REGISTRO}
          className="font-medium text-black underline underline-offset-2 hover:text-black/80 dark:text-white dark:hover:text-white/80"
        >
          Crear cuenta
        </Link>
      </div>

      {slackDisponible || bypassDisponible ? (
        <div className="relative my-6 text-center text-xs text-black/40 dark:text-white/40">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-black/10 dark:border-white/10" />
          </div>
          <span className="relative bg-white px-2 dark:bg-zinc-900">o accede con</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {slackDisponible ? (
          <form action={entrarConSlack}>
            <input type="hidden" name={PARAM_DESTINO} value={destino} />
            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-lg border border-[#611f69]/30 bg-[#611f69]/10 px-4 py-2 text-sm font-medium text-[#611f69] transition-colors hover:bg-[#611f69]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#611f69] dark:border-purple-400/30 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/50"
            >
              Continuar con Slack
            </button>
          </form>
        ) : null}

        {bypassDisponible ? (
          <form method="post" action="/api/auth/acceso-directo">
            <input type="hidden" name={PARAM_DESTINO} value={destino} />
            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-lg border border-amber-500/40 bg-amber-100/60 px-4 py-2 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-300"
            >
              Entrar sin credenciales (desarrollo)
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
