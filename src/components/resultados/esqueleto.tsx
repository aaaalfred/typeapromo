'use client';

/**
 * Esqueleto de carga de la pantalla de resultados.
 *
 * Es **decorativo** (`aria-hidden`) a propósito: quien no ve la pantalla ya
 * recibe el aviso del párrafo `role="status"` que hay encima («Cargando
 * resultados…»), y anunciarlo dos veces solo produciría ruido. El esqueleto está
 * para que quien sí la ve sepa que la página no se ha quedado en blanco.
 *
 * No se reutiliza `EsqueletoListado` del panel porque su texto alternativo dice
 * «Cargando formularios…», que aquí sería mentira.
 */
export function EsqueletoResultados({ filas = 4 }: { readonly filas?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: filas }, (_valor, indice) => (
        <div
          key={indice}
          className="h-28 animate-pulse rounded-[var(--tp-radio-superficie)] border border-[color:var(--tp-borde)] bg-[var(--tp-control-fondo)]"
        />
      ))}
    </div>
  );
}
