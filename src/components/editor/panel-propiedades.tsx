'use client';

/**
 * Panel derecho: propiedades de lo que esté seleccionado.
 *
 * Las pestañas disponibles dependen del tipo: una bienvenida no tiene
 * validación ni lógica, así que esas pestañas no se pintan en lugar de
 * pintarse vacías. Si la pestaña activa deja de existir al cambiar de
 * selección, se cae a «Contenido», que existe siempre.
 *
 * Sobre todas ellas van los avisos del validador de publicación que afectan a
 * este elemento: es la misma información que impedirá publicar, dicha en el
 * sitio donde se puede arreglar.
 */

import { useRef } from 'react';

import { cn } from '@/components/ui/cn';
import { avisosDeBloque, type Diagnostico } from '@/lib/editor';
import { isQuestionBlock, type FormDefinition } from '@/lib/forms';

import type { AccionesDocumento } from './acciones';
import { NOMBRES_DE_PESTANA, type Pestana, type Seleccion } from './estado';
import { PanelAjustes } from './panel-ajustes';
import { PanelTema } from './panel-tema';
import { PanelApariencia } from './propiedades/apariencia';
import { PanelContenido } from './propiedades/contenido';
import { PanelLogica } from './propiedades/logica';
import { PanelMedia } from './propiedades/media';
import { PanelPantallaFinal } from './propiedades/pantalla-final';
import { PanelValidacion } from './propiedades/validacion';
import { ListaDeAvisos } from './ui/piezas';

/* -------------------------------------------------------------------------- */
/* Pestañas                                                                    */
/* -------------------------------------------------------------------------- */

interface PropsPestanas {
  readonly disponibles: readonly Pestana[];
  readonly activa: Pestana;
  readonly alCambiar: (pestana: Pestana) => void;
}

/**
 * Lista de pestañas con foco itinerante: solo la activa entra en el orden de
 * tabulación y las flechas mueven entre ellas, como exige el patrón ARIA.
 */
function Pestanas({ disponibles, activa, alCambiar }: PropsPestanas) {
  const contenedor = useRef<HTMLDivElement | null>(null);

  const alPulsarTecla = (evento: React.KeyboardEvent<HTMLDivElement>): void => {
    const delta = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    evento.preventDefault();
    const indice = disponibles.indexOf(activa);
    const siguiente = disponibles[(indice + delta + disponibles.length) % disponibles.length];
    if (siguiente === undefined) return;
    alCambiar(siguiente);
    contenedor.current
      ?.querySelector<HTMLButtonElement>(`[data-pestana="${siguiente}"]`)
      ?.focus();
  };

  return (
    <div
      ref={contenedor}
      role="tablist"
      aria-label="Propiedades"
      onKeyDown={alPulsarTecla}
      className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-neutral-200 px-2 dark:border-neutral-800"
    >
      {disponibles.map((pestana) => (
        <button
          key={pestana}
          type="button"
          role="tab"
          data-pestana={pestana}
          id={`pestana-${pestana}`}
          aria-selected={pestana === activa}
          aria-controls={`panel-${pestana}`}
          tabIndex={pestana === activa ? 0 : -1}
          onClick={() => {
            alCambiar(pestana);
          }}
          className={cn(
            'whitespace-nowrap border-b-2 px-2.5 py-2 text-xs font-medium transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600',
            pestana === activa
              ? 'border-blue-600 text-blue-700 dark:text-blue-300'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100',
          )}
        >
          {NOMBRES_DE_PESTANA[pestana]}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export interface PropsPanelPropiedades {
  readonly definicion: FormDefinition;
  readonly seleccion: Seleccion;
  readonly pestana: Pestana;
  readonly diagnostico: Diagnostico;
  readonly acciones: AccionesDocumento;
  readonly alCambiarPestana: (pestana: Pestana) => void;
}

const PESTANAS_DE_PREGUNTA: readonly Pestana[] = [
  'contenido',
  'validacion',
  'apariencia',
  'media',
  'logica',
];
const PESTANAS_DE_PANTALLA: readonly Pestana[] = ['contenido', 'media'];

export function PanelPropiedades({
  definicion,
  seleccion,
  pestana,
  diagnostico,
  acciones,
  alCambiarPestana,
}: PropsPanelPropiedades) {
  const contenedor = 'flex h-full flex-col overflow-y-auto';

  if (seleccion.tipo === 'ajustes') {
    return (
      <aside aria-label="Ajustes del formulario" className={contenedor}>
        <PanelAjustes definicion={definicion} acciones={acciones} />
      </aside>
    );
  }

  if (seleccion.tipo === 'tema') {
    return (
      <aside aria-label="Tema del formulario" className={contenedor}>
        <PanelTema definicion={definicion} acciones={acciones} />
      </aside>
    );
  }

  if (seleccion.tipo === 'final') {
    const pantalla = definicion.endScreens.find((candidata) => candidata.id === seleccion.id);
    if (pantalla === undefined) {
      return <aside aria-label="Propiedades" className={contenedor} />;
    }
    return (
      <aside aria-label={`Propiedades de ${pantalla.title}`} className={contenedor}>
        <div className="px-4 pt-3">
          <ListaDeAvisos avisos={avisosDeBloque(diagnostico, pantalla.id)} />
        </div>
        <PanelPantallaFinal definicion={definicion} pantalla={pantalla} acciones={acciones} />
      </aside>
    );
  }

  const bloque = definicion.blocks.find((candidato) => candidato.id === seleccion.id);
  if (bloque === undefined) {
    return (
      <aside aria-label="Propiedades" className={contenedor}>
        <p className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
          Selecciona un bloque en la lista de la izquierda para editarlo.
        </p>
      </aside>
    );
  }

  const disponibles = isQuestionBlock(bloque) ? PESTANAS_DE_PREGUNTA : PESTANAS_DE_PANTALLA;
  const activa = disponibles.includes(pestana) ? pestana : 'contenido';
  // En la pestaña de lógica, los avisos de una regla se pintan bajo la regla:
  // repetirlos arriba diría dos veces lo mismo a un palmo de distancia.
  const avisos = avisosDeBloque(diagnostico, bloque.id).filter(
    (aviso) => activa !== 'logica' || aviso.reglas.length === 0,
  );

  return (
    <aside aria-label={`Propiedades de ${bloque.title}`} className={contenedor}>
      <Pestanas disponibles={disponibles} activa={activa} alCambiar={alCambiarPestana} />

      <div
        role="tabpanel"
        id={`panel-${activa}`}
        aria-labelledby={`pestana-${activa}`}
        className="flex flex-col"
      >
        {avisos.length === 0 ? null : (
          <div className="px-4 pt-3">
            <ListaDeAvisos avisos={avisos} />
          </div>
        )}

        {activa === 'contenido' ? <PanelContenido bloque={bloque} acciones={acciones} /> : null}
        {activa === 'validacion' ? <PanelValidacion bloque={bloque} acciones={acciones} /> : null}
        {activa === 'apariencia' ? <PanelApariencia bloque={bloque} acciones={acciones} /> : null}
        {activa === 'media' ? <PanelMedia bloque={bloque} acciones={acciones} /> : null}
        {activa === 'logica' ? (
          <PanelLogica
            definicion={definicion}
            bloque={bloque}
            diagnostico={diagnostico}
            acciones={acciones}
          />
        ) : null}
      </div>
    </aside>
  );
}
