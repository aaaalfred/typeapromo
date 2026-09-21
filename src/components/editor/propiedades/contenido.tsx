'use client';

/**
 * Pestaña «Contenido»: lo que se lee en la pantalla.
 *
 * El selector de tipo vive aquí porque cambiar de tipo es una operación de
 * contenido, no de apariencia: se conserva el identificador (y con él las
 * reglas que apuntan al bloque), el título y la descripción, y se pierde lo que
 * no tiene equivalente. Conservar identificador es lo que evita que cambiar
 * «texto corto» por «selección única» rompa el recorrido.
 */

import { NOMBRES_DE_TIPO, PLANTILLAS } from '@/lib/editor';
import { isChoiceBlock, type FlowBlockDefinition } from '@/lib/forms';

import type { AccionesDocumento } from '../acciones';
import { CampoArea, CampoTexto, Selector } from '../ui/campos';
import { Seccion } from '../ui/piezas';

import { EditorOpciones } from './opciones';

export interface PropsPanelBloque {
  readonly bloque: FlowBlockDefinition;
  readonly acciones: AccionesDocumento;
}

type TipoDeBloque = Parameters<AccionesDocumento['cambiarTipoDeBloque']>[1];

const OPCIONES_DE_TIPO = PLANTILLAS.map((plantilla) => ({
  valor: plantilla.tipo,
  etiqueta: plantilla.nombre,
}));

export function PanelContenido({ bloque, acciones }: PropsPanelBloque) {
  const tieneCuerpo =
    bloque.type === 'statement' || bloque.type === 'welcome';

  return (
    <>
      <Seccion titulo="Contenido" descripcion={NOMBRES_DE_TIPO[bloque.type]}>
        <Selector<TipoDeBloque>
          etiqueta="Tipo de bloque"
          valor={bloque.type}
          opciones={OPCIONES_DE_TIPO}
          ayuda="Al cambiar de tipo se conservan el título, la descripción y las reglas que apuntan a este bloque."
          alCambiar={(tipo) => {
            acciones.cambiarTipoDeBloque(bloque.id, tipo);
          }}
        />

        <CampoTexto
          etiqueta="Título"
          valor={bloque.title}
          maxLength={500}
          alCambiar={(title) => {
            acciones.reemplazarBloque({ ...bloque, title });
          }}
        />

        <CampoArea
          etiqueta="Descripción"
          valor={bloque.description ?? ''}
          maxLength={2000}
          marcador="Texto de apoyo bajo el título (opcional)"
          alCambiar={(texto) => {
            acciones.reemplazarBloque({
              ...bloque,
              description: texto === '' ? undefined : texto,
            });
          }}
        />

        {tieneCuerpo ? (
          <>
            <CampoArea
              etiqueta="Cuerpo"
              filas={5}
              valor={bloque.body ?? ''}
              maxLength={5000}
              alCambiar={(texto) => {
                acciones.reemplazarBloque({ ...bloque, body: texto === '' ? undefined : texto });
              }}
            />
            <CampoTexto
              etiqueta="Etiqueta del botón"
              valor={bloque.buttonLabel ?? ''}
              maxLength={120}
              marcador={bloque.type === 'welcome' ? 'Empezar' : 'Continuar'}
              alCambiar={(texto) => {
                acciones.reemplazarBloque({
                  ...bloque,
                  buttonLabel: texto === '' ? undefined : texto,
                });
              }}
            />
          </>
        ) : null}
      </Seccion>

      {isChoiceBlock(bloque) ? (
        <Seccion
          titulo="Opciones"
          descripcion="El orden es el que verá quien responda, salvo que actives el orden aleatorio."
        >
          <EditorOpciones
            bloque={bloque}
            alAnadir={() => {
              acciones.anadirOpcion(bloque.id);
            }}
            alActualizar={(opcionId, parcial) => {
              acciones.actualizarOpcion(bloque.id, opcionId, parcial);
            }}
            alEliminar={(opcionId) => {
              acciones.eliminarOpcion(bloque.id, opcionId);
            }}
            alMover={(desde, hasta) => {
              acciones.moverOpcion(bloque.id, desde, hasta);
            }}
          />
        </Seccion>
      ) : null}
    </>
  );
}
