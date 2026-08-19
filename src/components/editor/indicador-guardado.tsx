'use client';

/**
 * Estado visible del autoguardado.
 *
 * Los cuatro estados que exige el plan —guardando, guardado, error y
 * conflicto— son visualmente distintos y se anuncian a los lectores de
 * pantalla. El conflicto no es «un error más»: ocupa su propia caja, dice qué
 * revisión tiene el servidor y ofrece recargar, porque la única salida honesta
 * de un 409 es traerse la versión buena, no reintentar por encima.
 */

import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from 'lucide-react';

import { cn } from '@/components/ui/cn';

import { BotonEditor, CajaAviso } from './ui/piezas';
import type { Autoguardado, EstadoAutoguardado } from './usar-autoguardado';

const TEXTOS: Readonly<Record<EstadoAutoguardado, string>> = {
  guardado: 'Guardado',
  pendiente: 'Cambios sin guardar',
  guardando: 'Guardando…',
  error: 'No se ha podido guardar',
  conflicto: 'Conflicto de versiones',
};

function Icono({ estado }: { readonly estado: EstadoAutoguardado }) {
  switch (estado) {
    case 'guardando':
      return <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />;
    case 'guardado':
      return <Check aria-hidden="true" className="size-3.5" />;
    case 'error':
      return <CloudOff aria-hidden="true" className="size-3.5" />;
    case 'conflicto':
      return <AlertTriangle aria-hidden="true" className="size-3.5" />;
    case 'pendiente':
      return <RefreshCw aria-hidden="true" className="size-3.5" />;
  }
}

const COLORES: Readonly<Record<EstadoAutoguardado, string>> = {
  guardado: 'text-emerald-700 dark:text-emerald-400',
  pendiente: 'text-neutral-500 dark:text-neutral-400',
  guardando: 'text-neutral-500 dark:text-neutral-400',
  error: 'text-red-700 dark:text-red-400',
  conflicto: 'text-amber-700 dark:text-amber-400',
};

function hora(fecha: Date): string {
  return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export interface PropsIndicadorGuardado {
  readonly autoguardado: Autoguardado;
  /** Recarga el borrador del servidor descartando los cambios locales. */
  readonly alRecargar: () => void;
}

export function IndicadorGuardado({ autoguardado }: PropsIndicadorGuardado) {
  const { estado, guardadoEn, mensaje } = autoguardado;

  return (
    <div className="flex items-center gap-2">
      <p
        role="status"
        aria-live="polite"
        data-estado={estado}
        className={cn('inline-flex items-center gap-1.5 text-xs font-medium', COLORES[estado])}
      >
        <Icono estado={estado} />
        <span>{TEXTOS[estado]}</span>
        {estado === 'guardado' && guardadoEn !== null ? (
          <span className="font-normal text-neutral-500 dark:text-neutral-400">
            a las {hora(guardadoEn)}
          </span>
        ) : null}
      </p>

      {estado === 'error' ? (
        <BotonEditor
          tamano="sm"
          variante="secundario"
          onClick={autoguardado.guardarAhora}
          title={mensaje ?? undefined}
        >
          Reintentar
        </BotonEditor>
      ) : null}
    </div>
  );
}

/**
 * Aviso a pantalla completa del conflicto de revisión.
 *
 * Se muestra aparte del indicador porque exige una decisión: mientras esté ahí,
 * el editor no vuelve a escribir en el servidor.
 */
export function AvisoDeConflicto({ autoguardado, alRecargar }: PropsIndicadorGuardado) {
  if (autoguardado.estado !== 'conflicto') return null;

  return (
    <CajaAviso tono="advertencia" className="flex flex-col gap-2">
      <p className="text-sm font-semibold">El borrador ha cambiado fuera de esta pestaña</p>
      <p>
        {autoguardado.mensaje ??
          'Otra pestaña o dispositivo ha guardado este mismo borrador después de que tú lo abrieras.'}
      </p>
      <p className="tabular-nums">
        Tu revisión: <strong>{String(autoguardado.revision)}</strong> · Revisión del servidor:{' '}
        <strong>{String(autoguardado.revisionServidor ?? '—')}</strong>
      </p>
      <p>
        Para no perder trabajo ajeno, el guardado automático está detenido. Recarga para traerte la
        versión del servidor; los cambios que hayas hecho aquí desde entonces se perderán, así que
        cópialos antes si te importan.
      </p>
      <div>
        <BotonEditor variante="principal" tamano="sm" onClick={alRecargar}>
          Recargar el borrador del servidor
        </BotonEditor>
      </div>
    </CajaAviso>
  );
}
