'use client';

/**
 * Pestaña «Validación»: qué respuestas se aceptan.
 *
 * Cada control escribe exactamente el campo del contrato que le corresponde y
 * **nada más**. Los rangos incoherentes (mínimo mayor que máximo, paso que no
 * alcanza el máximo, expresión regular que no compila) no se impiden aquí: los
 * detecta el validador de publicación y se muestran como aviso en vivo bajo el
 * panel. Bloquear la escritura mientras se teclea impediría, por ejemplo, subir
 * el mínimo antes que el máximo.
 */

import type { FlowBlockDefinition } from '@/lib/forms';

import type { PropsPanelBloque } from './contenido';

import { CampoNumero, CampoTexto, Interruptor } from '../ui/campos';
import { Seccion } from '../ui/piezas';

/** Campos de validación de texto, compartidos por texto corto y largo. */
function ValidacionTexto({
  bloque,
  alCambiar,
}: {
  readonly bloque: Extract<FlowBlockDefinition, { type: 'short_text' | 'long_text' }>;
  readonly alCambiar: (bloque: FlowBlockDefinition) => void;
}) {
  const validacion = bloque.validation ?? {};

  const escribir = (parcial: Partial<typeof validacion>): void => {
    const siguiente = { ...validacion, ...parcial };
    const vacio = Object.values(siguiente).every((valor) => valor === undefined);
    alCambiar({ ...bloque, validation: vacio ? undefined : siguiente });
  };

  return (
    <>
      <CampoNumero
        etiqueta="Longitud mínima"
        valor={validacion.minLength ?? null}
        min={0}
        max={10000}
        marcador="Sin mínimo"
        alCambiar={(valor) => {
          escribir({ minLength: valor ?? undefined });
        }}
      />
      <CampoNumero
        etiqueta="Longitud máxima"
        valor={validacion.maxLength ?? null}
        min={1}
        max={10000}
        marcador="Sin máximo"
        alCambiar={(valor) => {
          escribir({ maxLength: valor ?? undefined });
        }}
      />
      <CampoTexto
        etiqueta="Expresión regular"
        valor={validacion.pattern ?? ''}
        maxLength={300}
        marcador="^[A-Z]{2}\d+$"
        ayuda="Notación JavaScript, sin las barras. Se aplica además de la longitud."
        alCambiar={(texto) => {
          escribir({ pattern: texto === '' ? undefined : texto });
        }}
      />
    </>
  );
}

export function PanelValidacion({ bloque, acciones }: PropsPanelBloque) {
  const alCambiar = acciones.reemplazarBloque;

  if (bloque.type === 'welcome' || bloque.type === 'statement') {
    return (
      <Seccion titulo="Validación">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Este bloque no recoge respuesta, así que no tiene nada que validar.
        </p>
      </Seccion>
    );
  }

  return (
    <>
      <Seccion titulo="Validación">
        <Interruptor
          etiqueta="Respuesta obligatoria"
          activo={bloque.required}
          ayuda="Sin marcar, quien responda puede pasar la pregunta en blanco; la respuesta se registra como vacía y las reglas la ven así."
          alCambiar={(required) => {
            alCambiar({ ...bloque, required });
          }}
        />

        {bloque.type === 'short_text' || bloque.type === 'long_text' ? (
          <ValidacionTexto bloque={bloque} alCambiar={alCambiar} />
        ) : null}

        {bloque.type === 'date' ? (
          <>
            <CampoTexto
              etiqueta="Fecha mínima"
              tipo="date"
              valor={bloque.validation?.min ?? ''}
              alCambiar={(valor) => {
                const validation = { ...bloque.validation, min: valor === '' ? undefined : valor };
                alCambiar({
                  ...bloque,
                  validation:
                    validation.min === undefined && validation.max === undefined
                      ? undefined
                      : validation,
                });
              }}
            />
            <CampoTexto
              etiqueta="Fecha máxima"
              tipo="date"
              valor={bloque.validation?.max ?? ''}
              alCambiar={(valor) => {
                const validation = { ...bloque.validation, max: valor === '' ? undefined : valor };
                alCambiar({
                  ...bloque,
                  validation:
                    validation.min === undefined && validation.max === undefined
                      ? undefined
                      : validation,
                });
              }}
            />
          </>
        ) : null}

        {bloque.type === 'multi_choice' ? (
          <>
            <CampoNumero
              etiqueta="Selecciones mínimas"
              valor={bloque.minSelections ?? null}
              min={0}
              max={bloque.choices.length}
              marcador="Sin mínimo"
              alCambiar={(valor) => {
                alCambiar({ ...bloque, minSelections: valor ?? undefined });
              }}
            />
            <CampoNumero
              etiqueta="Selecciones máximas"
              valor={bloque.maxSelections ?? null}
              min={1}
              max={bloque.choices.length}
              marcador="Sin máximo"
              alCambiar={(valor) => {
                alCambiar({ ...bloque, maxSelections: valor ?? undefined });
              }}
            />
          </>
        ) : null}

        {bloque.type === 'scale' ? (
          <>
            <CampoNumero
              etiqueta="Valor mínimo"
              valor={bloque.min}
              min={0}
              max={100}
              alCambiar={(valor) => {
                alCambiar({ ...bloque, min: valor ?? 0 });
              }}
            />
            <CampoNumero
              etiqueta="Valor máximo"
              valor={bloque.max}
              min={1}
              max={100}
              alCambiar={(valor) => {
                alCambiar({ ...bloque, max: valor ?? 1 });
              }}
            />
            <CampoNumero
              etiqueta="Paso"
              valor={bloque.step}
              min={1}
              max={100}
              ayuda="El máximo debe caer justo en un paso; si no, no se podría elegir."
              alCambiar={(valor) => {
                alCambiar({ ...bloque, step: valor ?? 1 });
              }}
            />
          </>
        ) : null}
      </Seccion>
    </>
  );
}
