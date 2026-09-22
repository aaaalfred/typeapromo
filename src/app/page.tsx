import type { Metadata } from 'next';
import Link from 'next/link';

import { sesionActual } from '@/lib/auth/sesion';
import { obtenerPlanesMarketing } from '@/lib/marketing/planes';

export const metadata: Metadata = {
  title: 'Typeapromo — Formularios conversacionales para tu equipo',
  description:
    'Crea, personaliza y publica formularios conversacionales con lógica condicional, analítica en tiempo real y exportación a CSV.',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const sesion = await sesionActual();
  const planes = obtenerPlanesMarketing();

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 text-neutral-900 selection:bg-neutral-900 selection:text-white dark:bg-neutral-950 dark:text-neutral-100 dark:selection:bg-white dark:selection:text-neutral-900">
      {/* Navegación superior */}
      <header className="sticky top-0 z-40 border-b border-neutral-200/80 bg-white/80 px-6 py-4 backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-neutral-950 dark:text-white"
            >
              Typeapromo
            </Link>
            <nav className="hidden items-center gap-6 text-sm font-medium text-neutral-600 sm:flex dark:text-neutral-300">
              <a href="#caracteristicas" className="transition-colors hover:text-neutral-950 dark:hover:text-white">
                Características
              </a>
              <a href="#planes" className="transition-colors hover:text-neutral-950 dark:hover:text-white">
                Planes
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {sesion?.user ? (
              <Link
                href="/app"
                className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
              >
                Ir al panel
              </Link>
            ) : (
              <>
                <Link
                  href="/iniciar-sesion"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/crear-cuenta"
                  className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
                >
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex items-center rounded-full border border-neutral-300 bg-neutral-100/80 px-3.5 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            Formularios conversacionales sin complicaciones
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl dark:text-white">
            Typeapromo
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-neutral-600 sm:text-xl dark:text-neutral-300">
            Crea formularios fluidos, elegantes y profesionales con lógica inteligente, temas propios y analítica en tiempo real.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/crear-cuenta"
              className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-neutral-800 hover:shadow-md dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-100"
            >
              Empezar gratis
            </Link>
            <a
              href="#planes"
              className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Ver catálogo de planes
            </a>
          </div>
        </div>
      </section>

      {/* Características (3 viñetas principales) */}
      <section id="caracteristicas" className="border-t border-neutral-200 bg-white px-6 py-20 dark:border-neutral-800 dark:bg-neutral-900/50">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Potencia y simplicidad
            </h2>
            <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl dark:text-white">
              Todo lo necesario para captar respuestas de calidad
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-6 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                Editor visual fluido
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                Diseña encuestas interactivas paso a paso con previsualización en vivo, 11 tipos de bloques y comprobación automática de contraste WCAG AA.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-6 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                Lógica condicional
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                Crea bifurcaciones deterministas con saltos hacia adelante y validación preventiva que detecta destinos rotos o bucles antes de publicar.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-6 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                Resultados y analítica
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                Analiza respuestas completadas, embudos de abandono por pregunta y exporta el conjunto de datos a CSV con un clic en cualquier momento.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Catálogo de Planes */}
      <section id="planes" className="px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Planes y precios
            </h2>
            <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl dark:text-white">
              Transparente y sin sorpresas
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm text-neutral-600 dark:text-neutral-400">
              Empieza gratis con tu cuenta de equipo y escala a Business cuando necesites capacidad ilimitada.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {planes.map((plan) => {
              const esDestacado = plan.destacado === true;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col justify-between rounded-2xl p-6 transition-all sm:p-7 ${
                    esDestacado
                      ? 'border-2 border-neutral-950 bg-white shadow-lg dark:border-white dark:bg-neutral-900'
                      : 'border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-bold text-neutral-950 dark:text-white">
                        {plan.nombre}
                      </h3>
                      {plan.badge ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${
                            esDestacado
                              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                              : 'border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300'
                          }`}
                        >
                          {plan.badge}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {plan.descripcion}
                    </p>

                    <div className="my-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold tracking-tight text-neutral-950 dark:text-white">
                          {plan.precioLabel}
                        </span>
                        {plan.periodoLabel ? (
                          <span className="text-xs text-neutral-500">
                            {plan.periodoLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        {plan.cupo}
                      </p>
                    </div>

                    <hr className="my-5 border-neutral-100 dark:border-neutral-800" />

                    <ul className="space-y-2.5 text-xs text-neutral-600 dark:text-neutral-300">
                      {plan.caracteristicas.map((caracteristica, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <svg
                            className="mt-0.5 size-3.5 shrink-0 text-emerald-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          <span>{caracteristica}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-8 pt-2">
                    <Link
                      href={plan.href}
                      className={`inline-flex w-full items-center justify-center rounded-xl py-2.5 text-xs font-semibold transition-all ${
                        esDestacado
                          ? 'bg-neutral-950 text-white hover:opacity-90 dark:bg-white dark:text-neutral-950'
                          : plan.estado === 'activo'
                            ? 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
                            : 'border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800'
                      }`}
                    >
                      {plan.ctaLabel}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pie de página con login */}
      <footer className="mt-auto border-t border-neutral-200 bg-white px-6 py-10 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-neutral-950 dark:text-white">
              Typeapromo
            </span>
            <span className="text-xs text-neutral-400">
              Formularios conversacionales para tu equipo
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs text-neutral-600 dark:text-neutral-400">
            <Link
              href="/iniciar-sesion"
              className="font-medium text-neutral-900 underline underline-offset-4 hover:text-neutral-700 dark:text-white dark:hover:text-neutral-200"
            >
              Ya tengo cuenta (Iniciar sesión)
            </Link>
            <Link
              href="/crear-cuenta"
              className="hover:text-neutral-950 dark:hover:text-white"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
