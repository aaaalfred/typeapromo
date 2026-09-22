import type { Metadata } from 'next';
import Link from 'next/link';

import { obtenerPlanMarketingPorId } from '@/lib/marketing/planes';

export const metadata: Metadata = {
  title: 'Plan en construcción — Typeapromo',
  description: 'Información sobre planes y características en desarrollo en Typeapromo.',
};

export const dynamic = 'force-dynamic';

interface PropiedadesPagina {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function primerValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaProximamente({ searchParams }: PropiedadesPagina) {
  const params = await searchParams;
  const planId = primerValor(params['plan']);
  const plan = obtenerPlanMarketingPorId(planId);

  const nombrePlan = plan?.nombre;
  const titulo = nombrePlan ? `Plan ${nombrePlan} en construcción` : 'Plan en construcción';

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 bg-white/80 px-6 py-4 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-neutral-900 transition-opacity hover:opacity-80 dark:text-white"
          >
            Typeapromo
          </Link>
          <Link
            href="/"
            className="text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            Volver a la portada
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-10">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            Próximamente
          </div>

          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {titulo}
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            Este plan está en construcción. Los planes <strong>Gratis</strong> y <strong>Business</strong> ya están disponibles para su uso inmediato.
          </p>

          {plan ? (
            <div className="my-6 rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-xs dark:border-neutral-800 dark:bg-neutral-950/50">
              <div className="flex items-center justify-between font-medium">
                <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Detalles previstos de {plan.nombre}
                </span>
                <span className="font-mono text-neutral-500">
                  {plan.precioLabel}{plan.periodoLabel ?? ''}
                </span>
              </div>
              <p className="mt-1 text-neutral-500 dark:text-neutral-400">
                {plan.cupo}
              </p>
              <ul className="mt-3 space-y-1.5 text-neutral-600 dark:text-neutral-300">
                {plan.caracteristicas.map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="text-emerald-500">✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/crear-cuenta?plan=business"
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
            >
              Comenzar con Business
            </Link>
            <Link
              href="/crear-cuenta"
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Crear cuenta gratis
            </Link>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              ← Volver al catálogo de planes
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
