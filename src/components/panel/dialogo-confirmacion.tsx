'use client';

import { Boton } from '@/components/ui/boton';

import { Aviso } from './aviso';
import { Dialogo } from './dialogo';

/**
 * Confirmación de una acción con consecuencias.
 *
 * Se usa para publicar, cerrar y archivar: las tres cambian lo que ven las
 * personas que responden. Duplicar no pasa por aquí porque solo crea una copia
 * nueva y no toca nada de lo existente.
 *
 * Si la acción falla, el diálogo **no se cierra**: el mensaje del servidor se
 * muestra dentro, junto al botón que lo provocó, en lugar de aparecer en otra
 * zona de la pantalla que quizá ni esté a la vista.
 */
export interface PropsDialogoConfirmacion {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly descripcion: string;
  readonly etiquetaConfirmar: string;
  readonly cargando?: boolean;
  /** Mensaje de error de la API, ya en español. `null` mientras no haya fallo. */
  readonly error?: string | null;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
}

export function DialogoConfirmacion({
  abierto,
  titulo,
  descripcion,
  etiquetaConfirmar,
  cargando = false,
  error = null,
  onConfirmar,
  onCancelar,
}: PropsDialogoConfirmacion) {
  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCancelar}
      titulo={titulo}
      descripcion={descripcion}
      pie={
        <>
          <Boton jerarquia="secundaria" onClick={onCancelar} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton onClick={onConfirmar} cargando={cargando}>
            {etiquetaConfirmar}
          </Boton>
        </>
      }
    >
      {error === null ? null : <Aviso titulo="No se ha podido completar la acción">{error}</Aviso>}
    </Dialogo>
  );
}
