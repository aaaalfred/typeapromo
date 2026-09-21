'use client';

/**
 * Pestaña «Apariencia»: cómo se presenta la pregunta.
 *
 * Solo toca campos del documento, nunca estilos. Todo lo que se elige aquí lo
 * interpreta el renderer compartido, así que la previsualización y la
 * experiencia pública no pueden divergir: no hay ningún CSS del editor
 * involucrado.
 */

import {
  BUTTON_STYLES,
  CHOICE_PRESENTATIONS,
  RATING_APPEARANCES,
  RATING_SCALES,
  type ChoicePresentation,
  type RatingAppearance,
} from '@/lib/forms';

import type { PropsPanelBloque } from './contenido';

import { CampoNumero, CampoTexto, Interruptor, Selector } from '../ui/campos';
import { Seccion } from '../ui/piezas';

const NOMBRES_DE_PRESENTACION: Readonly<Record<ChoicePresentation, string>> = {
  list: 'Lista textual',
  buttons: 'Botones',
  image_cards: 'Tarjetas con imagen',
  grid: 'Cuadrícula visual',
};

const NOMBRES_DE_APARIENCIA: Readonly<Record<RatingAppearance, string>> = {
  stars: 'Estrellas',
  faces: 'Caras',
  hearts: 'Corazones',
};

/** Se reexporta para el panel de tema, que ofrece los mismos cuatro estilos. */
export const ESTILOS_DE_BOTON = BUTTON_STYLES;

export function PanelApariencia({ bloque, acciones }: PropsPanelBloque) {
  const alCambiar = acciones.reemplazarBloque;

  const tieneMarcador =
    bloque.type === 'short_text' || bloque.type === 'long_text' || bloque.type === 'email';
  const tieneExtremos = bloque.type === 'scale' || bloque.type === 'rating';

  return (
    <Seccion titulo="Apariencia">
      {tieneMarcador ? (
        <CampoTexto
          etiqueta="Texto de ejemplo"
          valor={bloque.placeholder ?? ''}
          maxLength={200}
          marcador="Se muestra en gris dentro del campo vacío"
          alCambiar={(texto) => {
            alCambiar({ ...bloque, placeholder: texto === '' ? undefined : texto });
          }}
        />
      ) : null}

      {bloque.type === 'long_text' ? (
        <CampoNumero
          etiqueta="Altura del campo (líneas)"
          valor={bloque.rows}
          min={2}
          max={20}
          alCambiar={(valor) => {
            alCambiar({ ...bloque, rows: valor ?? 4 });
          }}
        />
      ) : null}

      {bloque.type === 'single_choice' || bloque.type === 'multi_choice' ? (
        <>
          <Selector<ChoicePresentation>
            etiqueta="Presentación"
            valor={bloque.presentation}
            opciones={CHOICE_PRESENTATIONS.map((presentacion) => ({
              valor: presentacion,
              etiqueta: NOMBRES_DE_PRESENTACION[presentacion],
            }))}
            ayuda="Las tarjetas y la cuadrícula esperan que cada opción tenga imagen."
            alCambiar={(presentation) => {
              alCambiar({ ...bloque, presentation });
            }}
          />
          <Interruptor
            etiqueta="Mostrar las opciones en orden aleatorio"
            activo={bloque.randomizeChoices}
            alCambiar={(randomizeChoices) => {
              alCambiar({ ...bloque, randomizeChoices });
            }}
          />
        </>
      ) : null}

      {bloque.type === 'rating' ? (
        <>
          <Selector<RatingAppearance>
            etiqueta="Símbolo"
            valor={bloque.appearance}
            opciones={RATING_APPEARANCES.map((apariencia) => ({
              valor: apariencia,
              etiqueta: NOMBRES_DE_APARIENCIA[apariencia],
            }))}
            alCambiar={(appearance) => {
              alCambiar({ ...bloque, appearance });
            }}
          />
          <Selector<`${(typeof RATING_SCALES)[number]}`>
            etiqueta="Escala"
            valor={`${String(bloque.scale)}` as `${(typeof RATING_SCALES)[number]}`}
            opciones={RATING_SCALES.map((escala) => ({
              valor: `${String(escala)}` as `${(typeof RATING_SCALES)[number]}`,
              etiqueta: `${String(escala)} valores`,
            }))}
            ayuda="El valor entero elegido es lo que se guarda; la comparación entre escalas se normaliza al leer."
            alCambiar={(texto) => {
              const escala = Number(texto);
              const admitida = RATING_SCALES.find((candidata) => candidata === escala);
              if (admitida === undefined) return;
              alCambiar({ ...bloque, scale: admitida });
            }}
          />
        </>
      ) : null}

      {tieneExtremos ? (
        <>
          <CampoTexto
            etiqueta="Etiqueta del extremo inferior"
            valor={bloque.labels?.min ?? ''}
            maxLength={120}
            marcador="Nada"
            alCambiar={(texto) => {
              const labels = { ...bloque.labels, min: texto === '' ? undefined : texto };
              alCambiar({
                ...bloque,
                labels: labels.min === undefined && labels.max === undefined ? undefined : labels,
              });
            }}
          />
          <CampoTexto
            etiqueta="Etiqueta del extremo superior"
            valor={bloque.labels?.max ?? ''}
            maxLength={120}
            marcador="Mucho"
            alCambiar={(texto) => {
              const labels = { ...bloque.labels, max: texto === '' ? undefined : texto };
              alCambiar({
                ...bloque,
                labels: labels.min === undefined && labels.max === undefined ? undefined : labels,
              });
            }}
          />
        </>
      ) : null}

      {!tieneMarcador &&
      !tieneExtremos &&
      bloque.type !== 'single_choice' &&
      bloque.type !== 'multi_choice' ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Este bloque no tiene opciones de apariencia propias; se pinta con el tema del formulario.
        </p>
      ) : null}
    </Seccion>
  );
}
