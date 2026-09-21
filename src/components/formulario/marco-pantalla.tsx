'use client';

import type { FormEvent, ReactNode } from 'react';

import { isQuestionBlock, type BlockDefinition } from '@/lib/forms';
import { cn } from '@/components/ui/cn';
import { Imagen } from '@/components/ui/imagen';

import { idsDePantalla, useFormulario } from './contexto';
import { resolverOpcional } from './medios';

/**
 * Estructura común a las once pantallas: imagen, numeración, título,
 * descripción, cuerpo, control, error y pie.
 *
 * Existe para que la accesibilidad se escriba **una sola vez**. Cada bloque
 * aporta únicamente su control; el `aria-labelledby`, el `aria-describedby`, el
 * marcador de obligatoria y la región de error son idénticos en todos.
 *
 * El contenedor es un `<form>` real: así el Intro de un campo de texto avanza
 * por comportamiento nativo del navegador y no por un manejador de teclas que
 * habría que replicar en cada bloque.
 */
export interface PropsMarcoPantalla {
  readonly bloque: BlockDefinition;
  /** Texto largo de las pantallas sin control (bienvenida, declaración, final). */
  readonly cuerpo?: string | undefined;
  /** Control de respuesta del bloque. */
  readonly children?: ReactNode;
  /** Botones de navegación. */
  readonly pie?: ReactNode;
  /** Pista de teclado bajo el pie, por ejemplo «pulsa Intro». */
  readonly pista?: ReactNode;
}

export function MarcoPantalla({ bloque, cuerpo, children, pie, pista }: PropsMarcoPantalla) {
  const { avanzar, error, resolverMedia, definicion, numeroPregunta, totalPreguntas } =
    useFormulario();
  const ids = idsDePantalla(bloque.id);
  const media = resolverOpcional(resolverMedia, bloque.mediaAssetId);
  const obligatoria = isQuestionBlock(bloque) && bloque.required;
  const conNumeracion = definicion.settings.showQuestionNumbers && numeroPregunta !== null;

  function manejarEnvio(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    avanzar();
  }

  return (
    <form
      noValidate
      onSubmit={manejarEnvio}
      className="flex w-full flex-col gap-6"
      data-bloque={bloque.id}
      data-tipo={bloque.type}
    >
      {media !== null ? (
        <Imagen
          src={media.url}
          alt={media.alt ?? ''}
          className="max-h-64 w-full rounded-[var(--tp-radio-superficie)] object-cover"
        />
      ) : null}

      <header className="flex flex-col gap-2">
        {conNumeracion ? (
          <p
            className="text-[color:var(--tp-acento)] font-medium"
            style={{ fontSize: 'var(--tp-tamano-menudo)' }}
          >
            <span className="sr-only">Pregunta </span>
            {numeroPregunta} <span aria-hidden="true">/</span>
            <span className="sr-only"> de </span> {totalPreguntas}
          </p>
        ) : null}

        <h2
          id={ids.titulo}
          className="font-semibold text-balance"
          style={{ fontSize: 'var(--tp-tamano-titulo)', lineHeight: 1.25 }}
        >
          {bloque.title}
          {obligatoria ? (
            <>
              <span aria-hidden="true" className="text-[color:var(--tp-error)]">
                {' '}
                *
              </span>
              <span className="sr-only"> (obligatoria)</span>
            </>
          ) : null}
        </h2>

        {bloque.description !== undefined && bloque.description !== '' ? (
          <p
            id={ids.descripcion}
            className="text-[color:var(--tp-texto-suave)] text-pretty"
            style={{ fontSize: 'var(--tp-tamano-subtitulo)' }}
          >
            {bloque.description}
          </p>
        ) : null}
      </header>

      {cuerpo !== undefined && cuerpo !== '' ? (
        <p className="text-[color:var(--tp-texto-suave)] whitespace-pre-line">{cuerpo}</p>
      ) : null}

      {children}

      <p
        id={ids.error}
        role="alert"
        className={cn(
          'text-[color:var(--tp-error)] font-medium',
          error === null && 'sr-only',
        )}
        style={{ fontSize: 'var(--tp-tamano-menudo)' }}
      >
        {error ?? ''}
      </p>

      {pie}
      {pista}
    </form>
  );
}
