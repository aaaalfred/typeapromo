'use client';

import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { Boton } from '@/components/ui/boton';

import { useFormulario } from './contexto';

/**
 * Pie de navegación común a todas las pantallas.
 *
 * La etiqueta del botón principal la decide el motor de recorrido, no el bloque:
 * si la siguiente pantalla ya no es un bloque, la acción es «Enviar». Así el
 * texto es correcto también cuando una regla de lógica salta directamente a una
 * pantalla final.
 */
export interface PropsPieNavegacion {
  /** Etiqueta explícita del botón principal (bienvenida y declaración). */
  readonly etiqueta?: string | undefined;
  /** Oculta el botón «Atrás» aunque haya historial. */
  readonly sinRetroceso?: boolean;
}

export function PieNavegacion({ etiqueta, sinRetroceso = false }: PropsPieNavegacion) {
  const { tema, retroceder, puedeRetroceder, enviando, esUltimoPaso } = useFormulario();
  const texto = etiqueta ?? (esUltimoPaso ? 'Enviar' : 'Siguiente');

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      style={{ justifyContent: 'var(--tp-alineacion-flex)' }}
    >
      {puedeRetroceder && !sinRetroceso ? (
        <Boton jerarquia="secundaria" tamano="sm" onClick={retroceder} disabled={enviando}>
          <ChevronLeft aria-hidden="true" className="size-4" />
          Atrás
        </Boton>
      ) : null}

      {/*
        Es un `submit` de verdad: el envío del `<form>` de `MarcoPantalla` es el
        único camino para avanzar, así que el clic y el Intro del teclado acaban
        exactamente en el mismo sitio.
      */}
      <Boton type="submit" estiloTema={tema.buttonStyle} cargando={enviando} data-accion="avanzar">
        {texto}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Boton>
    </div>
  );
}

/** Pista de teclado bajo el pie. Solo se muestra donde el atajo existe. */
export function PistaTeclado({ children }: { readonly children: ReactNode }) {
  return (
    <p
      className="text-[color:var(--tp-texto-suave)]"
      style={{ fontSize: 'var(--tp-tamano-menudo)' }}
    >
      {children}
    </p>
  );
}
