'use client';

import { MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BarraProgreso } from '@/components/ui/barra-progreso';
import { cn } from '@/components/ui/cn';
import { Imagen } from '@/components/ui/imagen';
import {
  firstScreen,
  isQuestionBlock,
  nextScreen,
  progressFor,
  type AnswerValue,
  type AnswersMap,
  type BlockDefinition,
  type FormDefinition,
  type FormProgress,
  type ScreenRef,
} from '@/lib/forms';
import { atributosDeTema, estiloDeTema } from '@/lib/theme';

import { ProveedorFormulario, idsDePantalla, type ValorContextoFormulario } from './contexto';
import { SIN_MEDIA, resolverOpcional, type ResolverMedia } from './medios';
import { PantallaBloque } from './pantalla-bloque';
import { mensajeDeError } from './validacion';

/* -------------------------------------------------------------------------- */
/* Contrato del componente                                                     */
/* -------------------------------------------------------------------------- */

/** Respuesta que se abandona al avanzar. `null` en bloques sin respuesta. */
export interface RespuestaEmitida {
  readonly bloqueId: string;
  readonly valor: AnswerValue;
}

/** Datos de un avance, ya validado y con el destino calculado por el motor. */
export interface EventoAvance {
  readonly desde: ScreenRef;
  readonly hacia: ScreenRef;
  readonly bloque: BlockDefinition;
  readonly respuesta: RespuestaEmitida | null;
  /** Respuestas completas tras aplicar la del bloque abandonado. */
  readonly respuestas: AnswersMap;
}

/**
 * Props del renderer.
 *
 * **Esta lista es la costura completa.** Todo lo que distingue la
 * previsualización del editor de la experiencia pública entra por aquí; dentro
 * del árbol de render no hay ninguna condición sobre el modo. Ver el README de
 * esta carpeta.
 */
export interface PropsRenderizadorFormulario {
  /** Documento a pintar. Borrador en el editor, versión publicada en público. */
  readonly definicion: FormDefinition;

  /** Respuestas controladas. Si se omite, el renderer las guarda internamente. */
  readonly respuestas?: AnswersMap;
  /** Respuestas de partida en modo no controlado (sesión reanudada). */
  readonly respuestasIniciales?: AnswersMap;
  readonly onRespuestasChange?: (respuestas: AnswersMap) => void;

  /** Pantalla controlada. El editor la usa para seguir a la pregunta seleccionada. */
  readonly pantalla?: ScreenRef;
  /** Pantalla de partida en modo no controlado. */
  readonly pantallaInicial?: ScreenRef;
  readonly onPantallaChange?: (pantalla: ScreenRef) => void;

  /**
   * Se invoca al avanzar, **antes** de cambiar de pantalla. Si devuelve una
   * promesa, el renderer espera y muestra el botón en estado de carga; si la
   * promesa se rechaza, la pantalla no cambia y se muestra el error. Es el
   * punto donde la experiencia pública guarda la respuesta y donde la
   * previsualización del editor no hace nada.
   */
  readonly onAvanzar?: (evento: EventoAvance) => void | Promise<void>;
  /** Se invoca cuando el recorrido llega a una pantalla final. */
  readonly onCompletar?: (respuestas: AnswersMap) => void | Promise<void>;

  /** Traduce `mediaAssetId` a URL. Ver `medios.ts`. */
  readonly resolverMedia?: ResolverMedia;

  /** Mueve el foco al primer control al cambiar de pantalla. */
  readonly enfocarAlCambiar?: boolean;
  readonly className?: string;
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

function claveDePantalla(pantalla: ScreenRef): string {
  return pantalla.kind === 'complete' ? 'complete' : `${pantalla.kind}:${pantalla.id}`;
}

/** Resuelve la referencia de pantalla a un bloque real del documento. */
function bloqueDePantalla(
  definicion: FormDefinition,
  pantalla: ScreenRef,
): BlockDefinition | null {
  if (pantalla.kind === 'block') {
    return definicion.blocks.find((bloque) => bloque.id === pantalla.id) ?? null;
  }
  if (pantalla.kind === 'end_screen') {
    return definicion.endScreens.find((bloque) => bloque.id === pantalla.id) ?? null;
  }
  return null;
}

const PROGRESO_COMPLETO: FormProgress = {
  answered: 0,
  remaining: 0,
  total: 0,
  ratio: 1,
  deterministic: true,
};

function mensajeDeExcepcion(excepcion: unknown): string {
  if (excepcion instanceof Error && excepcion.message !== '') return excepcion.message;
  return 'No se ha podido guardar la respuesta. Inténtalo de nuevo.';
}

/* -------------------------------------------------------------------------- */
/* Renderer                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Renderer conversacional: una pregunta por pantalla, dirigido por
 * `FormDefinition`.
 *
 * Es **el mismo componente** en la previsualización del editor y en la
 * experiencia pública. No contiene ninguna rama de modo: lo que cambia entre
 * las dos vistas son las props de arriba.
 */
export function RenderizadorFormulario({
  definicion,
  respuestas,
  respuestasIniciales,
  onRespuestasChange,
  pantalla,
  pantallaInicial,
  onPantallaChange,
  onAvanzar,
  onCompletar,
  resolverMedia = SIN_MEDIA,
  enfocarAlCambiar = true,
  className,
}: PropsRenderizadorFormulario) {
  const [respuestasInternas, setRespuestasInternas] = useState<AnswersMap>(
    () => respuestasIniciales ?? {},
  );
  const [pantallaInterna, setPantallaInterna] = useState<ScreenRef>(
    () => pantallaInicial ?? firstScreen(definicion),
  );
  const [historial, setHistorial] = useState<readonly ScreenRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const respuestasActuales = respuestas ?? respuestasInternas;
  const pantallaActual = pantalla ?? pantallaInterna;
  const clave = claveDePantalla(pantallaActual);

  const contenedor = useRef<HTMLElement | null>(null);

  const irA = useCallback(
    (destino: ScreenRef): void => {
      setPantallaInterna(destino);
      onPantallaChange?.(destino);
    },
    [onPantallaChange],
  );

  const establecerRespuesta = useCallback(
    (bloqueId: string, valor: AnswerValue): void => {
      const siguiente: AnswersMap = { ...respuestasActuales, [bloqueId]: valor };
      setRespuestasInternas(siguiente);
      onRespuestasChange?.(siguiente);
      // Corregir la respuesta limpia el error: mantenerlo mientras se escribe
      // convierte cualquier validación en un reproche permanente.
      setError(null);
    },
    [onRespuestasChange, respuestasActuales],
  );

  const bloqueActual = bloqueDePantalla(definicion, pantallaActual);

  const preguntas = useMemo(() => definicion.blocks.filter(isQuestionBlock), [definicion.blocks]);
  const numeroPregunta =
    bloqueActual !== null && isQuestionBlock(bloqueActual)
      ? preguntas.findIndex((pregunta) => pregunta.id === bloqueActual.id) + 1
      : null;

  const destino = useMemo<ScreenRef | null>(() => {
    if (pantallaActual.kind !== 'block' || bloqueActual === null) return null;
    return nextScreen(definicion, respuestasActuales, bloqueActual.id);
  }, [definicion, respuestasActuales, pantallaActual, bloqueActual]);

  const progreso = useMemo<FormProgress>(() => {
    if (pantallaActual.kind !== 'block' || bloqueActual === null) return PROGRESO_COMPLETO;
    return progressFor(definicion, respuestasActuales, bloqueActual.id);
  }, [definicion, respuestasActuales, pantallaActual, bloqueActual]);

  const enfocarPantalla = useCallback((): void => {
    const nodo = contenedor.current;
    if (nodo === null) return;
    const objetivo = nodo.querySelector<HTMLElement>('[data-autofoco="true"]');
    (objetivo ?? nodo).focus();
  }, []);

  useEffect(() => {
    if (!enfocarAlCambiar) return;
    enfocarPantalla();
  }, [clave, enfocarAlCambiar, enfocarPantalla]);

  // Al aparecer un error el foco vuelve al control: quien responde con teclado
  // no puede quedarse en el botón sin saber qué corregir.
  useEffect(() => {
    if (error === null) return;
    enfocarPantalla();
  }, [error, enfocarPantalla]);

  const avanzar = useCallback((): void => {
    if (enviando) return;
    if (pantallaActual.kind !== 'block' || bloqueActual === null) return;

    let respuestasTras = respuestasActuales;
    let respuesta: RespuestaEmitida | null = null;

    if (isQuestionBlock(bloqueActual)) {
      const valor: AnswerValue = respuestasActuales[bloqueActual.id] ?? null;
      const mensaje = mensajeDeError(bloqueActual, valor);
      if (mensaje !== null) {
        setError(mensaje);
        return;
      }
      // Una pregunta pasada en blanco se registra como `null`: el motor
      // necesita distinguirla de «todavía no vista» para resolver su rama.
      respuestasTras = { ...respuestasActuales, [bloqueActual.id]: valor };
      respuesta = { bloqueId: bloqueActual.id, valor };
    }

    const hacia = nextScreen(definicion, respuestasTras, bloqueActual.id);
    const desde = pantallaActual;

    const aplicar = (): void => {
      setRespuestasInternas(respuestasTras);
      onRespuestasChange?.(respuestasTras);
      setHistorial((previo) => [...previo, desde]);
      setError(null);
      irA(hacia);
    };

    if (onAvanzar === undefined) {
      aplicar();
      if (hacia.kind !== 'block') void onCompletar?.(respuestasTras);
      return;
    }

    setEnviando(true);
    void (async () => {
      try {
        await onAvanzar({ desde, hacia, bloque: bloqueActual, respuesta, respuestas: respuestasTras });
        aplicar();
        if (hacia.kind !== 'block') await onCompletar?.(respuestasTras);
      } catch (excepcion) {
        setError(mensajeDeExcepcion(excepcion));
      } finally {
        setEnviando(false);
      }
    })();
  }, [
    bloqueActual,
    definicion,
    enviando,
    irA,
    onAvanzar,
    onCompletar,
    onRespuestasChange,
    pantallaActual,
    respuestasActuales,
  ]);

  const retroceder = useCallback((): void => {
    const anterior = historial[historial.length - 1];
    if (anterior === undefined) return;
    setHistorial(historial.slice(0, -1));
    setError(null);
    irA(anterior);
  }, [historial, irA]);

  const tema = definicion.theme;
  const logo = resolverOpcional(resolverMedia, tema.logoAssetId);
  const fondo = resolverOpcional(resolverMedia, tema.backgroundImageAssetId);

  const valorContexto = useMemo<ValorContextoFormulario | null>(() => {
    if (bloqueActual === null) return null;
    return {
      definicion,
      tema,
      resolverMedia,
      bloqueActual,
      respuestas: respuestasActuales,
      establecerRespuesta,
      avanzar,
      retroceder,
      puedeRetroceder: historial.length > 0,
      enviando,
      error,
      esUltimoPaso: destino !== null && destino.kind !== 'block',
      numeroPregunta,
      totalPreguntas: preguntas.length,
      progreso,
    };
  }, [
    avanzar,
    bloqueActual,
    definicion,
    destino,
    enviando,
    error,
    establecerRespuesta,
    historial.length,
    numeroPregunta,
    preguntas.length,
    progreso,
    respuestasActuales,
    resolverMedia,
    retroceder,
    tema,
  ]);

  const ids = bloqueActual === null ? null : idsDePantalla(bloqueActual.id);

  return (
    <MotionConfig reducedMotion="user">
      <div
        {...atributosDeTema(tema)}
        data-renderizador="formulario"
        className={cn(
          'tp-raiz @container relative isolate flex min-h-full w-full flex-col overflow-hidden',
          className,
        )}
        style={estiloDeTema(tema, { urlImagenFondo: fondo?.url ?? null })}
      >
        {fondo !== null ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: 'var(--tp-imagen-fondo)' }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[var(--tp-fondo)]"
              style={{ opacity: 'var(--tp-superposicion)' }}
            />
          </>
        ) : null}

        {definicion.settings.showProgressBar ? (
          <BarraProgreso
            valor={progreso.ratio}
            aproximado={!progreso.deterministic}
            className="relative z-10"
          />
        ) : null}

        <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-10 @md:px-8 @md:py-14">
          {logo !== null ? (
            <Imagen
              src={logo.url}
              alt={logo.alt ?? ''}
              loading="eager"
              className="h-10 w-auto shrink-0 object-contain"
              style={{ alignSelf: 'var(--tp-alineacion-flex)' }}
            />
          ) : null}

          <motion.section
            key={clave}
            ref={contenedor}
            tabIndex={-1}
            aria-labelledby={ids?.titulo}
            className="flex flex-1 flex-col justify-center outline-none"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {valorContexto === null ? (
              <p className="font-medium" style={{ fontSize: 'var(--tp-tamano-titulo)' }}>
                Respuesta enviada. ¡Gracias!
              </p>
            ) : (
              <ProveedorFormulario value={valorContexto}>
                <PantallaBloque bloque={valorContexto.bloqueActual} />
              </ProveedorFormulario>
            )}
          </motion.section>
        </div>
      </div>
    </MotionConfig>
  );
}
