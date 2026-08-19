'use client';

/**
 * Menú de «Añadir bloque».
 *
 * Es una revelación sencilla (botón + panel) en lugar de `DropdownMenu` de
 * Radix: aquel se posiciona con Floating UI, que exige `ResizeObserver`, y eso
 * dejaría sin tests el camino por el que se construye todo formulario. Lo que
 * de verdad importa aquí —cerrar con `Escape`, cerrar al elegir y devolver el
 * foco al disparador— son quince líneas.
 */

import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { PLANTILLAS, type PlantillaDeBloque } from '@/lib/editor';

import { BotonEditor } from './ui/piezas';

export interface PropsMenuAnadir {
  readonly alElegir: (tipo: PlantillaDeBloque['tipo']) => void;
  /** Tipos que no se pueden añadir ahora mismo (p. ej. una segunda bienvenida). */
  readonly deshabilitados?: readonly PlantillaDeBloque['tipo'][];
}

export function MenuAnadir({ alElegir, deshabilitados = [] }: PropsMenuAnadir) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement | null>(null);
  const disparador = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!abierto) return undefined;

    const alPulsarTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        setAbierto(false);
        disparador.current?.focus();
      }
    };
    const alPulsarFuera = (evento: MouseEvent): void => {
      if (!(evento.target instanceof Node)) return;
      if (contenedor.current?.contains(evento.target) === true) return;
      setAbierto(false);
    };

    document.addEventListener('keydown', alPulsarTecla);
    document.addEventListener('mousedown', alPulsarFuera);
    return () => {
      document.removeEventListener('keydown', alPulsarTecla);
      document.removeEventListener('mousedown', alPulsarFuera);
    };
  }, [abierto]);

  const preguntas = PLANTILLAS.filter((plantilla) => plantilla.grupo === 'pregunta');
  const pantallas = PLANTILLAS.filter((plantilla) => plantilla.grupo === 'pantalla');

  const grupo = (titulo: string, plantillas: readonly PlantillaDeBloque[]) => (
    <li>
      <p className="px-2 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {titulo}
      </p>
      <ul className="flex list-none flex-col">
        {plantillas.map((plantilla) => (
          <li key={plantilla.tipo}>
            <button
              type="button"
              disabled={deshabilitados.includes(plantilla.tipo)}
              onClick={() => {
                alElegir(plantilla.tipo);
                setAbierto(false);
                disparador.current?.focus();
              }}
              className="w-full rounded px-2 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              <span className="block font-medium">{plantilla.nombre}</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                {plantilla.descripcion}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </li>
  );

  return (
    <div ref={contenedor} className="relative">
      <BotonEditor
        ref={disparador}
        variante="secundario"
        className="w-full"
        aria-expanded={abierto}
        aria-haspopup="menu"
        onClick={() => {
          setAbierto((previo) => !previo);
        }}
      >
        <Plus aria-hidden="true" className="size-4" />
        Añadir bloque
      </BotonEditor>

      {abierto ? (
        <ul
          className="absolute bottom-full left-0 z-20 mb-1 max-h-96 w-full list-none overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          aria-label="Tipos de bloque"
        >
          {grupo('Preguntas', preguntas)}
          {grupo('Pantallas', pantallas)}
        </ul>
      ) : null}
    </div>
  );
}
