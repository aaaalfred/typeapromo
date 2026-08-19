'use client';

/**
 * Editor visual de formularios (fase 5 del plan).
 *
 * Tres áreas: recorrido a la izquierda, previsualización en el centro y
 * propiedades a la derecha.
 *
 * Reparto de estado, que es la decisión estructural del componente:
 *
 * - El **documento** y su **revisión** son estado de servidor y viven aquí, en
 *   `useState`, siempre juntos. PLAN.md §3 prohíbe expresamente meterlos en
 *   Zustand, y con razón: separarlos de la revisión es lo que convierte un
 *   conflicto detectable en una sobrescritura silenciosa.
 * - Lo **efímero** (qué hay seleccionado, qué pestaña, qué ancho de
 *   previsualización, la ejecución de prueba) vive en el almacén de Zustand,
 *   porque se puede perder sin consecuencias.
 *
 * El autoguardado observa el documento por identidad: cada acción devuelve un
 * objeto nuevo, así que no hace falta ninguna bandera de «sucio» que alguien
 * pueda olvidarse de bajar.
 */

import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  analizarDocumento,
  anadirBloque as anadirBloqueDoc,
  anadirPantallaFinal as anadirPantallaFinalDoc,
  desplazarBloque as desplazarBloqueDoc,
  duplicarBloque as duplicarBloqueDoc,
  eliminarBloque as eliminarBloqueDoc,
  eliminarPantallaFinal as eliminarPantallaFinalDoc,
  moverBloque as moverBloqueDoc,
  type GuardarBorrador,
  type PlantillaDeBloque,
} from '@/lib/editor';
import { firstScreen, type AnswersMap, type FormDefinition, type ScreenRef } from '@/lib/forms';

import { crearAcciones, type Transformacion } from './acciones';
import {
  INTEGRACION_MEDIA_POR_DEFECTO,
  ProveedorMedia,
  type IntegracionMedia,
} from './contexto-media';
import { useEstadoEditor, type Seleccion } from './estado';
import { AvisoDeConflicto, IndicadorGuardado } from './indicador-guardado';
import { ListaBloques } from './lista-bloques';
import { PanelPropiedades } from './panel-propiedades';
import { Previsualizacion } from './previsualizacion';
import { BotonEditor } from './ui/piezas';
import { useAutoguardado } from './usar-autoguardado';

/* -------------------------------------------------------------------------- */
/* Props                                                                       */
/* -------------------------------------------------------------------------- */

export interface PropsEditorFormulario {
  readonly formularioId: string;
  /** Borrador leído de `GET /api/forms/:id`. */
  readonly definicionInicial: FormDefinition;
  /** Revisión del borrador en el momento de la lectura. */
  readonly revisionInicial: number;
  /** Enlace público del formulario, si ya está publicado. */
  readonly urlPublica?: string | null;
  /** Integración con el pipeline de media (fase 6). */
  readonly integracionMedia?: IntegracionMedia;
  /** Se invoca al resolver un conflicto de revisión recargando. */
  readonly alRecargar?: () => void;
  /** Inyectables para los tests. */
  readonly guardar?: GuardarBorrador;
  readonly retardoAutoguardadoMs?: number;
}

/* -------------------------------------------------------------------------- */
/* Componente                                                                  */
/* -------------------------------------------------------------------------- */

/** Pantalla que debe mostrar la previsualización según lo seleccionado. */
function pantallaDe(definicion: FormDefinition, seleccion: Seleccion): ScreenRef {
  if (seleccion.tipo === 'bloque') return { kind: 'block', id: seleccion.id };
  if (seleccion.tipo === 'final') return { kind: 'end_screen', id: seleccion.id };
  return firstScreen(definicion);
}

export function EditorFormulario({
  formularioId,
  definicionInicial,
  revisionInicial,
  urlPublica = null,
  integracionMedia = INTEGRACION_MEDIA_POR_DEFECTO,
  alRecargar,
  guardar,
  retardoAutoguardadoMs,
}: PropsEditorFormulario) {
  const [definicion, setDefinicion] = useState<FormDefinition>(definicionInicial);

  const seleccion = useEstadoEditor((estado) => estado.seleccion);
  const pestana = useEstadoEditor((estado) => estado.pestana);
  const dispositivo = useEstadoEditor((estado) => estado.dispositivo);
  const enPrueba = useEstadoEditor((estado) => estado.enPrueba);
  const sesionDePrueba = useEstadoEditor((estado) => estado.sesionDePrueba);
  const respuestas = useEstadoEditor((estado) => estado.respuestas);
  const seleccionar = useEstadoEditor((estado) => estado.seleccionar);
  const cambiarPestana = useEstadoEditor((estado) => estado.cambiarPestana);
  const cambiarDispositivo = useEstadoEditor((estado) => estado.cambiarDispositivo);
  const iniciarPrueba = useEstadoEditor((estado) => estado.iniciarPrueba);
  const salirDePrueba = useEstadoEditor((estado) => estado.salirDePrueba);
  const establecerRespuestas = useEstadoEditor((estado) => estado.establecerRespuestas);
  const reiniciar = useEstadoEditor((estado) => estado.reiniciar);

  // El almacén es de módulo: al montar un editor se limpia lo que dejara el
  // anterior (otra navegación, otro formulario).
  useEffect(() => {
    reiniciar();
  }, [reiniciar]);

  const aplicar = useCallback((transformacion: Transformacion): void => {
    setDefinicion((actual) => transformacion(actual));
  }, []);

  const acciones = useMemo(() => crearAcciones(aplicar), [aplicar]);

  const autoguardado = useAutoguardado({
    formularioId,
    definicion,
    revisionInicial,
    ...(guardar === undefined ? {} : { guardar }),
    ...(retardoAutoguardadoMs === undefined ? {} : { retardoMs: retardoAutoguardadoMs }),
  });

  const diagnostico = useMemo(() => analizarDocumento(definicion), [definicion]);

  /* --- Operaciones que además mueven la selección ------------------------- */

  // Estas cuatro mueven además la selección, así que se resuelven fuera del
  // actualizador: un `setState` que además toca otro almacén se ejecutaría dos
  // veces en modo estricto y dejaría la selección en un sitio distinto del
  // documento.
  const anadirBloque = useCallback(
    (tipo: PlantillaDeBloque['tipo']): void => {
      const resultado = anadirBloqueDoc(definicion, tipo);
      setDefinicion(resultado.definicion);
      seleccionar({ tipo: 'bloque', id: resultado.bloque.id });
    },
    [definicion, seleccionar],
  );

  const anadirPantallaFinal = useCallback((): void => {
    const resultado = anadirPantallaFinalDoc(definicion);
    setDefinicion(resultado.definicion);
    seleccionar({ tipo: 'final', id: resultado.pantalla.id });
  }, [definicion, seleccionar]);

  const eliminarBloque = useCallback(
    (bloqueId: string): void => {
      const siguiente = eliminarBloqueDoc(definicion, bloqueId);
      setDefinicion(siguiente);
      const sustituto = siguiente.blocks[0];
      seleccionar(
        sustituto === undefined ? { tipo: 'ajustes' } : { tipo: 'bloque', id: sustituto.id },
      );
    },
    [definicion, seleccionar],
  );

  const eliminarPantallaFinal = useCallback(
    (pantallaId: string): void => {
      const siguiente = eliminarPantallaFinalDoc(definicion, pantallaId);
      if (siguiente === definicion) return;
      setDefinicion(siguiente);
      seleccionar({ tipo: 'ajustes' });
    },
    [definicion, seleccionar],
  );

  const duplicarBloque = useCallback((bloqueId: string): void => {
    setDefinicion((actual) => duplicarBloqueDoc(actual, bloqueId));
  }, []);

  const reordenar = useCallback((desde: number, hasta: number): void => {
    setDefinicion((actual) => moverBloqueDoc(actual, desde, hasta));
  }, []);

  const desplazarBloque = useCallback((bloqueId: string, delta: number): void => {
    setDefinicion((actual) => desplazarBloqueDoc(actual, bloqueId, delta));
  }, []);

  const recargar = useCallback((): void => {
    if (alRecargar !== undefined) {
      alRecargar();
      return;
    }
    window.location.reload();
  }, [alRecargar]);

  /* --- Previsualización ---------------------------------------------------- */

  const pantalla = pantallaDe(definicion, seleccion);

  const alCambiarPantalla = useCallback(
    (siguiente: ScreenRef): void => {
      if (siguiente.kind === 'block') seleccionar({ tipo: 'bloque', id: siguiente.id });
      else if (siguiente.kind === 'end_screen') seleccionar({ tipo: 'final', id: siguiente.id });
    },
    [seleccionar],
  );

  const alCambiarRespuestas = useCallback(
    (siguientes: AnswersMap): void => {
      establecerRespuestas(siguientes);
    },
    [establecerRespuestas],
  );

  /* --- Render -------------------------------------------------------------- */

  return (
    <ProveedorMedia value={integracionMedia}>
      <div className="flex h-dvh flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-sm font-semibold">{definicion.meta.title}</h1>
            <span
              data-publicable={diagnostico.publicable ? 'si' : 'no'}
              className={
                diagnostico.publicable
                  ? 'shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6875rem] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }
            >
              {diagnostico.publicable
                ? 'Listo para publicar'
                : `${String(diagnostico.errores.length)} problema(s) que impiden publicar`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <IndicadorGuardado autoguardado={autoguardado} alRecargar={recargar} />
            {urlPublica === null ? null : (
              <a
                href={urlPublica}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline dark:text-blue-300"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
                Ver publicado
              </a>
            )}
            <BotonEditor
              tamano="sm"
              variante="secundario"
              onClick={autoguardado.guardarAhora}
              disabled={!autoguardado.hayCambiosSinGuardar}
            >
              Guardar ahora
            </BotonEditor>
          </div>
        </header>

        {autoguardado.estado === 'conflicto' ? (
          <div className="shrink-0 px-4 py-2">
            <AvisoDeConflicto autoguardado={autoguardado} alRecargar={recargar} />
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)_22rem]">
          <nav
            aria-label="Recorrido del formulario"
            className="min-h-0 border-neutral-200 lg:border-r dark:border-neutral-800"
          >
            <ListaBloques
              definicion={definicion}
              seleccion={seleccion}
              diagnostico={diagnostico}
              alSeleccionar={seleccionar}
              alReordenar={reordenar}
              alDesplazarBloque={desplazarBloque}
              alAnadirBloque={anadirBloque}
              alDuplicarBloque={duplicarBloque}
              alEliminarBloque={eliminarBloque}
              alAnadirPantallaFinal={anadirPantallaFinal}
              alEliminarPantallaFinal={eliminarPantallaFinal}
            />
          </nav>

          <div className="min-h-0">
            <Previsualizacion
              definicion={definicion}
              pantalla={pantalla}
              respuestas={respuestas}
              alCambiarRespuestas={alCambiarRespuestas}
              alCambiarPantalla={alCambiarPantalla}
              dispositivo={dispositivo}
              alCambiarDispositivo={cambiarDispositivo}
              enPrueba={enPrueba}
              sesionDePrueba={sesionDePrueba}
              alIniciarPrueba={iniciarPrueba}
              alSalirDePrueba={salirDePrueba}
              resolverMedia={integracionMedia.resolverMedia}
            />
          </div>

          <div className="min-h-0 border-neutral-200 lg:border-l dark:border-neutral-800">
            <PanelPropiedades
              definicion={definicion}
              seleccion={seleccion}
              pestana={pestana}
              diagnostico={diagnostico}
              acciones={acciones}
              alCambiarPestana={cambiarPestana}
            />
          </div>
        </div>
      </div>
    </ProveedorMedia>
  );
}
