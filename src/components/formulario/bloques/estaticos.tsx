'use client';

import { ArrowRight } from 'lucide-react';

import { variantesBoton } from '@/components/ui/boton';
import type { EndingBlock, StatementBlock, WelcomeBlock } from '@/lib/forms';

import { useFormulario } from '../contexto';
import { MarcoPantalla } from '../marco-pantalla';
import { PieNavegacion } from '../pie-navegacion';

/**
 * Pantalla de bienvenida.
 *
 * No recoge respuesta y nunca ofrece «Atrás»: es la primera pantalla del
 * recorrido y volver de ella no significa nada.
 */
export function BloqueBienvenida({ bloque }: { readonly bloque: WelcomeBlock }) {
  return (
    <MarcoPantalla
      bloque={bloque}
      cuerpo={bloque.body}
      pie={<PieNavegacion etiqueta={bloque.buttonLabel ?? 'Empezar'} sinRetroceso />}
    />
  );
}

/** Declaración informativa: texto y un botón para continuar. */
export function BloqueDeclaracion({ bloque }: { readonly bloque: StatementBlock }) {
  return (
    <MarcoPantalla
      bloque={bloque}
      cuerpo={bloque.body}
      pie={<PieNavegacion etiqueta={bloque.buttonLabel ?? 'Continuar'} />}
    />
  );
}

/**
 * Pantalla final.
 *
 * Es terminal: no hay botón de avance porque el recorrido ya ha acabado. La
 * llamada a la acción, si el documento la declara, es un enlace de verdad para
 * que el navegador la trate como tal.
 */
export function BloqueFinal({ bloque }: { readonly bloque: EndingBlock }) {
  const { tema } = useFormulario();
  const conCta = bloque.ctaUrl !== undefined && bloque.ctaUrl !== '';

  return (
    <MarcoPantalla
      bloque={bloque}
      cuerpo={bloque.body}
      pie={
        conCta ? (
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ justifyContent: 'var(--tp-alineacion-flex)' }}
          >
            <a
              href={bloque.ctaUrl}
              rel="noreferrer noopener"
              className={variantesBoton({ apariencia: tema.buttonStyle })}
            >
              {bloque.ctaLabel ?? 'Continuar'}
              <ArrowRight aria-hidden="true" className="size-4" />
            </a>
          </div>
        ) : null
      }
    />
  );
}
