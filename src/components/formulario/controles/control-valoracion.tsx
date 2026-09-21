'use client';

import { Angry, Frown, Heart, Laugh, Meh, Smile, Star, type LucideIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';

import { cn } from '@/components/ui/cn';
import { normalize, type RatingAppearance, type RatingBlock } from '@/lib/forms';

import { describedBy, idsDePantalla, useFormulario } from '../contexto';

/**
 * Valoración visual: **un único control configurable**, no tres controles.
 *
 * La apariencia (`stars`, `faces`, `hearts`) y la escala (3, 5, 7 o 10) son dos
 * ejes independientes del contrato, así que aquí solo cambian el icono y el
 * número de elementos. El comportamiento — semántica de `radiogroup`, foco
 * itinerante, flechas, Inicio/Fin, dígitos y borrado — es idéntico en las doce
 * combinaciones.
 *
 * Lo que se persiste es el **entero elegido**; la normalización a `[0, 1]` la
 * calcula `normalize()` de `@/lib/forms` al leer, y se expone en el DOM como
 * `data-valor-normalizado` para que la analítica y los tests puedan verla sin
 * duplicar la fórmula.
 */

const ICONOS: Readonly<Record<Exclude<RatingAppearance, 'faces'>, LucideIcon>> = {
  stars: Star,
  hearts: Heart,
};

/** Caras ordenadas de peor a mejor. Se reparten a lo largo de la escala. */
const CARAS: readonly LucideIcon[] = [Angry, Frown, Meh, Smile, Laugh];

const NOMBRE_APARIENCIA: Readonly<Record<RatingAppearance, string>> = {
  stars: 'estrellas',
  faces: 'caras',
  hearts: 'corazones',
};

/**
 * `stars` y `hearts` se rellenan de forma **acumulativa** (tres estrellas
 * marcadas significan «3»); `faces` no, porque cada cara es un gesto distinto y
 * mostrar varias a la vez no significaría nada.
 */
function esAcumulativa(apariencia: RatingAppearance): boolean {
  return apariencia !== 'faces';
}

function iconoDe(apariencia: RatingAppearance, valor: number, escala: number): LucideIcon {
  if (apariencia !== 'faces') return ICONOS[apariencia];
  const posicion = Math.min(
    CARAS.length - 1,
    Math.round(normalize(valor, escala) * (CARAS.length - 1)),
  );
  return CARAS[posicion] ?? Meh;
}

function tamanoIcono(escala: number): string {
  return escala >= 10 ? 'size-7 @sm:size-9' : 'size-9 @sm:size-11';
}

export function ControlValoracion({ bloque }: { readonly bloque: RatingBlock }) {
  const { respuestas, establecerRespuesta, error } = useFormulario();
  const ids = idsDePantalla(bloque.id);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const [resaltado, setResaltado] = useState<number | null>(null);

  const bruto = respuestas[bloque.id];
  const valor = typeof bruto === 'number' ? bruto : null;
  const escala = bloque.scale;
  const valores = Array.from({ length: escala }, (_, indice) => indice + 1);
  const acumulativa = esAcumulativa(bloque.appearance);
  const referencia = resaltado ?? valor;

  const descritoPor = describedBy(
    bloque.description !== undefined && bloque.description !== '' ? ids.descripcion : null,
    error !== null ? ids.error : null,
  );

  function seleccionar(nuevo: number | null): void {
    establecerRespuesta(bloque.id, nuevo);
    if (nuevo !== null) botones.current[nuevo - 1]?.focus();
  }

  function manejarTeclado(evento: KeyboardEvent<HTMLDivElement>): void {
    const actual = valor;
    switch (evento.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        evento.preventDefault();
        seleccionar(actual === null ? 1 : Math.min(escala, actual + 1));
        return;
      case 'ArrowLeft':
      case 'ArrowDown':
        evento.preventDefault();
        seleccionar(actual === null ? escala : Math.max(1, actual - 1));
        return;
      case 'Home':
        evento.preventDefault();
        seleccionar(1);
        return;
      case 'End':
        evento.preventDefault();
        seleccionar(escala);
        return;
      case 'Backspace':
      case 'Delete':
        if (bloque.required) return;
        evento.preventDefault();
        establecerRespuesta(bloque.id, null);
        return;
      default:
        break;
    }

    if (evento.key.length === 1 && evento.key >= '0' && evento.key <= '9') {
      const digito = evento.key === '0' ? 10 : Number(evento.key);
      if (digito >= 1 && digito <= escala) {
        evento.preventDefault();
        seleccionar(digito);
      }
    }
  }

  /** Elemento con `tabindex=0` del foco itinerante. */
  const tabulable = valor ?? 1;

  return (
    <div className="flex flex-col gap-2" style={{ alignItems: 'var(--tp-alineacion-flex)' }}>
      <div
        role="radiogroup"
        aria-labelledby={ids.titulo}
        aria-describedby={descritoPor}
        aria-required={bloque.required}
        aria-invalid={error !== null}
        data-apariencia={bloque.appearance}
        data-escala={escala}
        data-valor={valor ?? undefined}
        data-valor-normalizado={valor === null ? undefined : normalize(valor, escala)}
        onKeyDown={manejarTeclado}
        onMouseLeave={() => {
          setResaltado(null);
        }}
        className="flex flex-wrap items-center gap-1"
      >
        {valores.map((numero) => {
          const Icono = iconoDe(bloque.appearance, numero, escala);
          const marcado = valor === numero;
          const encendido =
            referencia !== null && (acumulativa ? numero <= referencia : numero === referencia);
          const extremo =
            numero === 1 ? bloque.labels?.min : numero === escala ? bloque.labels?.max : undefined;

          return (
            <button
              key={numero}
              ref={(elemento) => {
                botones.current[numero - 1] = elemento;
              }}
              type="button"
              role="radio"
              aria-checked={marcado}
              aria-label={
                extremo === undefined || extremo === ''
                  ? `${String(numero)} de ${String(escala)}`
                  : `${String(numero)} de ${String(escala)}: ${extremo}`
              }
              tabIndex={numero === tabulable ? 0 : -1}
              data-autofoco={numero === tabulable ? 'true' : undefined}
              data-encendido={encendido ? 'true' : 'false'}
              onClick={() => {
                seleccionar(numero);
              }}
              onMouseEnter={() => {
                setResaltado(numero);
              }}
              onFocus={() => {
                setResaltado(null);
              }}
              className={cn(
                'tp-foco cursor-pointer rounded-[var(--tp-radio)] p-1 transition-transform duration-150',
                'hover:scale-110',
              )}
            >
              <Icono
                aria-hidden="true"
                className={cn(
                  tamanoIcono(escala),
                  'transition-colors duration-150',
                  encendido
                    ? 'text-[color:var(--tp-acento)]'
                    : 'text-[color:var(--tp-texto-suave)] opacity-45',
                )}
                fill={encendido && acumulativa ? 'currentColor' : 'none'}
                strokeWidth={1.75}
              />
            </button>
          );
        })}
      </div>

      {bloque.labels?.min !== undefined || bloque.labels?.max !== undefined ? (
        <div
          aria-hidden="true"
          className="flex w-full items-center justify-between gap-4 text-[color:var(--tp-texto-suave)]"
          style={{ fontSize: 'var(--tp-tamano-menudo)' }}
        >
          <span>{bloque.labels.min ?? ''}</span>
          <span>{bloque.labels.max ?? ''}</span>
        </div>
      ) : null}

      <p
        className="text-[color:var(--tp-texto-suave)]"
        style={{ fontSize: 'var(--tp-tamano-menudo)' }}
      >
        {valor === null
          ? `Elige una valoración de 1 a ${String(escala)} (${NOMBRE_APARIENCIA[bloque.appearance]}).`
          : `Has elegido ${String(valor)} de ${String(escala)}.`}
      </p>
    </div>
  );
}
