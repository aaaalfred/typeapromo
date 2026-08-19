'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { ESTILO_PANEL } from './tema-panel';

/**
 * Envoltorio de diálogo modal del panel.
 *
 * Se apoya en Radix y no en un `<div>` con `role="dialog"` a mano porque lo que
 * cuesta de un modal no es el marco: es atrapar el foco dentro, devolverlo al
 * disparador al cerrar, ocultar el resto del árbol a la tecnología asistiva y
 * responder a `Escape`. Todo eso lo trae Radix ya resuelto.
 *
 * `Dialog.Description` solo se monta cuando hay descripción: montarla vacía
 * dejaría un `aria-describedby` apuntando a la nada.
 *
 * El contenido lleva `ESTILO_PANEL` repetido a proposito. `Dialog.Portal` lo
 * cuelga de `document.body`, fuera del `<div>` de `(app)/layout` donde se
 * declaran los `--tp-*`, y las custom properties se heredan por el arbol del
 * DOM: sin esto el dialogo se pinta sin fondo y sus botones sin color, dejando
 * ver la pagina de debajo.
 */
export interface PropsDialogo {
  readonly abierto: boolean;
  /** Se invoca al cerrar por `Escape`, por el fondo o por la aspa. */
  readonly onCerrar: () => void;
  readonly titulo: string;
  readonly descripcion?: ReactNode;
  /** Cuerpo del diálogo. */
  readonly children?: ReactNode;
  /** Acciones, alineadas al final. */
  readonly pie?: ReactNode;
}

export function Dialogo({ abierto, onCerrar, titulo, descripcion, children, pie }: PropsDialogo) {
  return (
    <Dialog.Root
      open={abierto}
      onOpenChange={(siguiente) => {
        if (!siguiente) onCerrar();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          style={ESTILO_PANEL}
          className="fixed top-1/2 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--tp-radio-superficie)] border border-[color:var(--tp-borde)] bg-[var(--tp-superficie)] p-6 text-[color:var(--tp-texto)] shadow-xl"
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold tracking-tight">{titulo}</Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar el diálogo"
              className="tp-foco -m-1 rounded-[var(--tp-radio)] p-1 text-[color:var(--tp-texto-suave)] transition-colors hover:text-[color:var(--tp-texto)]"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>

          {descripcion === undefined ? null : (
            <Dialog.Description className="mt-2 text-sm text-[color:var(--tp-texto-suave)]">
              {descripcion}
            </Dialog.Description>
          )}

          {children === undefined || children === null ? null : (
            <div className="mt-4">{children}</div>
          )}

          {pie === undefined ? null : (
            <div className="mt-6 flex flex-wrap justify-end gap-2">{pie}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
