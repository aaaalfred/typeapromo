'use client';

import { useId, useState, type FormEvent } from 'react';

import { Boton } from '@/components/ui/boton';
import { CampoTexto } from '@/components/ui/campo';

import { Aviso } from './aviso';
import { Dialogo } from './dialogo';

/**
 * Alta de un formulario desde el panel.
 *
 * Solo pide el título: el resto del documento lo genera el servidor con
 * `createDefaultFormDefinition`, y el slug público se deriva y se desambigua
 * allí. Pedir aquí cualquier otra cosa sería duplicar decisiones que ya toma la
 * API.
 *
 * La validación del título se hace también en el cliente para no gastar una ida
 * y vuelta en un campo vacío, pero es una cortesía: el contrato de verdad está
 * en `createFormSchema` y su mensaje es el que se muestra si el servidor
 * rechaza el envío.
 *
 * Quien lo usa lo monta solo mientras está abierto, así que el estado interno
 * (título escrito, error de validación) nace limpio en cada apertura sin
 * necesidad de reiniciarlo desde un efecto.
 */
export interface PropsDialogoCrearFormulario {
  readonly abierto: boolean;
  readonly cargando?: boolean;
  readonly error?: string | null;
  readonly onCrear: (titulo: string, slug?: string) => void;
  readonly onCancelar: () => void;
}

export function DialogoCrearFormulario({
  abierto,
  cargando = false,
  error = null,
  onCrear,
  onCancelar,
}: PropsDialogoCrearFormulario) {
  const idCampo = useId();
  const idError = `${idCampo}-error`;
  const idSlug = useId();
  const idSlugError = `${idSlug}-error`;

  const [titulo, setTitulo] = useState('');
  const [slug, setSlug] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [errorSlugLocal, setErrorSlugLocal] = useState<string | null>(null);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpio = titulo.trim();
    if (limpio.length === 0) {
      setErrorLocal('Escribe un título para el formulario.');
      return;
    }
    setErrorLocal(null);

    const slugLimpio = slug.trim().toLowerCase();
    if (slugLimpio.length > 0) {
      if (slugLimpio.length < 3 || slugLimpio.length > 60) {
        setErrorSlugLocal('El slug debe tener entre 3 y 60 caracteres.');
        return;
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugLimpio)) {
        setErrorSlugLocal('El slug solo puede contener letras minúsculas, números y guiones simples.');
        return;
      }
    }
    setErrorSlugLocal(null);

    onCrear(limpio, slugLimpio.length > 0 ? slugLimpio : undefined);
  }

  const mensajeCampo = errorLocal;
  const mensajeSlug = errorSlugLocal;

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCancelar}
      titulo="Nuevo formulario"
      descripcion="Se creará un borrador con una pantalla de bienvenida y una pregunta, listo para abrirlo en el editor."
    >
      <form onSubmit={enviar} noValidate>
        <label htmlFor={idCampo} className="block text-sm font-medium">
          Título del formulario
        </label>
        <CampoTexto
          id={idCampo}
          name="titulo"
          value={titulo}
          autoComplete="off"
          maxLength={300}
          disabled={cargando}
          aria-invalid={mensajeCampo === null ? undefined : true}
          aria-describedby={mensajeCampo === null ? undefined : idError}
          onChange={(evento) => {
            setTitulo(evento.target.value);
          }}
          className="mt-2"
        />
        {mensajeCampo === null ? null : (
          <p id={idError} role="alert" className="mt-2 text-sm text-[color:var(--tp-error)]">
            {mensajeCampo}
          </p>
        )}

        <div className="mt-4">
          <label htmlFor={idSlug} className="block text-sm font-medium">
            Dirección pública (slug, opcional)
          </label>
          <div className="mt-2 flex items-center rounded-lg border border-[color:var(--tp-borde)] bg-[var(--tp-superficie)] px-3 text-sm">
            <span className="text-neutral-500 dark:text-neutral-400 select-none">/f/</span>
            <input
              id={idSlug}
              name="slug"
              type="text"
              value={slug}
              placeholder="se-generara-del-titulo"
              autoComplete="off"
              maxLength={60}
              disabled={cargando}
              aria-invalid={mensajeSlug === null ? undefined : true}
              aria-describedby={mensajeSlug === null ? undefined : idSlugError}
              onChange={(evento) => {
                setSlug(evento.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              }}
              className="w-full bg-transparent py-2 pl-1 pr-2 text-sm text-[color:var(--tp-texto)] placeholder:text-neutral-400 focus:outline-none"
            />
          </div>
          {mensajeSlug === null ? (
            <p className="mt-1 text-xs text-neutral-500">
              Opcional. Si lo dejas vacío, se creará uno automáticamente a partir del título.
            </p>
          ) : (
            <p id={idSlugError} role="alert" className="mt-1 text-sm text-[color:var(--tp-error)]">
              {mensajeSlug}
            </p>
          )}
        </div>

        {error === null ? null : (
          <Aviso titulo="No se ha podido crear el formulario" className="mt-4">
            {error}
          </Aviso>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Boton jerarquia="secundaria" onClick={onCancelar} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={cargando}>
            Crear y abrir el editor
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
