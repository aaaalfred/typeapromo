/**
 * Página de gestión del plan y facturación del espacio de trabajo.
 */

import type { Metadata } from 'next';

import { requireActor } from '@/server/forms/actor';
import { obtenerResumenBilling } from '@/server/billing/servicio';

export const metadata: Metadata = {
  title: 'Plan y facturación',
  description: 'Gestiona la suscripción y cuotas de tu espacio de trabajo.',
};

export const dynamic = 'force-dynamic';

interface PropiedadesPagina {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function primerValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaPlan({ searchParams }: PropiedadesPagina) {
  const actor = await requireActor();
  const resumen = await obtenerResumenBilling(actor.workspaceId);
  const params = await searchParams;
  const exito = primerValor(params['exito']) === '1';
  const cancelado = primerValor(params['cancelado']) === '1';

  const esOwner = actor.role === 'owner';
  const esPro = resumen.plan === 'pro';

  const porcentajeForms =
    resumen.formulariosPublicadosMax === Infinity
      ? 0
      : Math.min(100, Math.round((resumen.formulariosPublicados / resumen.formulariosPublicadosMax) * 100));

  const porcentajeRespuestas = Math.min(
    100,
    Math.round((resumen.respuestasMes / resumen.respuestasMesMax) * 100),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[color:var(--tp-texto)]">
          Plan y facturación
        </h1>
        <p className="mt-1 text-sm text-[color:var(--tp-texto-suave)]">
          Consulta el consumo de formularios, respuestas mensuales y gestiona tu suscripción.
        </p>
      </div>

      {exito ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <p className="font-semibold">¡Suscripción actualizada con éxito!</p>
          <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-300/80">
            Tu espacio de trabajo ahora cuenta con todas las ventajas del plan Pro.
          </p>
        </div>
      ) : null}

      {cancelado ? (
        <div
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-950/40 dark:text-amber-200"
        >
          El proceso de pago se ha cancelado. Tu plan actual no ha sufrido modificaciones.
        </div>
      ) : null}

      {!resumen.stripeConfigurado ? (
        <div
          role="note"
          className="rounded-xl border border-black/10 bg-black/5 p-4 text-xs text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
        >
          <span className="font-semibold">Modo local / sin pagos:</span> Stripe no está configurado en
          las variables de entorno (<code className="font-mono">STRIPE_SECRET_KEY</code>). El sistema opera
          en modo Free sin interrupciones.
        </div>
      ) : null}

      {/* Tarjeta de estado del plan */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-[color:var(--tp-borde)] bg-[var(--tp-superficie)] p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[color:var(--tp-texto)]">Plan actual</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                esPro
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-black/10 text-black/80 dark:bg-white/10 dark:text-white/80'
              }`}
            >
              {esPro ? 'Plan Pro' : 'Plan Free'}
            </span>
          </div>

          <p className="mt-4 text-3xl font-bold tracking-tight text-[color:var(--tp-texto)]">
            {esPro ? '29 €' : '0 €'}
            <span className="text-sm font-normal text-[color:var(--tp-texto-suave)]"> / mes</span>
          </p>
          <p className="mt-1 text-xs text-[color:var(--tp-texto-suave)]">
            {esPro
              ? 'Formularios publicados ilimitados y hasta 10.000 respuestas al mes.'
              : '1 formulario publicado simultáneo y 100 respuestas al mes.'}
          </p>

          <div className="mt-6 border-t border-[color:var(--tp-borde)] pt-6">
            {esPro && resumen.stripeCustomerId && resumen.stripeConfigurado ? (
              esOwner ? (
                <form method="post" action="/api/billing/portal">
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center rounded-lg border border-[color:var(--tp-borde)] bg-[var(--tp-superficie)] px-4 py-2.5 text-sm font-medium text-[color:var(--tp-texto)] transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    Gestionar suscripción y facturas
                  </button>
                </form>
              ) : (
                <p className="text-xs text-[color:var(--tp-texto-suave)]">
                  Solo el propietario del espacio puede modificar la suscripción.
                </p>
              )
            ) : !esPro && resumen.stripeConfigurado ? (
              esOwner ? (
                <form method="post" action="/api/billing/checkout">
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/90"
                  >
                    Actualizar a Plan Pro (29 €/mes)
                  </button>
                </form>
              ) : (
                <p className="text-xs text-[color:var(--tp-texto-suave)]">
                  Pide al propietario del espacio que actualice al plan Pro.
                </p>
              )
            ) : null}
          </div>
        </section>

        {/* Tarjeta de consumo de cuotas */}
        <section className="flex flex-col justify-between rounded-2xl border border-[color:var(--tp-borde)] bg-[var(--tp-superficie)] p-6 shadow-xs">
          <div>
            <h2 className="text-base font-semibold text-[color:var(--tp-texto)]">Uso del espacio</h2>
            <p className="mt-1 text-xs text-[color:var(--tp-texto-suave)]">
              Límites activos según tu plan actual.
            </p>

            <div className="mt-6 space-y-6">
              {/* Formularios publicados */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-[color:var(--tp-texto)]">Formularios publicados</span>
                  <span className="font-mono text-[color:var(--tp-texto-suave)]">
                    {resumen.formulariosPublicados} /{' '}
                    {resumen.formulariosPublicadosMax === Infinity
                      ? 'Ilimitados'
                      : resumen.formulariosPublicadosMax}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className={`h-full transition-all ${
                      porcentajeForms >= 100 && !esPro ? 'bg-amber-500' : 'bg-black dark:bg-white'
                    }`}
                    style={{ width: `${esPro ? 10 : porcentajeForms}%` }}
                  />
                </div>
              </div>

              {/* Respuestas este mes */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-[color:var(--tp-texto)]">Respuestas este mes</span>
                  <span className="font-mono text-[color:var(--tp-texto-suave)]">
                    {resumen.respuestasMes} / {resumen.respuestasMesMax}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className={`h-full transition-all ${
                      porcentajeRespuestas >= 90 ? 'bg-amber-500' : 'bg-black dark:bg-white'
                    }`}
                    style={{ width: `${porcentajeRespuestas}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-[11px] text-[color:var(--tp-texto-suave)]">
            El cómputo de respuestas se reinicia el primer día de cada mes natural.
          </p>
        </section>
      </div>
    </div>
  );
}
