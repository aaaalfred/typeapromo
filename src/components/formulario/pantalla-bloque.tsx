'use client';

import type { ReactElement } from 'react';

import type { BlockDefinition } from '@/lib/forms';

import { BloqueEscala, BloqueValoracion } from './bloques/escala';
import { BloqueBienvenida, BloqueDeclaracion, BloqueFinal } from './bloques/estaticos';
import { BloqueFecha } from './bloques/fecha';
import { BloqueSeleccionMultiple, BloqueSeleccionUnica } from './bloques/seleccion';
import { BloqueEmail, BloqueTextoCorto, BloqueTextoLargo } from './bloques/texto';

/**
 * Único punto de despacho por tipo de bloque.
 *
 * El `switch` es exhaustivo sobre la unión discriminada del contrato: si la
 * fase 2 añade un doceavo tipo, TypeScript falla aquí y en ningún otro sitio.
 * No hay ninguna otra condición sobre `type` en todo el renderer.
 */
export function PantallaBloque({ bloque }: { readonly bloque: BlockDefinition }): ReactElement {
  switch (bloque.type) {
    case 'short_text':
      return <BloqueTextoCorto bloque={bloque} />;
    case 'long_text':
      return <BloqueTextoLargo bloque={bloque} />;
    case 'email':
      return <BloqueEmail bloque={bloque} />;
    case 'date':
      return <BloqueFecha bloque={bloque} />;
    case 'single_choice':
      return <BloqueSeleccionUnica bloque={bloque} />;
    case 'multi_choice':
      return <BloqueSeleccionMultiple bloque={bloque} />;
    case 'scale':
      return <BloqueEscala bloque={bloque} />;
    case 'rating':
      return <BloqueValoracion bloque={bloque} />;
    case 'statement':
      return <BloqueDeclaracion bloque={bloque} />;
    case 'welcome':
      return <BloqueBienvenida bloque={bloque} />;
    case 'ending':
      return <BloqueFinal bloque={bloque} />;
  }
}
