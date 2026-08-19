'use client';

/**
 * Panel central: la previsualización.
 *
 * Es **el mismo componente** que la experiencia pública, sin ninguna rama de
 * modo (README de `components/formulario`). Lo único que cambia entra por
 * props:
 *
 * - En edición va **controlada**: `pantalla` y `respuestas` los manda el editor,
 *   de modo que seleccionar un bloque en la lista lo enseña al instante, y
 *   `enfocarAlCambiar={false}` evita que el renderer robe el foco al panel de
 *   propiedades mientras se escribe.
 * - En ejecución de prueba va **no controlada** y sin `onAvanzar`: el renderer
 *   se gobierna solo y no hay a dónde persistir, así que la prueba no puede
 *   escribir una respuesta ni por accidente. Al reiniciar se remonta con una
 *   `key` nueva para que no quede rastro de la anterior.
 *
 * La vista móvil es un **ancho**, no un modo: la raíz del renderer es un
 * `@container`, así que estrechar el marco produce exactamente la disposición
 * del teléfono.
 */

import { Monitor, Play, Smartphone, Square } from 'lucide-react';

import { RenderizadorFormulario, type ResolverMedia } from '@/components/formulario';
import { cn } from '@/components/ui/cn';
import { firstScreen, type AnswersMap, type FormDefinition, type ScreenRef } from '@/lib/forms';

import { ANCHOS_DE_DISPOSITIVO, type Dispositivo } from './estado';
import { BotonEditor } from './ui/piezas';

export interface PropsPrevisualizacion {
  readonly definicion: FormDefinition;
  /** Pantalla que se está editando. Se ignora durante la ejecución de prueba. */
  readonly pantalla: ScreenRef;
  readonly respuestas: AnswersMap;
  readonly alCambiarRespuestas: (respuestas: AnswersMap) => void;
  readonly alCambiarPantalla: (pantalla: ScreenRef) => void;
  readonly dispositivo: Dispositivo;
  readonly alCambiarDispositivo: (dispositivo: Dispositivo) => void;
  readonly enPrueba: boolean;
  readonly sesionDePrueba: number;
  readonly alIniciarPrueba: () => void;
  readonly alSalirDePrueba: () => void;
  readonly resolverMedia?: ResolverMedia;
}

export function Previsualizacion({
  definicion,
  pantalla,
  respuestas,
  alCambiarRespuestas,
  alCambiarPantalla,
  dispositivo,
  alCambiarDispositivo,
  enPrueba,
  sesionDePrueba,
  alIniciarPrueba,
  alSalirDePrueba,
  resolverMedia,
}: PropsPrevisualizacion) {
  const ancho = ANCHOS_DE_DISPOSITIVO[dispositivo];

  return (
    <section aria-label="Previsualización" className="flex h-full min-w-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <div
          role="group"
          aria-label="Ancho de la previsualización"
          className="flex items-center gap-1"
        >
          <BotonEditor
            variante={dispositivo === 'escritorio' ? 'principal' : 'discreto'}
            tamano="sm"
            aria-pressed={dispositivo === 'escritorio'}
            onClick={() => {
              alCambiarDispositivo('escritorio');
            }}
          >
            <Monitor aria-hidden="true" className="size-3.5" />
            Escritorio
          </BotonEditor>
          <BotonEditor
            variante={dispositivo === 'movil' ? 'principal' : 'discreto'}
            tamano="sm"
            aria-pressed={dispositivo === 'movil'}
            onClick={() => {
              alCambiarDispositivo('movil');
            }}
          >
            <Smartphone aria-hidden="true" className="size-3.5" />
            Móvil
          </BotonEditor>
        </div>

        {enPrueba ? (
          <BotonEditor variante="secundario" tamano="sm" onClick={alSalirDePrueba}>
            <Square aria-hidden="true" className="size-3.5" />
            Salir de la prueba
          </BotonEditor>
        ) : (
          <BotonEditor variante="secundario" tamano="sm" onClick={alIniciarPrueba}>
            <Play aria-hidden="true" className="size-3.5" />
            Ejecución de prueba
          </BotonEditor>
        )}
      </div>

      {enPrueba ? (
        <p
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
        >
          Ejecución de prueba: puedes recorrer el formulario entero, pero{' '}
          <strong>no se guarda ninguna respuesta</strong>.
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-neutral-100 p-4 dark:bg-neutral-950">
        <div
          data-dispositivo={dispositivo}
          style={ancho === null ? undefined : { maxWidth: `${String(ancho)}px` }}
          className={cn(
            'flex w-full overflow-hidden rounded-xl border border-neutral-300 bg-white shadow-sm dark:border-neutral-700',
            ancho === null ? 'max-w-3xl' : '',
          )}
        >
          {enPrueba ? (
            <RenderizadorFormulario
              key={`prueba-${String(sesionDePrueba)}`}
              definicion={definicion}
              pantallaInicial={firstScreen(definicion)}
              resolverMedia={resolverMedia}
              className="min-h-[32rem]"
            />
          ) : (
            <RenderizadorFormulario
              definicion={definicion}
              pantalla={pantalla}
              respuestas={respuestas}
              onRespuestasChange={alCambiarRespuestas}
              onPantallaChange={alCambiarPantalla}
              enfocarAlCambiar={false}
              resolverMedia={resolverMedia}
              className="min-h-[32rem]"
            />
          )}
        </div>
      </div>
    </section>
  );
}
