import Link from 'next/link';

import { Boton } from '@/components/ui/boton';
import { Imagen } from '@/components/ui/imagen';

import { iniciales } from './formato';
import { RUTA_FORMULARIOS } from './rutas-panel';

/**
 * Cabecera del panel: identidad de quien ha entrado y salida.
 *
 * No lleva `'use client'`. El cierre de sesión es una acción de servidor que
 * recibe por props, de modo que funciona aunque JavaScript no haya cargado
 * todavía: es un `<form>` de verdad, no un `onClick`. Convertir la cabecera en
 * componente de cliente obligaría a pasar por `signOut()` del lado del
 * navegador y a arrastrar la sesión hasta él sin ninguna ganancia.
 *
 * La identidad se muestra con nombre y correo porque el avatar de Slack puede
 * faltar y, cuando está, es decorativo: el dato que dice *quién eres* es el
 * texto.
 */
export interface PropsCabeceraPanel {
  readonly nombre: string | null;
  readonly correo: string | null;
  readonly avatar: string | null;
  /** Acción de servidor que cierra la sesión y redirige. */
  readonly accionCerrarSesion: (datos: FormData) => Promise<void>;
}

export function CabeceraPanel({
  nombre,
  correo,
  avatar,
  accionCerrarSesion,
}: PropsCabeceraPanel) {
  const etiqueta = nombre ?? correo ?? 'Sesión iniciada';

  return (
    <header className="border-b border-[color:var(--tp-borde)] bg-[var(--tp-superficie)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href={RUTA_FORMULARIOS}
            className="tp-foco rounded-[var(--tp-radio)] text-base font-semibold tracking-tight"
          >
            Typeapromo
          </Link>
          <nav aria-label="Secciones del panel">
            <Link
              href={RUTA_FORMULARIOS}
              className="tp-foco rounded-[var(--tp-radio)] px-1 py-1 text-sm text-[color:var(--tp-texto-suave)] underline-offset-4 transition-colors hover:text-[color:var(--tp-texto)] hover:underline"
            >
              Formularios
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {avatar === null ? (
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-[var(--tp-acento-suave)] text-xs font-semibold"
              >
                {iniciales(nombre, correo)}
              </span>
            ) : (
              <Imagen src={avatar} alt="" className="size-8 rounded-full" />
            )}
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-medium">{etiqueta}</span>
              {correo === null || correo === etiqueta ? null : (
                <span className="text-xs text-[color:var(--tp-texto-suave)]">{correo}</span>
              )}
            </span>
          </div>

          <form action={accionCerrarSesion}>
            <Boton type="submit" estiloTema="outline" tamano="sm">
              Cerrar sesión
            </Boton>
          </form>
        </div>
      </div>
    </header>
  );
}
