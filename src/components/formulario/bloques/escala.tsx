'use client';

import type { RatingBlock, ScaleBlock } from '@/lib/forms';

import { ControlEscala } from '../controles/control-escala';
import { ControlValoracion } from '../controles/control-valoracion';
import { MarcoPantalla } from '../marco-pantalla';
import { PieNavegacion } from '../pie-navegacion';

/** Escala numérica con etiquetas opcionales en los extremos. */
export function BloqueEscala({ bloque }: { readonly bloque: ScaleBlock }) {
  return (
    <MarcoPantalla bloque={bloque} pie={<PieNavegacion />}>
      <ControlEscala bloque={bloque} />
    </MarcoPantalla>
  );
}

/** Valoración visual: estrellas, caras o corazones × escala 3, 5, 7 o 10. */
export function BloqueValoracion({ bloque }: { readonly bloque: RatingBlock }) {
  return (
    <MarcoPantalla bloque={bloque} pie={<PieNavegacion />}>
      <ControlValoracion bloque={bloque} />
    </MarcoPantalla>
  );
}
