/**
 * Página de acceso denegado.
 *
 * Recibe el motivo del guard de workspace (`?motivo=…`, emitido por el callback
 * `signIn` de Auth.js) y, en su defecto, el código de error genérico de Auth.js
 * (`?error=…`, porque `pages.error` apunta aquí). Nunca muestra detalles
 * técnicos del proveedor: solo qué ha pasado y qué puede hacer la persona.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

import { mensajeDeRechazo, PARAM_MOTIVO, RUTA_LOGIN } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Acceso denegado',
  description: 'No ha sido posible acceder al panel con esta cuenta.',
};

export const dynamic = 'force-dynamic';

interface PropiedadesPagina {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function primerValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaAccesoDenegado({ searchParams }: PropiedadesPagina) {
  const parametros = await searchParams;
  const motivo = primerValor(parametros[PARAM_MOTIVO]);
  const { titulo, detalle } = mensajeDeRechazo(motivo);

  return (
    <section
      aria-labelledby="titulo-acceso-denegado"
      className="rounded-2xl border border-red-500/30 bg-red-50 p-8 shadow-sm dark:bg-red-950/30"
    >
      <ShieldAlert aria-hidden="true" className="size-8 text-red-700 dark:text-red-400" />
      <h1
        id="titulo-acceso-denegado"
        className="mt-4 text-2xl font-semibold tracking-tight text-red-950 dark:text-red-100"
      >
        {titulo}
      </h1>
      <p className="mt-3 text-sm text-red-950/80 dark:text-red-100/80">{detalle}</p>

      <Link
        href={RUTA_LOGIN}
        className="mt-8 inline-flex items-center justify-center rounded-lg border border-red-700/40 px-4 py-2.5 text-sm font-medium text-red-950 transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:text-red-100 dark:hover:bg-red-900/40"
      >
        Volver a intentarlo
      </Link>
    </section>
  );
}
