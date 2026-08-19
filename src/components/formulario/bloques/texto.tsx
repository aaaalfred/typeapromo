'use client';

import type { KeyboardEvent } from 'react';

import { AreaTexto, CampoTexto } from '@/components/ui/campo';
import type { EmailBlock, LongTextBlock, ShortTextBlock } from '@/lib/forms';

import { MarcoPantalla } from '../marco-pantalla';
import { PieNavegacion, PistaTeclado } from '../pie-navegacion';

import { textoDe, useControl } from './comun';

/** Pista de teclado de los campos de una sola línea. */
function PistaIntro() {
  return (
    <PistaTeclado>
      Pulsa <Tecla>Intro</Tecla> para continuar
    </PistaTeclado>
  );
}

function Tecla({ children }: { readonly children: string }) {
  return (
    <kbd className="rounded-[4px] border border-[color:var(--tp-borde)] px-1.5 py-0.5 font-sans">
      {children}
    </kbd>
  );
}

/* -------------------------------------------------------------------------- */

export function BloqueTextoCorto({ bloque }: { readonly bloque: ShortTextBlock }) {
  const { valor, establecer, atributos } = useControl(bloque);

  return (
    <MarcoPantalla bloque={bloque} pie={<PieNavegacion />} pista={<PistaIntro />}>
      <CampoTexto
        {...atributos}
        type="text"
        value={textoDe(valor)}
        placeholder={bloque.placeholder}
        maxLength={bloque.validation?.maxLength}
        onChange={(evento) => {
          establecer(evento.target.value);
        }}
      />
    </MarcoPantalla>
  );
}

/* -------------------------------------------------------------------------- */

export function BloqueTextoLargo({ bloque }: { readonly bloque: LongTextBlock }) {
  const { valor, establecer, atributos, avanzar } = useControl(bloque);

  /**
   * En un área de texto Intro inserta un salto de línea, que es lo que espera
   * quien escribe. El atajo para avanzar pasa a ser Ctrl/Cmd + Intro.
   */
  function manejarTeclado(evento: KeyboardEvent<HTMLTextAreaElement>): void {
    if (evento.key === 'Enter' && (evento.ctrlKey || evento.metaKey)) {
      evento.preventDefault();
      avanzar();
    }
  }

  return (
    <MarcoPantalla
      bloque={bloque}
      pie={<PieNavegacion />}
      pista={
        <PistaTeclado>
          Pulsa <Tecla>Ctrl</Tecla> + <Tecla>Intro</Tecla> para continuar
        </PistaTeclado>
      }
    >
      <AreaTexto
        {...atributos}
        rows={bloque.rows}
        value={textoDe(valor)}
        placeholder={bloque.placeholder}
        maxLength={bloque.validation?.maxLength}
        onKeyDown={manejarTeclado}
        onChange={(evento) => {
          establecer(evento.target.value);
        }}
      />
    </MarcoPantalla>
  );
}

/* -------------------------------------------------------------------------- */

export function BloqueEmail({ bloque }: { readonly bloque: EmailBlock }) {
  const { valor, establecer, atributos } = useControl(bloque);

  return (
    <MarcoPantalla bloque={bloque} pie={<PieNavegacion />} pista={<PistaIntro />}>
      <CampoTexto
        {...atributos}
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        value={textoDe(valor)}
        placeholder={bloque.placeholder ?? 'nombre@ejemplo.com'}
        onChange={(evento) => {
          establecer(evento.target.value);
        }}
      />
    </MarcoPantalla>
  );
}
