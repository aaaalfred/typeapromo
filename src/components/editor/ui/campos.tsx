'use client';

/**
 * Controles del **chrome** del editor.
 *
 * Deliberadamente distintos de `components/ui`, que son los controles del
 * formulario y se pintan con los tokens `--tp-*` del tema del usuario. Estos
 * pertenecen a la aplicación y no deben cambiar de aspecto cuando alguien
 * elige un tema oscuro para su formulario: si compartieran estilos, tocar el
 * color de fondo del tema volvería ilegible el propio panel que lo edita.
 *
 * Son todos elementos nativos (`input`, `select`, `textarea`). Radix aporta
 * poco a un campo de texto y sus primitivas de deslizador y grupo de radio
 * exigen `ResizeObserver`, que jsdom no tiene: usarlas dejaría sin tests
 * precisamente los paneles más delicados.
 */

import { useId, type ReactNode } from 'react';

import { cn } from '@/components/ui/cn';

/* -------------------------------------------------------------------------- */
/* Piezas comunes                                                              */
/* -------------------------------------------------------------------------- */

const CLASES_CONTROL = [
  'w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm',
  'text-neutral-900 placeholder:text-neutral-400',
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500',
];

interface PropsEnvoltorio {
  readonly id: string;
  readonly etiqueta: string;
  readonly ayuda?: string;
  readonly children: ReactNode;
}

function Envoltorio({ id, etiqueta, ayuda, children }: PropsEnvoltorio) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
        {etiqueta}
      </label>
      {children}
      {ayuda === undefined ? null : (
        <p id={`${id}-ayuda`} className="text-xs text-neutral-500 dark:text-neutral-400">
          {ayuda}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Texto                                                                       */
/* -------------------------------------------------------------------------- */

export interface PropsCampoTexto {
  readonly etiqueta: string;
  readonly valor: string;
  readonly alCambiar: (valor: string) => void;
  readonly ayuda?: string;
  readonly marcador?: string;
  readonly tipo?: 'text' | 'date' | 'email';
  readonly maxLength?: number;
  readonly className?: string;
}

export function CampoTexto({
  etiqueta,
  valor,
  alCambiar,
  ayuda,
  marcador,
  tipo = 'text',
  maxLength,
  className,
}: PropsCampoTexto) {
  const id = useId();
  return (
    <Envoltorio id={id} etiqueta={etiqueta} ayuda={ayuda}>
      <input
        id={id}
        type={tipo}
        value={valor}
        placeholder={marcador}
        maxLength={maxLength}
        aria-describedby={ayuda === undefined ? undefined : `${id}-ayuda`}
        onChange={(evento) => {
          alCambiar(evento.target.value);
        }}
        className={cn(CLASES_CONTROL, className)}
      />
    </Envoltorio>
  );
}

export interface PropsCampoArea extends Omit<PropsCampoTexto, 'tipo'> {
  readonly filas?: number;
}

export function CampoArea({
  etiqueta,
  valor,
  alCambiar,
  ayuda,
  marcador,
  maxLength,
  filas = 3,
  className,
}: PropsCampoArea) {
  const id = useId();
  return (
    <Envoltorio id={id} etiqueta={etiqueta} ayuda={ayuda}>
      <textarea
        id={id}
        rows={filas}
        value={valor}
        placeholder={marcador}
        maxLength={maxLength}
        aria-describedby={ayuda === undefined ? undefined : `${id}-ayuda`}
        onChange={(evento) => {
          alCambiar(evento.target.value);
        }}
        className={cn(CLASES_CONTROL, 'resize-y', className)}
      />
    </Envoltorio>
  );
}

/* -------------------------------------------------------------------------- */
/* Números                                                                     */
/* -------------------------------------------------------------------------- */

export interface PropsCampoNumero {
  readonly etiqueta: string;
  /** `null` representa «sin valor», que en el contrato es la ausencia del campo. */
  readonly valor: number | null;
  readonly alCambiar: (valor: number | null) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly ayuda?: string;
  readonly marcador?: string;
}

export function CampoNumero({
  etiqueta,
  valor,
  alCambiar,
  min,
  max,
  step,
  ayuda,
  marcador,
}: PropsCampoNumero) {
  const id = useId();
  return (
    <Envoltorio id={id} etiqueta={etiqueta} ayuda={ayuda}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={valor === null ? '' : String(valor)}
        min={min}
        max={max}
        step={step}
        placeholder={marcador}
        aria-describedby={ayuda === undefined ? undefined : `${id}-ayuda`}
        onChange={(evento) => {
          const texto = evento.target.value.trim();
          if (texto === '') {
            alCambiar(null);
            return;
          }
          const numero = Number(texto);
          alCambiar(Number.isFinite(numero) ? numero : null);
        }}
        className={cn(CLASES_CONTROL)}
      />
    </Envoltorio>
  );
}

export interface PropsDeslizador {
  readonly etiqueta: string;
  readonly valor: number;
  readonly alCambiar: (valor: number) => void;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  /** Texto que acompaña al valor actual (p. ej. `px`). */
  readonly sufijo?: string;
}

export function Deslizador({
  etiqueta,
  valor,
  alCambiar,
  min,
  max,
  step = 1,
  sufijo = '',
}: PropsDeslizador) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          {etiqueta}
        </label>
        <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {String(valor)}
          {sufijo}
        </span>
      </div>
      <input
        id={id}
        type="range"
        value={valor}
        min={min}
        max={max}
        step={step}
        onChange={(evento) => {
          alCambiar(Number(evento.target.value));
        }}
        className="w-full accent-blue-600"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Selección                                                                   */
/* -------------------------------------------------------------------------- */

export interface OpcionSelector<T extends string> {
  readonly valor: T;
  readonly etiqueta: string;
}

export interface PropsSelector<T extends string> {
  readonly etiqueta: string;
  readonly valor: T;
  readonly alCambiar: (valor: T) => void;
  readonly opciones: readonly OpcionSelector<T>[];
  readonly ayuda?: string;
}

export function Selector<T extends string>({
  etiqueta,
  valor,
  alCambiar,
  opciones,
  ayuda,
}: PropsSelector<T>) {
  const id = useId();
  return (
    <Envoltorio id={id} etiqueta={etiqueta} ayuda={ayuda}>
      <select
        id={id}
        value={valor}
        aria-describedby={ayuda === undefined ? undefined : `${id}-ayuda`}
        onChange={(evento) => {
          alCambiar(evento.target.value as T);
        }}
        className={cn(CLASES_CONTROL)}
      >
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
      </select>
    </Envoltorio>
  );
}

export interface PropsInterruptor {
  readonly etiqueta: string;
  readonly activo: boolean;
  readonly alCambiar: (activo: boolean) => void;
  readonly ayuda?: string;
}

/**
 * Casilla de verificación con etiqueta. No es un `switch` de Radix a propósito:
 * un `input[type=checkbox]` nativo ya anuncia su estado, funciona con teclado
 * sin código y se puede consultar en los tests con `toBeChecked()`.
 */
export function Interruptor({ etiqueta, activo, alCambiar, ayuda }: PropsInterruptor) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={activo}
          aria-describedby={ayuda === undefined ? undefined : `${id}-ayuda`}
          onChange={(evento) => {
            alCambiar(evento.target.checked);
          }}
          className="size-4 shrink-0 accent-blue-600"
        />
        <label htmlFor={id} className="text-sm text-neutral-700 dark:text-neutral-200">
          {etiqueta}
        </label>
      </div>
      {ayuda === undefined ? null : (
        <p id={`${id}-ayuda`} className="pl-6 text-xs text-neutral-500 dark:text-neutral-400">
          {ayuda}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Color                                                                       */
/* -------------------------------------------------------------------------- */

export interface PropsCampoColor {
  readonly etiqueta: string;
  /** Color hexadecimal del contrato (`#rgb`, `#rrggbb` o `#rrggbbaa`). */
  readonly valor: string;
  readonly alCambiar: (valor: string) => void;
  /** Aviso de contraste asociado a este color, si lo hay. */
  readonly advertencia?: string;
}

/** Normaliza a `#rrggbb`, que es lo único que admite `input[type=color]`. */
function comoColorNativo(valor: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(valor)) return valor.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(valor)) {
    const cuerpo = valor.slice(1);
    return `#${cuerpo
      .split('')
      .map((caracter) => caracter + caracter)
      .join('')}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{8}$/.test(valor)) return valor.slice(0, 7).toLowerCase();
  return '#000000';
}

/**
 * Selector de color con dos entradas sincronizadas: la paleta del sistema y el
 * hexadecimal escrito a mano. La segunda existe porque el contrato admite alfa
 * (`#rrggbbaa`) y el control nativo no.
 */
export function CampoColor({ etiqueta, valor, alCambiar, advertencia }: PropsCampoColor) {
  const id = useId();
  const idTexto = `${id}-hex`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={idTexto} className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
        {etiqueta}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          aria-label={`${etiqueta}: selector de color`}
          value={comoColorNativo(valor)}
          onChange={(evento) => {
            alCambiar(evento.target.value);
          }}
          className="size-8 shrink-0 cursor-pointer rounded border border-neutral-300 bg-transparent p-0.5 dark:border-neutral-700"
        />
        <input
          id={idTexto}
          type="text"
          value={valor}
          spellCheck={false}
          aria-invalid={advertencia !== undefined}
          aria-describedby={advertencia === undefined ? undefined : `${id}-aviso`}
          onChange={(evento) => {
            alCambiar(evento.target.value);
          }}
          className={cn(CLASES_CONTROL, 'font-mono text-xs uppercase')}
        />
      </div>
      {advertencia === undefined ? null : (
        <p id={`${id}-aviso`} className="text-xs text-amber-700 dark:text-amber-400">
          {advertencia}
        </p>
      )}
    </div>
  );
}
