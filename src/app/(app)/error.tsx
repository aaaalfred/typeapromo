'use client';

/**
 * Frontera de error del panel.
 *
 * Cubre lo que el listado no puede: un fallo al renderizar en el servidor, o una
 * excepción de un componente. Sin esto, la pantalla caería en el error genérico
 * de Next, fuera del panel y sin forma de reintentar.
 *
 * El `digest` se muestra porque en producción es lo único que permite encontrar
 * la traza real en el log del servidor; el mensaje de la excepción se omite allí
 * a propósito para no filtrar detalles internos.
 */

import { useEffect } from 'react';

import { Aviso } from '@/components/panel';

export default function ErrorDelPanel({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error('[panel] error no controlado', error);
  }, [error]);

  return (
    <Aviso titulo="El panel no ha podido cargarse" etiquetaAccion="Reintentar" onAccion={reset}>
      Ha ocurrido un error inesperado.{' '}
      {error.digest === undefined ? null : (
        <>
          Referencia para el registro del servidor: <code className="font-mono">{error.digest}</code>
          .
        </>
      )}
    </Aviso>
  );
}
