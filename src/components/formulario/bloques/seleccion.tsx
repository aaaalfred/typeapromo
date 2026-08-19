'use client';

import type { MultiChoiceBlock, SingleChoiceBlock } from '@/lib/forms';

import { ListaOpciones } from '../controles/lista-opciones';
import { MarcoPantalla } from '../marco-pantalla';
import { PieNavegacion } from '../pie-navegacion';

/**
 * Selección única. Las cuatro presentaciones del contrato (`list`, `buttons`,
 * `image_cards`, `grid`) las resuelve `ListaOpciones`: aquí solo se decide la
 * pantalla.
 */
export function BloqueSeleccionUnica({ bloque }: { readonly bloque: SingleChoiceBlock }) {
  return (
    <MarcoPantalla bloque={bloque} pie={<PieNavegacion />}>
      <ListaOpciones bloque={bloque} />
    </MarcoPantalla>
  );
}

/** Selección múltiple, con las mismas cuatro presentaciones. */
export function BloqueSeleccionMultiple({ bloque }: { readonly bloque: MultiChoiceBlock }) {
  return (
    <MarcoPantalla bloque={bloque} pie={<PieNavegacion />}>
      <ListaOpciones bloque={bloque} />
    </MarcoPantalla>
  );
}
