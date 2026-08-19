/**
 * Página de inicio de sesión.
 *
 * Muestra las puertas que estén realmente abiertas en este entorno: Slack si hay
 * credenciales, acceso directo si `AUTH_DEV_BYPASS=1`. Si no hay ninguna, lo
 * dice en lugar de enseñar un botón que no funciona.
 */

import type { Metadata } from 'next';

import { signIn } from '@/auth';
import { esBypassActivo, esSlackConfigurado } from '@/lib/auth/entorno';
import { normalizarDestino, PARAM_DESTINO } from '@/lib/auth/rutas';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Acceso al panel de formularios con la cuenta de Slack del equipo.',
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

  const slackDisponible = esSlackConfigurado();
  const bypassDisponible = esBypassActivo();

  async function entrarConSlack(datos: FormData) {
    'use server';
    const redirectTo = normalizarDestino(datos.get(PARAM_DESTINO));
    await signIn('slack', { redirectTo });
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white/60 p-8 shadow-sm dark:border-white/15 dark:bg-white/5">
      <h1 className="text-2xl font-semibold tracking-tight">Typeapromo</h1>
      <p className="mt-2 text-sm text-black/70 dark:text-white/70">
        Panel de formularios del equipo. El acceso está reservado a los miembros del
        workspace de Slack autorizado.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {slackDisponible ? (
          <form action={entrarConSlack}>
            <input type="hidden" name={PARAM_DESTINO} value={destino} />
            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-lg bg-[#611f69] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#4a1750] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#611f69]"
            >
              Entrar con Slack
            </button>
          </form>
        ) : null}

        {bypassDisponible ? (
          <form method="post" action="/api/auth/acceso-directo">
            <input type="hidden" name={PARAM_DESTINO} value={destino} />
            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-lg border border-amber-500 bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950 transition-colors hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
            >
              Entrar sin credenciales (desarrollo)
            </button>
            <p className="mt-2 text-xs text-black/60 dark:text-white/60">
              Atajo de desarrollo y CI, activo porque <code className="font-mono">AUTH_DEV_BYPASS</code>{' '}
              vale <code className="font-mono">1</code>. No existe en producción.
            </p>
          </form>
        ) : null}

        {!slackDisponible && !bypassDisponible ? (
          <p
            role="status"
            className="rounded-lg border border-black/10 bg-black/5 p-4 text-sm dark:border-white/15 dark:bg-white/10"
          >
            No hay ningún método de acceso configurado en este servidor. Faltan{' '}
            <code className="font-mono">SLACK_CLIENT_ID</code> y{' '}
            <code className="font-mono">SLACK_CLIENT_SECRET</code>. Avisa a quien administre la
            instalación.
          </p>
        ) : null}
      </div>
    </section>
  );
}
