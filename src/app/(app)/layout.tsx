/**
 * Armazón del panel del equipo.
 *
 * Es el único punto donde se comprueba la sesión de todo `/app/**`: cualquier
 * página que cuelgue de aquí —incluida la del editor, que construye otra fase—
 * hereda la protección sin repetirla. `requiereSesion()` redirige al login si no
 * hay sesión y a `/acceso-denegado` si la hay pero el workspace ya no vale, así
 * que a partir de esta línea `sesion.user.id` existe sin comprobaciones.
 *
 * La franja de aviso del bypass **no** se monta aquí: ya vive en el layout raíz
 * (`src/app/layout.tsx`) y cubre toda la interfaz.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { signOut } from '@/auth';
import { CabeceraPanel, ESTILO_PANEL, RUTA_FORMULARIOS } from '@/components/panel';
import { RUTA_LOGIN } from '@/lib/auth/rutas';
import { requiereSesion } from '@/lib/auth/sesion';

// Auth.js y Drizzle usan el driver `pg`, que no funciona en Edge.
export const runtime = 'nodejs';
// El panel lee la sesión: nunca puede servirse desde caché estática.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Panel',
    template: '%s · Typeapromo',
  },
};

export default async function LayoutPanel({ children }: Readonly<{ children: ReactNode }>) {
  const sesion = await requiereSesion(RUTA_FORMULARIOS);

  /**
   * Cierre de sesión como acción de servidor: es un `<form>` real, así que
   * funciona igual antes de que hidrate el JavaScript de la página.
   */
  async function cerrarSesion(_datos: FormData): Promise<void> {
    'use server';
    await signOut({ redirectTo: RUTA_LOGIN });
  }

  return (
    <div
      style={ESTILO_PANEL}
      className="flex min-h-dvh flex-col bg-[var(--tp-fondo)] text-[color:var(--tp-texto)]"
    >
      {/*
        Primer elemento enfocable de la página: quien navega con teclado puede
        saltarse la cabecera en lugar de recorrerla en cada pantalla.
      */}
      <a
        href="#contenido-panel"
        className="tp-foco sr-only rounded-[var(--tp-radio)] bg-[var(--tp-superficie)] px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Saltar al contenido
      </a>

      <CabeceraPanel
        nombre={sesion.user.name ?? null}
        correo={sesion.user.email ?? null}
        avatar={sesion.user.image ?? null}
        accionCerrarSesion={cerrarSesion}
      />

      <main id="contenido-panel" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
