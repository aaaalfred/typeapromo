'use client';

/**
 * Panel de ajustes del formulario: metadatos y comportamiento general.
 *
 * El título del documento (`meta.title`) es también el que se ve en el panel
 * del equipo, y renombrar desde allí incrementa la revisión del borrador
 * (`PATCH /api/forms/:id`), de modo que un editor abierto recibirá un conflicto
 * limpio. Aquí se edita el del documento, que es lo que viaja en el snapshot
 * publicado.
 */

import type { FormDefinition } from '@/lib/forms';

import type { AccionesDocumento } from './acciones';
import { CampoArea, CampoTexto, Interruptor } from './ui/campos';
import { Seccion } from './ui/piezas';

export interface PropsPanelAjustes {
  readonly definicion: FormDefinition;
  readonly acciones: AccionesDocumento;
}

export function PanelAjustes({ definicion, acciones }: PropsPanelAjustes) {
  const { meta, settings } = definicion;

  return (
    <>
      <Seccion titulo="Formulario">
        <CampoTexto
          etiqueta="Título"
          valor={meta.title}
          maxLength={300}
          alCambiar={(title) => {
            acciones.actualizarMeta({ title });
          }}
        />
        <CampoArea
          etiqueta="Descripción interna"
          valor={meta.description ?? ''}
          maxLength={2000}
          marcador="Para el equipo; no se muestra a quien responde."
          alCambiar={(texto) => {
            acciones.actualizarMeta({ description: texto === '' ? undefined : texto });
          }}
        />
        <CampoArea
          etiqueta="Mensaje al cerrar"
          valor={meta.closedMessage ?? ''}
          maxLength={1000}
          marcador="Se muestra cuando el formulario está cerrado."
          alCambiar={(texto) => {
            acciones.actualizarMeta({ closedMessage: texto === '' ? undefined : texto });
          }}
        />
        <CampoTexto
          etiqueta="Idioma"
          valor={meta.language}
          maxLength={10}
          ayuda="Código de idioma del documento (por ejemplo, «es»)."
          alCambiar={(language) => {
            acciones.actualizarMeta({ language });
          }}
        />
      </Seccion>

      <Seccion titulo="Comportamiento">
        <Interruptor
          etiqueta="Mostrar barra de progreso"
          activo={settings.showProgressBar}
          ayuda="El progreso se calcula sobre el recorrido efectivo, no sobre el total de preguntas, así que puede moverse al resolverse una bifurcación."
          alCambiar={(showProgressBar) => {
            acciones.actualizarAjustes({ showProgressBar });
          }}
        />
        <Interruptor
          etiqueta="Permitir reanudar en el mismo navegador"
          activo={settings.allowResume}
          alCambiar={(allowResume) => {
            acciones.actualizarAjustes({ allowResume });
          }}
        />
        <Interruptor
          etiqueta="Numerar las preguntas"
          activo={settings.showQuestionNumbers}
          alCambiar={(showQuestionNumbers) => {
            acciones.actualizarAjustes({ showQuestionNumbers });
          }}
        />
      </Seccion>
    </>
  );
}
