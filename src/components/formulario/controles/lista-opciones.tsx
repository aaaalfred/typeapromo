'use client';

import { Check } from 'lucide-react';
import { useMemo, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/components/ui/cn';
import { Imagen } from '@/components/ui/imagen';
import type { ChoiceBlock, ChoiceDefinition, ChoicePresentation } from '@/lib/forms';

import { describedBy, idsDePantalla, useFormulario } from '../contexto';
import { resolverOpcional } from '../medios';

/* -------------------------------------------------------------------------- */
/* Presentación                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Los cuatro estilos de selección comparten semántica y solo cambian de forma.
 *
 * Es una decisión deliberada: `single_choice` es siempre un `radiogroup` con
 * foco itinerante y `multi_choice` es siempre un grupo de casillas, se pinte
 * como lista, como botones, como tarjetas o como cuadrícula. Quien navega con
 * teclado o con lector de pantalla percibe el mismo control en los cuatro.
 */
const CLASES_CONTENEDOR: Readonly<Record<ChoicePresentation, string>> = {
  list: 'flex flex-col gap-2',
  buttons: 'flex flex-wrap gap-2',
  image_cards: 'grid grid-cols-1 gap-3 @sm:grid-cols-2',
  grid: 'grid grid-cols-2 gap-3 @sm:grid-cols-3',
};

const CLASES_ITEM_BASE = [
  'tp-foco relative flex cursor-pointer border text-left transition-colors duration-150',
  'border-[color:var(--tp-borde)] bg-[var(--tp-control-fondo)]',
  'hover:bg-[var(--tp-control-fondo-hover)]',
  'data-[estado=seleccionado]:border-[color:var(--tp-acento)]',
  'data-[estado=seleccionado]:bg-[var(--tp-control-fondo-activo)]',
];

const CLASES_ITEM: Readonly<Record<ChoicePresentation, string>> = {
  list: 'w-full items-center gap-3 rounded-[var(--tp-radio-superficie)] px-4 py-3',
  buttons: 'items-center gap-2 rounded-[var(--tp-radio)] px-4 py-2',
  image_cards: 'w-full flex-col overflow-hidden rounded-[var(--tp-radio-superficie)]',
  grid: 'w-full flex-col overflow-hidden rounded-[var(--tp-radio-superficie)]',
};

const ABECEDARIO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function letraDe(indice: number): string | null {
  return indice < ABECEDARIO.length ? (ABECEDARIO[indice] ?? null) : null;
}

/*
 * Detección de hidratación.
 *
 * El barajado usa `Math.random()`, así que en el servidor daría un orden y en el
 * cliente otro. `useSyncExternalStore` es la forma prevista por React de decir
 * «en el servidor esto vale `false`, en el cliente `true`»: el primer render del
 * navegador reproduce el orden del documento, hidrata sin discrepancias y solo
 * entonces baraja.
 */
const SIN_SUSCRIPCION = () => () => undefined;
const EN_CLIENTE = () => true;
const EN_SERVIDOR = () => false;

/** Baraja una copia del array. Solo se usa cuando el bloque lo pide. */
function barajar<T>(elementos: readonly T[]): T[] {
  const copia = [...elementos];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copia[i] as T;
    const b = copia[j] as T;
    copia[i] = b;
    copia[j] = a;
  }
  return copia;
}

/* -------------------------------------------------------------------------- */
/* Contenido de una opción                                                     */
/* -------------------------------------------------------------------------- */

function Indicador({ multiple, seleccionado }: { multiple: boolean; seleccionado: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center border',
        'border-[color:var(--tp-borde)]',
        multiple ? 'rounded-[4px]' : 'rounded-full',
        seleccionado && 'border-[color:var(--tp-acento)] bg-[var(--tp-acento)]',
      )}
    >
      {seleccionado ? (
        multiple ? (
          <Check className="size-3.5 text-[color:var(--tp-fondo)]" strokeWidth={3} />
        ) : (
          <span className="size-2 rounded-full bg-[var(--tp-fondo)]" />
        )
      ) : null}
    </span>
  );
}

function Letra({ letra }: { letra: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'ml-auto hidden shrink-0 rounded-[4px] border px-1.5 py-0.5 @xs:inline-block',
        'border-[color:var(--tp-borde)] text-[color:var(--tp-texto-suave)]',
      )}
      style={{ fontSize: 'var(--tp-tamano-menudo)' }}
    >
      {letra}
    </span>
  );
}

interface PropsContenido {
  readonly presentacion: ChoicePresentation;
  readonly opcion: ChoiceDefinition;
  readonly seleccionado: boolean;
  readonly multiple: boolean;
  readonly letra: string | null;
  readonly urlImagen: string | null;
}

function ContenidoOpcion({
  presentacion,
  opcion,
  seleccionado,
  multiple,
  letra,
  urlImagen,
}: PropsContenido): ReactNode {
  if (presentacion === 'image_cards' || presentacion === 'grid') {
    return (
      <>
        <span
          className={cn(
            'flex w-full items-center justify-center overflow-hidden bg-[var(--tp-progreso-fondo)]',
            presentacion === 'grid' ? 'aspect-square' : 'aspect-[16/10]',
          )}
        >
          {urlImagen !== null ? (
            <Imagen src={urlImagen} alt="" className="size-full object-cover" />
          ) : (
            <span
              aria-hidden="true"
              className="text-[color:var(--tp-texto-suave)]"
              style={{ fontSize: 'var(--tp-tamano-menudo)' }}
            >
              Sin imagen
            </span>
          )}
        </span>
        <span className="flex w-full items-center gap-2 px-3 py-2 text-left">
          <span className="min-w-0 flex-1 break-words">{opcion.label}</span>
          {seleccionado ? (
            <Check aria-hidden="true" className="size-4 text-[color:var(--tp-acento)]" />
          ) : null}
        </span>
      </>
    );
  }

  return (
    <>
      {presentacion === 'list' ? (
        <Indicador multiple={multiple} seleccionado={seleccionado} />
      ) : null}
      {presentacion === 'buttons' && seleccionado ? (
        <Check aria-hidden="true" className="size-4 text-[color:var(--tp-acento)]" />
      ) : null}
      <span className="min-w-0 break-words">{opcion.label}</span>
      {presentacion === 'list' && letra !== null ? <Letra letra={letra} /> : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Control                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Control de selección única o múltiple en cualquiera de las cuatro
 * presentaciones del contrato.
 *
 * El `radiogroup` está escrito a mano en lugar de apoyarse en Radix por dos
 * razones: la misma mecánica de foco itinerante la necesitan la escala y la
 * valoración —y así las tres se comportan igual—, y las primitivas de Radix
 * inyectan dentro del `<form>` un campo espejo que aquí no sirve para nada,
 * porque el formulario no se envía por el navegador sino por el motor.
 */
export function ListaOpciones({ bloque }: { readonly bloque: ChoiceBlock }) {
  const { respuestas, establecerRespuesta, resolverMedia, error } = useFormulario();
  const ids = idsDePantalla(bloque.id);
  const multiple = bloque.type === 'multi_choice';
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  const hidratado = useSyncExternalStore(SIN_SUSCRIPCION, EN_CLIENTE, EN_SERVIDOR);
  const opciones = useMemo<readonly ChoiceDefinition[]>(
    () => (bloque.randomizeChoices && hidratado ? barajar(bloque.choices) : bloque.choices),
    [bloque.choices, bloque.randomizeChoices, hidratado],
  );

  const bruto = respuestas[bloque.id];
  const seleccionMultiple = Array.isArray(bruto) ? bruto : [];
  const seleccionUnica = typeof bruto === 'string' ? bruto : null;

  const descritoPor = describedBy(
    bloque.description !== undefined && bloque.description !== '' ? ids.descripcion : null,
    error !== null ? ids.error : null,
  );

  function estaSeleccionada(opcion: ChoiceDefinition): boolean {
    return multiple ? seleccionMultiple.includes(opcion.value) : seleccionUnica === opcion.value;
  }

  function alternar(opcion: ChoiceDefinition): void {
    if (!multiple) {
      establecerRespuesta(bloque.id, opcion.value);
      return;
    }
    const siguiente = seleccionMultiple.includes(opcion.value)
      ? seleccionMultiple.filter((valor) => valor !== opcion.value)
      : [...seleccionMultiple, opcion.value];
    establecerRespuesta(bloque.id, siguiente);
  }

  function seleccionarPorIndice(indice: number): void {
    const opcion = opciones[indice];
    if (opcion === undefined) return;
    alternar(opcion);
    botones.current[indice]?.focus();
  }

  const indiceSeleccionado = opciones.findIndex((opcion) => estaSeleccionada(opcion));
  /** Elemento con `tabindex=0` del foco itinerante de la selección única. */
  const tabulable = indiceSeleccionado >= 0 ? indiceSeleccionado : 0;

  /**
   * Flechas dentro del grupo (solo selección única, como manda el patrón de
   * `radiogroup`) y atajo por letra en ambos casos: pulsar «B» activa la segunda
   * opción. Es seguro porque en estas pantallas no hay ningún campo de texto que
   * pudiera capturar la tecla.
   */
  function manejarTeclado(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const ultimo = opciones.length - 1;

    if (!multiple) {
      const actual = indiceSeleccionado;
      switch (evento.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          evento.preventDefault();
          seleccionarPorIndice(actual < 0 ? 0 : actual === ultimo ? 0 : actual + 1);
          return;
        case 'ArrowLeft':
        case 'ArrowUp':
          evento.preventDefault();
          seleccionarPorIndice(actual < 0 ? ultimo : actual === 0 ? ultimo : actual - 1);
          return;
        case 'Home':
          evento.preventDefault();
          seleccionarPorIndice(0);
          return;
        case 'End':
          evento.preventDefault();
          seleccionarPorIndice(ultimo);
          return;
        default:
          break;
      }
    }

    if (evento.key.length !== 1) return;
    const indice = ABECEDARIO.indexOf(evento.key.toUpperCase());
    if (indice < 0 || indice > ultimo) return;
    evento.preventDefault();
    seleccionarPorIndice(indice);
  }

  return (
    <div
      role={multiple ? 'group' : 'radiogroup'}
      aria-labelledby={ids.titulo}
      aria-describedby={descritoPor}
      // `aria-required` y `aria-invalid` no están definidos sobre `group`: en la
      // selección múltiple la obligatoriedad la anuncia el título de la pantalla.
      aria-required={multiple ? undefined : bloque.required}
      aria-invalid={multiple ? undefined : error !== null}
      data-presentacion={bloque.presentation}
      onKeyDown={manejarTeclado}
      className={cn(CLASES_CONTENEDOR[bloque.presentation])}
      style={
        bloque.presentation === 'buttons'
          ? { justifyContent: 'var(--tp-alineacion-flex)' }
          : undefined
      }
    >
      {opciones.map((opcion, indice) => {
        const seleccionado = estaSeleccionada(opcion);
        const enfocable = multiple || indice === tabulable;
        return (
          <button
            key={opcion.id}
            ref={(elemento) => {
              botones.current[indice] = elemento;
            }}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={seleccionado}
            tabIndex={enfocable ? 0 : -1}
            data-estado={seleccionado ? 'seleccionado' : 'libre'}
            data-autofoco={indice === tabulable ? 'true' : undefined}
            onClick={() => {
              alternar(opcion);
            }}
            className={cn(CLASES_ITEM_BASE, CLASES_ITEM[bloque.presentation])}
          >
            <ContenidoOpcion
              presentacion={bloque.presentation}
              opcion={opcion}
              seleccionado={seleccionado}
              multiple={multiple}
              letra={letraDe(indice)}
              urlImagen={resolverOpcional(resolverMedia, opcion.assetId)?.url ?? null}
            />
          </button>
        );
      })}
    </div>
  );
}
