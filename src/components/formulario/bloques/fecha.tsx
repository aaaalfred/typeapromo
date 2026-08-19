'use client';

import { CampoTexto } from '@/components/ui/campo';
import type { DateBlock } from '@/lib/forms';

import { MarcoPantalla } from '../marco-pantalla';
import { PieNavegacion } from '../pie-navegacion';

import { textoDe, useControl } from './comun';

/**
 * Fecha civil, sin zona horaria.
 *
 * Se usa el control nativo `type="date"`: aporta gratis el calendario del
 * sistema, la localización del formato y la navegación por teclado por partes
 * (día, mes, año), que ningún calendario propio iguala en accesibilidad. El
 * valor que viaja es siempre `YYYY-MM-DD`, exactamente lo que espera el
 * contrato.
 */
export function BloqueFecha({ bloque }: { readonly bloque: DateBlock }) {
  const { valor, establecer, atributos } = useControl(bloque);

  return (
    <MarcoPantalla bloque={bloque} pie={<PieNavegacion />}>
      <CampoTexto
        {...atributos}
        type="date"
        value={textoDe(valor)}
        min={bloque.validation?.min}
        max={bloque.validation?.max}
        className="max-w-xs"
        onChange={(evento) => {
          establecer(evento.target.value);
        }}
      />
    </MarcoPantalla>
  );
}
