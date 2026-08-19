'use client';

/**
 * Ciclo de autoguardado del borrador.
 *
 * Reglas que no se pueden relajar, por orden de importancia:
 *
 * 1. **Nunca se pierde un cambio.** El documento vivo se guarda en una
 *    referencia y se compara por identidad con el último confirmado por el
 *    servidor; si llega un cambio mientras una petición está en vuelo, se
 *    reprograma otra en cuanto termina.
 * 2. **Nunca se sobrescribe en silencio.** Un `409` deja el ciclo *bloqueado*:
 *    no se vuelve a escribir hasta que la persona decida qué hacer. Reintentar
 *    con la revisión del servidor sería exactamente la sobrescritura silenciosa
 *    que el control optimista existe para impedir.
 * 3. **Solo hay una petición en vuelo.** Dos `PUT` simultáneos con la misma
 *    revisión producen un 409 provocado por el propio editor.
 *
 * El estado es observable desde fuera para que la interfaz pueda decir en todo
 * momento en cuál de los cinco puntos está.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { guardarBorrador, type GuardarBorrador } from '@/lib/editor';
import type { FormDefinition } from '@/lib/forms';

/** Retardo por defecto entre la última pulsación y el guardado. */
export const RETARDO_AUTOGUARDADO_MS = 900;

/** Estado visible del autoguardado. */
export type EstadoAutoguardado = 'guardado' | 'pendiente' | 'guardando' | 'error' | 'conflicto';

export interface OpcionesAutoguardado {
  readonly formularioId: string;
  /** Documento vivo. Debe cambiar de identidad en cada edición. */
  readonly definicion: FormDefinition;
  /** Revisión leída del servidor al abrir el editor. */
  readonly revisionInicial: number;
  readonly retardoMs?: number;
  /** Inyectable para los tests; por defecto, el cliente HTTP real. */
  readonly guardar?: GuardarBorrador;
}

export interface Autoguardado {
  readonly estado: EstadoAutoguardado;
  /** Revisión que el editor cree tener. */
  readonly revision: number;
  /** Revisión que el servidor dice tener. Solo con `estado === 'conflicto'`. */
  readonly revisionServidor: number | null;
  readonly guardadoEn: Date | null;
  /** Mensaje del último fallo o conflicto. */
  readonly mensaje: string | null;
  /** `true` si hay cambios que todavía no están en el servidor. */
  readonly hayCambiosSinGuardar: boolean;
  /** Fuerza el guardado sin esperar al debounce. */
  readonly guardarAhora: () => void;
}

export function useAutoguardado({
  formularioId,
  definicion,
  revisionInicial,
  retardoMs = RETARDO_AUTOGUARDADO_MS,
  guardar = guardarBorrador,
}: OpcionesAutoguardado): Autoguardado {
  const [estado, setEstado] = useState<EstadoAutoguardado>('guardado');
  const [revision, setRevision] = useState(revisionInicial);
  const [revisionServidor, setRevisionServidor] = useState<number | null>(null);
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  /** Documento vivo. */
  const vivoRef = useRef(definicion);
  /** Último documento que el servidor ha confirmado. */
  const confirmadoRef = useRef(definicion);
  const revisionRef = useRef(revisionInicial);
  const guardarRef = useRef(guardar);
  const bloqueadoRef = useRef(false);
  const enVueloRef = useRef(false);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const montadoRef = useRef(true);
  const programarRef = useRef<() => void>(() => undefined);

  // Las referencias se sincronizan en efectos, nunca durante el render: leerlas
  // o escribirlas en el cuerpo del componente rompe con `StrictMode`.
  useEffect(() => {
    guardarRef.current = guardar;
  }, [guardar]);

  const cancelar = useCallback((): void => {
    if (temporizadorRef.current !== null) {
      clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
  }, []);

  const ejecutar = useCallback(async (): Promise<void> => {
    if (bloqueadoRef.current || enVueloRef.current) return;

    const instantanea = vivoRef.current;
    if (instantanea === confirmadoRef.current) {
      setEstado('guardado');
      return;
    }

    enVueloRef.current = true;
    setEstado('guardando');

    const resultado = await guardarRef.current(formularioId, revisionRef.current, instantanea);

    enVueloRef.current = false;
    if (!montadoRef.current) return;

    if (resultado.estado === 'guardado') {
      revisionRef.current = resultado.revision;
      confirmadoRef.current = instantanea;
      setRevision(resultado.revision);
      setGuardadoEn(resultado.guardadoEn);
      setMensaje(null);
      // Lo editado mientras la petición estaba en vuelo entra en la siguiente.
      if (vivoRef.current !== instantanea) {
        setEstado('pendiente');
        programarRef.current();
      } else {
        setEstado('guardado');
      }
      return;
    }

    if (resultado.estado === 'conflicto') {
      bloqueadoRef.current = true;
      cancelar();
      setRevisionServidor(resultado.revisionServidor);
      setMensaje(resultado.mensaje);
      setEstado('conflicto');
      return;
    }

    setMensaje(resultado.mensaje);
    setEstado('error');
  }, [cancelar, formularioId]);

  const programar = useCallback((): void => {
    if (bloqueadoRef.current) return;
    cancelar();
    temporizadorRef.current = setTimeout(() => {
      temporizadorRef.current = null;
      void ejecutar();
    }, retardoMs);
  }, [cancelar, ejecutar, retardoMs]);

  useEffect(() => {
    programarRef.current = programar;
  }, [programar]);

  useEffect(() => {
    vivoRef.current = definicion;
    if (definicion === confirmadoRef.current) return;
    if (bloqueadoRef.current) return;
    setEstado('pendiente');
    programar();
  }, [definicion, programar]);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      cancelar();
    };
  }, [cancelar]);

  /**
   * Aviso del navegador al cerrar con cambios sin guardar. Es la última red:
   * el debounce es corto, pero cerrar la pestaña justo después de escribir no
   * debería costar el último párrafo.
   */
  useEffect(() => {
    if (estado === 'guardado') return undefined;
    const alSalir = (evento: BeforeUnloadEvent): void => {
      evento.preventDefault();
    };
    window.addEventListener('beforeunload', alSalir);
    return () => {
      window.removeEventListener('beforeunload', alSalir);
    };
  }, [estado]);

  const guardarAhora = useCallback((): void => {
    cancelar();
    void ejecutar();
  }, [cancelar, ejecutar]);

  return useMemo<Autoguardado>(
    () => ({
      estado,
      revision,
      revisionServidor,
      guardadoEn,
      mensaje,
      hayCambiosSinGuardar: estado !== 'guardado',
      guardarAhora,
    }),
    [estado, guardadoEn, guardarAhora, mensaje, revision, revisionServidor],
  );
}
