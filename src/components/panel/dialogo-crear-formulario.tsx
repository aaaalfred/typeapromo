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
  readonly onCrear: (titulo: string) => void;
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
  const [titulo, setTitulo] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpio = titulo.trim();
    if (limpio.length === 0) {
      setErrorLocal('Escribe un título para el formulario.');
      return;
    }
    setErrorLocal(null);
    onCrear(limpio);
  }

  const mensajeCampo = errorLocal;

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
