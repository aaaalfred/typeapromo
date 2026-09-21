import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { RUTA_LOGIN, RUTA_REENVIAR_VERIFICACION } from '@/lib/auth/rutas';

export const metadata: Metadata = {
  title: 'Verificar correo',
  description: 'Activa tu cuenta de Typeapromo mediante el enlace de verificación.',
};

export const dynamic = 'force-dynamic';

interface PropiedadesPagina {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function primerValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaVerificarCorreo({ searchParams }: PropiedadesPagina) {
  const params = await searchParams;
  const token = primerValor(params['token']);
  const error = primerValor(params['error']);
  const email = primerValor(params['email']);

  // Si viene con token, redirigir al handler de verificación que procesa y establece la cookie de sesión
  if (token && token.trim() !== '') {
    redirect(`/api/auth/verificar?token=${encodeURIComponent(token.trim())}`);
  }

  const tokenInvalido = error === 'token-invalido';
  const tokenAusente = error === 'token-ausente';

  return (
    <section className="rounded-2xl border border-black/10 bg-white/60 p-8 shadow-sm backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/60">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-black/5 text-black dark:bg-white/10 dark:text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-6 w-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Revisa tu bandeja de entrada</h1>
        <p className="mt-2 text-sm text-black/70 dark:text-white/70">
          Te hemos enviado un enlace para activar tu cuenta y acceder a tu espacio de trabajo.
        </p>
      </div>

      {tokenInvalido ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <p className="font-medium">El enlace de verificación no es válido o ha caducado.</p>
          <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
            Los enlaces de activación caducan tras 24 horas y solo pueden usarse una vez. Puedes solicitar uno nuevo a continuación.
          </p>
        </div>
      ) : null}

      {tokenAusente ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-500/30 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/20 dark:bg-red-950/40 dark:text-red-200"
        >
          No se ha proporcionado ningún token de verificación.
        </div>
      ) : null}

      {email ? (
        <p className="mb-6 text-center text-xs font-mono text-black/60 dark:text-white/60">
          Correo: {email}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <Link
          href={`${RUTA_REENVIAR_VERIFICACION}${email ? `?email=${encodeURIComponent(email)}` : ''}`}
          className="flex w-full items-center justify-center rounded-lg border border-black/15 bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/5 dark:border-white/20 dark:bg-zinc-950 dark:text-white dark:hover:bg-white/5"
        >
          Reenviar enlace de verificación
        </Link>

        <Link
          href={RUTA_LOGIN}
          className="flex w-full items-center justify-center rounded-lg px-4 py-2 text-xs text-black/60 hover:text-black hover:underline dark:text-white/60 dark:hover:text-white"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    </section>
  );
}
