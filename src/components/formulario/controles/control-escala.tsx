'use client';

import { useRef, type KeyboardEvent } from 'react';

import { cn } from '@/components/ui/cn';
import type { ScaleBlock } from '@/lib/forms';

import { describedBy, idsDePantalla, useFormulario } from '../contexto';

/**
 * Escala numérica.
 *
 * Hasta once valores se pinta como una fila de botones — la forma habitual de
 * un NPS y la más rápida de responder con teclado. A partir de ahí una fila deja
 * de ser usable y se pinta un deslizador. **No es una rama de previsualización**:
 * depende únicamente del contenido del bloque, así que el editor y la
 * experiencia pública eligen siempre lo mismo para el mismo documento.
 */
const MAXIMO_BOTONES = 11;

function valoresDe(bloque: ScaleBlock): number[] {
  const paso = Math.max(1, bloque.step);
  const valores: number[] = [];
  for (let valor = bloque.min; valor <= bloque.max; valor += paso) valores.push(valor);
  return valores;
}

function EtiquetasExtremas({ bloque }: { readonly bloque: ScaleBlock }) {
  if (bloque.labels?.min === undefined && bloque.labels?.max === undefined) return null;
  return (
    <div
      aria-hidden="true"
      className="flex w-full items-center justify-between gap-4 text-[color:var(--tp-texto-suave)]"
      style={{ fontSize: 'var(--tp-tamano-menudo)' }}
    >
      <span>{bloque.labels.min ?? ''}</span>
      <span>{bloque.labels.max ?? ''}</span>
    </div>
  );
}

export function ControlEscala({ bloque }: { readonly bloque: ScaleBlock }) {
  const { respuestas, establecerRespuesta, error } = useFormulario();
  const ids = idsDePantalla(bloque.id);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  const bruto = respuestas[bloque.id];
  const valor = typeof bruto === 'number' ? bruto : null;
  const valores = valoresDe(bloque);

  const descritoPor = describedBy(
    bloque.description !== undefined && bloque.description !== '' ? ids.descripcion : null,
    error !== null ? ids.error : null,
  );

  const etiquetaExtremo = (numero: number): string | undefined =>
    numero === bloque.min ? bloque.labels?.min : numero === bloque.max ? bloque.labels?.max : undefined;

  if (valores.length > MAXIMO_BOTONES) {
    const actual = valor ?? bloque.min;
    return (
      <div className="flex w-full flex-col gap-3">
        {/*
          Deslizador nativo: trae de serie el rol `slider`, las flechas,
          Inicio/Fin, RePág/AvPág y el gesto táctil, que ninguna reimplementación
          iguala. Solo se le cambia el color de la pista con `accent-color`.
        */}
        <input
          type="range"
          data-control="deslizador"
          data-autofoco="true"
          value={actual}
          min={bloque.min}
          max={bloque.max}
          step={bloque.step}
          aria-labelledby={ids.titulo}
          aria-describedby={descritoPor}
          aria-valuetext={String(actual)}
          onChange={(evento) => {
            establecerRespuesta(bloque.id, Number(evento.target.value));
          }}
          className="tp-foco w-full accent-[var(--tp-acento)]"
        />
        <EtiquetasExtremas bloque={bloque} />
        <p
          className="text-[color:var(--tp-texto-suave)]"
          style={{ fontSize: 'var(--tp-tamano-menudo)' }}
        >
          {valor === null
            ? `Arrastra o usa las flechas para elegir un valor entre ${String(bloque.min)} y ${String(bloque.max)}.`
            : `Has elegido ${String(valor)}.`}
        </p>
      </div>
    );
  }

  const tabulable = valor ?? valores[0] ?? bloque.min;

  function seleccionar(nuevo: number): void {
    establecerRespuesta(bloque.id, nuevo);
    const indice = valores.indexOf(nuevo);
    if (indice >= 0) botones.current[indice]?.focus();
  }

  function manejarTeclado(evento: KeyboardEvent<HTMLDivElement>): void {
    const indiceActual = valor === null ? -1 : valores.indexOf(valor);
    const ultimo = valores.length - 1;
    let destino: number | null = null;

    switch (evento.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        destino = indiceActual < 0 ? 0 : Math.min(ultimo, indiceActual + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        destino = indiceActual < 0 ? ultimo : Math.max(0, indiceActual - 1);
        break;
      case 'Home':
        destino = 0;
        break;
      case 'End':
        destino = ultimo;
        break;
      default:
        return;
    }

    const nuevo = valores[destino];
    if (nuevo === undefined) return;
    evento.preventDefault();
    seleccionar(nuevo);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        role="radiogroup"
        aria-labelledby={ids.titulo}
        aria-describedby={descritoPor}
        aria-required={bloque.required}
        aria-invalid={error !== null}
        data-control="botones"
        data-valor={valor ?? undefined}
        onKeyDown={manejarTeclado}
        className="flex flex-wrap gap-1.5"
        style={{ justifyContent: 'var(--tp-alineacion-flex)' }}
      >
        {valores.map((numero, indice) => {
          const marcado = valor === numero;
          const extremo = etiquetaExtremo(numero);
          return (
            <button
              key={numero}
              ref={(elemento) => {
                botones.current[indice] = elemento;
              }}
              type="button"
              role="radio"
              aria-checked={marcado}
              aria-label={
                extremo === undefined || extremo === ''
                  ? String(numero)
                  : `${String(numero)}: ${extremo}`
              }
              tabIndex={numero === tabulable ? 0 : -1}
              data-autofoco={numero === tabulable ? 'true' : undefined}
              data-estado={marcado ? 'seleccionado' : 'libre'}
              onClick={() => {
                seleccionar(numero);
              }}
              className={cn(
                'tp-foco min-w-11 cursor-pointer rounded-[var(--tp-radio)] border px-3 py-2.5',
                'border-[color:var(--tp-borde)] bg-[var(--tp-control-fondo)]',
                'transition-colors duration-150 hover:bg-[var(--tp-control-fondo-hover)]',
                'data-[estado=seleccionado]:border-[color:var(--tp-acento)]',
                'data-[estado=seleccionado]:bg-[var(--tp-control-fondo-activo)]',
              )}
            >
              {numero}
            </button>
          );
        })}
      </div>
      <EtiquetasExtremas bloque={bloque} />
    </div>
  );
}
