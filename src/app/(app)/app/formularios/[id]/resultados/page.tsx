/**
 * `/app/formularios/:id/resultados` — resumen, distribuciones y respuestas.
 *
 * `(app)` es un *route group* y no aporta segmento de URL, así que esta página
 * se sirve dentro de `/app/**`, que es lo que protege `src/proxy.ts` y lo que
 * exige `requiereSesion()`.
 *
 * El cascarón es de servidor y hace dos cosas: comprobar la sesión y resolver el
 * formulario para poder devolver un 404 de verdad cuando el identificador no
 * existe —una URL la puede teclear cualquiera—. Los datos de resultados los pide
 * el componente de cliente contra `GET /api/forms/:id/results`, porque los
 * filtros se cambian sin recargar y un fallo de red debe verse **dentro** del
 * panel con un botón de reintentar, no en la pantalla de error de Next.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PanelResultados, rutaResultados } from '@/components/resultados';
import { requiereSesion } from '@/lib/auth/sesion';
import {
  formIdSchema,
  getForm,
  isFormsError,
  resolveActor,
  type FormDetail,
} from '@/server/forms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Resultados',
  description: 'Participación, distribuciones y respuestas individuales del formulario.',
};

interface PropsPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function PaginaResultados({ params }: PropsPagina) {
  const { id } = await params;
  await requiereSesion(rutaResultados(id));

  // El identificador llega de la URL: si no es un UUID no hay nada que buscar.
  const identificador = formIdSchema.safeParse(id);
  if (!identificador.success) notFound();

  const actor = await resolveActor();
  let formulario: FormDetail;
  try {
    formulario = await getForm(identificador.data, actor ?? undefined);
  } catch (error) {
    if (isFormsError(error) && error.code === 'NO_ENCONTRADO') notFound();
    throw error;
  }

  return <PanelResultados formularioId={formulario.id} tituloInicial={formulario.title} />;
}
