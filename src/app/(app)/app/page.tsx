/**
 * `/app` — raíz del panel.
 *
 * `RUTA_PANEL` es el destino por defecto tras iniciar sesión y lo que devuelve
 * `normalizarDestino()` cuando descarta un destino sospechoso, así que tiene que
 * llevar a alguna parte. Hoy el panel solo tiene una sección; cuando haya más,
 * este será el sitio donde decidir cuál es la de entrada.
 */

import { redirect } from 'next/navigation';

import { RUTA_FORMULARIOS } from '@/components/panel';

export const runtime = 'nodejs';

export default function PaginaPanel(): never {
  redirect(RUTA_FORMULARIOS);
}
