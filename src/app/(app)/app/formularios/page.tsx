/**
 * `/app/formularios` — listado de formularios del equipo.
 *
 * La página es un cascarón deliberadamente fino: comprueba la sesión y monta el
 * listado, que se encarga de buscar, filtrar y actuar contra `/api/forms` desde
 * el navegador. Resolver los datos aquí impediría enseñar un fallo de red dentro
 * del panel, que es uno de los requisitos.
 *
 * La comprobación se repite aunque el layout ya la haga: es barata (la sesión ya
 * está resuelta en la misma petición) y deja la página protegida por sí misma,
 * sin depender de que nadie mueva el layout de sitio.
 */

import type { Metadata } from 'next';

import { ListadoFormularios, RUTA_FORMULARIOS } from '@/components/panel';
import { requiereSesion } from '@/lib/auth/sesion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Formularios',
  description: 'Listado de formularios del equipo: estado, respuestas y acciones.',
};

export default async function PaginaFormularios() {
  await requiereSesion(RUTA_FORMULARIOS);

  return <ListadoFormularios />;
}
