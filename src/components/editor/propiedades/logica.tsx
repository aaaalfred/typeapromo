'use client';

/**
 * Pestaña «Lógica»: las reglas que salen de esta pregunta.
 *
 * Dos decisiones que evitan la mayoría de los errores antes de cometerlos:
 *
 * 1. **Solo se ofrece lo legal.** Los operadores salen de
 *    `OPERATORS_BY_QUESTION_TYPE` y los destinos, de los bloques *posteriores*
 *    más las pantallas finales. Dejar elegir un salto hacia atrás para después
 *    culpar al usuario con `RULE_TARGET_BACKWARD` es peor interfaz que no
 *    ofrecerlo.
 * 2. **La validación en vivo es la de publicación.** Los avisos que aparecen
 *    bajo cada regla los produce `validateForPublication()`, el mismo validador
 *    que corre al publicar, indexado por regla. Así «sin avisos» significa
 *    exactamente «publicable», y no «el editor no ha sabido verlo».
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import {
  ETIQUETAS_DE_OPERADOR,
  avisosDeRegla,
  claveDeDestino,
  destinoDesdeClave,
  destinosDisponibles,
  formaDeValor,
  operadoresPara,
  rangoNumerico,
  reglasDe,
  valorPorDefecto,
  type Diagnostico,
} from '@/lib/editor';
import {
  isQuestionBlock,
  type FlowBlockDefinition,
  type FormDefinition,
  type LogicOperator,
  type LogicRule,
  type LogicValue,
  type QuestionDefinition,
} from '@/lib/forms';

import type { AccionesDocumento } from '../acciones';
import { CampoNumero, CampoTexto, Selector } from '../ui/campos';
import { BotonEditor, CajaAviso, ListaDeAvisos, Seccion } from '../ui/piezas';

/* -------------------------------------------------------------------------- */
/* Operando derecho                                                            */
/* -------------------------------------------------------------------------- */

interface PropsValor {
  readonly pregunta: QuestionDefinition;
  readonly regla: LogicRule;
  readonly alCambiar: (valor: LogicValue) => void;
}

function ControlDeValor({ pregunta, regla, alCambiar }: PropsValor) {
  const forma = formaDeValor(pregunta, regla.operator);

  switch (forma) {
    case 'ninguno':
      return null;

    case 'numero': {
      const rango = rangoNumerico(pregunta);
      return (
        <CampoNumero
          etiqueta="Valor"
          valor={typeof regla.value === 'number' ? regla.value : null}
          min={rango?.min}
          max={rango?.max}
          step={rango?.step}
          alCambiar={(valor) => {
            alCambiar(valor);
          }}
        />
      );
    }

    case 'fecha':
      return (
        <CampoTexto
          etiqueta="Valor"
          tipo="date"
          valor={typeof regla.value === 'string' ? regla.value : ''}
          alCambiar={(valor) => {
            alCambiar(valor);
          }}
        />
      );

    case 'opcion': {
      if (pregunta.type !== 'single_choice') return null;
      const actual = typeof regla.value === 'string' ? regla.value : '';
      return (
        <Selector
          etiqueta="Opción"
          valor={actual}
          opciones={pregunta.choices.map((opcion) => ({
            valor: opcion.value,
            etiqueta: opcion.label,
          }))}
          alCambiar={(valor) => {
            alCambiar(valor);
          }}
        />
      );
    }

    case 'opciones': {
      if (pregunta.type !== 'multi_choice') return null;
      const seleccionadas = Array.isArray(regla.value) ? regla.value : [];
      return (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Opciones
          </legend>
          {pregunta.choices.map((opcion) => (
            <label key={opcion.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-blue-600"
                checked={seleccionadas.includes(opcion.value)}
                onChange={(evento) => {
                  alCambiar(
                    evento.target.checked
                      ? [...seleccionadas, opcion.value]
                      : seleccionadas.filter((valor) => valor !== opcion.value),
                  );
                }}
              />
              <span className="text-neutral-800 dark:text-neutral-100">{opcion.label}</span>
            </label>
          ))}
        </fieldset>
      );
    }

    case 'texto':
      return (
        <CampoTexto
          etiqueta="Valor"
          valor={typeof regla.value === 'string' ? regla.value : ''}
          maxLength={500}
          alCambiar={(valor) => {
            alCambiar(valor);
          }}
        />
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Una regla                                                                   */
/* -------------------------------------------------------------------------- */

interface PropsRegla {
  readonly definicion: FormDefinition;
  readonly pregunta: QuestionDefinition;
  readonly regla: LogicRule;
  readonly orden: number;
  readonly total: number;
  readonly diagnostico: Diagnostico;
  readonly acciones: AccionesDocumento;
}

function FilaDeRegla({
  definicion,
  pregunta,
  regla,
  orden,
  total,
  diagnostico,
  acciones,
}: PropsRegla) {
  const destinos = destinosDisponibles(definicion, pregunta.id);
  const claveActual = claveDeDestino(regla.target);
  const conocido = destinos.some((destino) => destino.clave === claveActual);
  const opcionesDeDestino = conocido
    ? destinos.map((destino) => ({ valor: destino.clave, etiqueta: destino.etiqueta }))
    : [
        { valor: claveActual, etiqueta: `Destino no válido (${regla.target.id})` },
        ...destinos.map((destino) => ({ valor: destino.clave, etiqueta: destino.etiqueta })),
      ];

  const avisos = avisosDeRegla(diagnostico, regla.id);

  return (
    <li
      data-regla={regla.id}
      className="flex flex-col gap-2 rounded-md border border-neutral-200 p-2 dark:border-neutral-800"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          Regla {String(orden + 1)} de {String(total)} · prioridad {String(regla.priority)}
        </p>
        <span className="flex items-center">
          <BotonEditor
            variante="discreto"
            tamano="sm"
            disabled={orden === 0}
            aria-label={`Subir la prioridad de la regla ${String(orden + 1)}`}
            onClick={() => {
              acciones.desplazarRegla(regla.id, -1);
            }}
          >
            <ArrowUp aria-hidden="true" className="size-3.5" />
          </BotonEditor>
          <BotonEditor
            variante="discreto"
            tamano="sm"
            disabled={orden === total - 1}
            aria-label={`Bajar la prioridad de la regla ${String(orden + 1)}`}
            onClick={() => {
              acciones.desplazarRegla(regla.id, 1);
            }}
          >
            <ArrowDown aria-hidden="true" className="size-3.5" />
          </BotonEditor>
          <BotonEditor
            variante="peligro"
            tamano="sm"
            aria-label={`Eliminar la regla ${String(orden + 1)}`}
            onClick={() => {
              acciones.eliminarRegla(regla.id);
            }}
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
          </BotonEditor>
        </span>
      </div>

      <Selector<LogicOperator>
        etiqueta="Si la respuesta…"
        valor={regla.operator}
        opciones={operadoresPara(pregunta).map((operador) => ({
          valor: operador,
          etiqueta: ETIQUETAS_DE_OPERADOR[operador],
        }))}
        alCambiar={(operator) => {
          // Cambiar de operador reinicia el valor: pasar de «está vacía» a «es
          // igual a» dejaría el operando en `null`, que es inválido.
          acciones.actualizarRegla(regla.id, {
            operator,
            value: valorPorDefecto(pregunta, operator),
          });
        }}
      />

      <ControlDeValor
        pregunta={pregunta}
        regla={regla}
        alCambiar={(valor) => {
          acciones.actualizarRegla(regla.id, { value: valor });
        }}
      />

      <Selector
        etiqueta="Entonces ir a…"
        valor={claveActual}
        opciones={opcionesDeDestino}
        alCambiar={(clave) => {
          const destino = destinoDesdeClave(clave);
          if (destino === null) return;
          acciones.actualizarRegla(regla.id, { target: destino });
        }}
      />

      <ListaDeAvisos avisos={avisos} />
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export interface PropsPanelLogica {
  readonly definicion: FormDefinition;
  readonly bloque: FlowBlockDefinition;
  readonly diagnostico: Diagnostico;
  readonly acciones: AccionesDocumento;
}

export function PanelLogica({ definicion, bloque, diagnostico, acciones }: PropsPanelLogica) {
  if (!isQuestionBlock(bloque)) {
    return (
      <Seccion titulo="Lógica">
        <CajaAviso tono="informacion">
          Solo las preguntas pueden condicionar el recorrido: este bloque no recoge respuesta, así
          que siempre continúa al siguiente.
        </CajaAviso>
      </Seccion>
    );
  }

  const reglas = reglasDe(definicion, bloque.id);
  const destinos = destinosDisponibles(definicion, bloque.id);
  const sinDestinos = destinos.length === 0;

  const anadir = (): void => {
    const primerDestino = destinos[0];
    if (primerDestino === undefined) return;
    const operador = operadoresPara(bloque)[0] ?? 'is_not_empty';
    acciones.anadirRegla({
      sourceQuestionId: bloque.id,
      operator: operador,
      value: valorPorDefecto(bloque, operador),
      target: primerDestino.target,
    });
  };

  return (
    <Seccion
      titulo="Lógica"
      descripcion="Se evalúan de arriba abajo al salir de la pregunta; gana la primera que se cumple. Si no se cumple ninguna, sigue el orden del recorrido."
    >
      {sinDestinos ? (
        <CajaAviso tono="informacion">
          No hay ningún destino posible: esta pregunta es la última y no hay pantallas finales a las
          que saltar.
        </CajaAviso>
      ) : null}

      {reglas.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Sin reglas: al responder se pasa al siguiente bloque del recorrido.
        </p>
      ) : (
        <ol className="flex list-none flex-col gap-3">
          {reglas.map((regla, orden) => (
            <FilaDeRegla
              key={regla.id}
              definicion={definicion}
              pregunta={bloque}
              regla={regla}
              orden={orden}
              total={reglas.length}
              diagnostico={diagnostico}
              acciones={acciones}
            />
          ))}
        </ol>
      )}

      <div>
        <BotonEditor variante="secundario" tamano="sm" disabled={sinDestinos} onClick={anadir}>
          <Plus aria-hidden="true" className="size-3.5" />
          Añadir regla
        </BotonEditor>
      </div>
    </Seccion>
  );
}
