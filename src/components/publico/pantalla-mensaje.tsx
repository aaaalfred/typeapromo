import { atributosDeTema, estiloDeTema } from '@/lib/theme';
import type { ThemeDefinition } from '@/lib/forms';

/**
 * Pantalla de un formulario que existe pero no admite respuestas.
 *
 * PR.md lo pide explícitamente: cerrar un formulario «conserva resultados y
 * muestra un mensaje configurable». Un `404` seco sería mentira —el formulario
 * existe— y dejaría a quien llega desde un enlace antiguo sin saber si se ha
 * equivocado de dirección o si simplemente llega tarde.
 *
 * Se pinta con **el tema de la versión publicada** cuando lo hay, para que el
 * aviso no parezca de otro sitio. Ningún color está escrito aquí: todos salen de
 * las variables `--tp-*` que genera `@/lib/theme`.
 */
export interface PropsPantallaMensaje {
  readonly titulo: string;
  readonly mensaje: string;
  /** Tema del documento publicado. Sin él se usa la apariencia neutra. */
  readonly tema?: ThemeDefinition;
}

export function PantallaMensaje({ titulo, mensaje, tema }: PropsPantallaMensaje) {
  if (tema === undefined) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-medium">{titulo}</h1>
        <p className="max-w-prose text-base opacity-80">{mensaje}</p>
      </main>
    );
  }

  return (
    <main
      {...atributosDeTema(tema)}
      style={estiloDeTema(tema)}
      className="tp-raiz @container flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16"
    >
      <h1 className="font-medium" style={{ fontSize: 'var(--tp-tamano-titulo)' }}>
        {titulo}
      </h1>
      <p className="max-w-prose text-[color:var(--tp-texto-suave)]">{mensaje}</p>
    </main>
  );
}
