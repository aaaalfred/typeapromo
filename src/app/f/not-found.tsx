import { PantallaMensaje } from '@/components/publico';

/**
 * 404 de la experiencia pública.
 *
 * Se reserva para un slug que **no corresponde a ningún formulario**. Un
 * formulario cerrado o archivado no llega aquí: tiene su propia pantalla con el
 * mensaje configurado en el documento publicado.
 *
 * Sin tema, porque no hay formulario del que sacarlo.
 */
export default function NoEncontrado() {
  return (
    <PantallaMensaje
      titulo="No hemos encontrado este formulario"
      mensaje="La dirección no corresponde a ningún formulario. Comprueba el enlace o pide uno nuevo a quien te lo envió."
    />
  );
}
