'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { RenderizadorFormulario, type EventoAvance, type MediaResuelta } from '@/components/formulario';
import type { AnswersMap, FormDefinition, ScreenRef } from '@/lib/forms';

import {
  completarSesionPublica,
  crearSesionPublica,
  guardarRespuestaPublica,
} from './api';

/**
 * Experiencia pública de respuesta.
 *
 * Es una **costura**, no un renderer: monta el mismo `RenderizadorFormulario`
 * que usa la previsualización del editor y se limita a rellenar las props que
 * distinguen las dos vistas (ver `src/components/formulario/README.md`). Aquí no
 * se pinta ni una pregunta ni se decide ni un recorrido.
 *
 * Lo que aporta:
 *
 * - `onAvanzar` guarda la respuesta y **espera al servidor**. Si la promesa se
 *   rechaza, el renderer no cambia de pantalla y enseña el error sin perder lo
 *   introducido; eso ya está en el renderer y aquí solo hay que no tragarse la
 *   excepción.
 * - `onCompletar` cierra la sesión.
 * - `respuestasIniciales` / `pantallaInicial` reanudan la sesión del navegador.
 * - `resolverMedia` traduce identificadores a las URL públicas que el servidor
 *   resolvió al pintar la página.
 */

/** Sesión ya recuperada por el servidor al pintar la página. */
export interface SesionInicial {
  readonly respuestas: AnswersMap;
  readonly pantalla: ScreenRef;
  readonly completada: boolean;
}

export interface PropsExperienciaPublica {
  readonly formId: string;
  readonly slug: string;
  /**
   * Documento a responder. Es **la versión de la sesión** cuando se reanuda una
   * en curso, y la versión activa cuando se empieza de cero. Nunca el borrador.
   */
  readonly definicion: FormDefinition;
  /** Activos ya resueltos a URL pública por el servidor. */
  readonly medios: Readonly<Record<string, MediaResuelta>>;
  readonly sesionInicial?: SesionInicial | null;
}

export function ExperienciaPublica({
  formId,
  slug,
  definicion,
  medios,
  sesionInicial = null,
}: PropsExperienciaPublica) {
  /**
   * Promesa de creación de la sesión, compartida por todos los avances.
   *
   * La sesión se abre en el primer avance y no al montar: así una visita que se
   * queda mirando la pantalla de bienvenida y se va no cuenta como sesión
   * iniciada, y el contador de la fase 8 mide personas que empezaron de verdad.
   * Si la creación falla, la promesa se descarta para que el siguiente intento
   * vuelva a probar en lugar de arrastrar el error para siempre.
   */
  const creacion = useRef<Promise<void> | null>(null);
  const [reanudada] = useState(
    () => sesionInicial !== null && Object.keys(sesionInicial.respuestas).length > 0,
  );

  const asegurarSesion = useCallback((): Promise<void> => {
    if (sesionInicial !== null) return Promise.resolve();
    creacion.current ??= crearSesionPublica(slug)
      .then(() => undefined)
      .catch((error: unknown) => {
        creacion.current = null;
        throw error;
      });
    return creacion.current;
  }, [sesionInicial, slug]);

  const onAvanzar = useCallback(
    async (evento: EventoAvance): Promise<void> => {
      await asegurarSesion();
      await guardarRespuestaPublica(
        formId,
        evento.bloque.id,
        evento.respuesta?.valor ?? null,
      );
    },
    [asegurarSesion, formId],
  );

  const onCompletar = useCallback(async (): Promise<void> => {
    await completarSesionPublica(formId);
  }, [formId]);

  const resolverMedia = useCallback(
    (assetId: string): MediaResuelta | null => medios[assetId] ?? null,
    [medios],
  );

  const inicial = useMemo(() => sesionInicial, [sesionInicial]);

  return (
    <div className="relative flex min-h-dvh w-full flex-col">
      {reanudada ? (
        <p
          role="status"
          className="bg-neutral-900 px-4 py-2 text-center text-sm text-white"
        >
          Hemos recuperado tus respuestas anteriores. Puedes continuar donde lo dejaste.
        </p>
      ) : null}

      <RenderizadorFormulario
        definicion={definicion}
        {...(inicial === null ? {} : { respuestasIniciales: inicial.respuestas })}
        {...(inicial === null ? {} : { pantallaInicial: inicial.pantalla })}
        onAvanzar={onAvanzar}
        onCompletar={onCompletar}
        resolverMedia={resolverMedia}
        className="flex-1"
      />
    </div>
  );
}
