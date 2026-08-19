/**
 * Página del editor de formularios.
 *
 * Componente de servidor: exige sesión, lee el borrador **con su revisión** y
 * entrega las dos cosas juntas al editor, que es de cliente. Leer el borrador
 * aquí y no con un `fetch` desde el navegador evita el parpadeo inicial y, más
 * importante, garantiza que documento y revisión salgan de la misma lectura:
 * si vinieran de dos peticiones distintas, el editor podría arrancar creyendo
 * tener una revisión que ya no es la suya.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EditorConMedia } from '@/components/editor/media';
import { requiereSesion } from '@/lib/auth/sesion';
import { formIdSchema, getForm, isFormsError, type FormDetail } from '@/server/forms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PropsPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export const metadata: Metadata = {
  title: 'Editor',
};

export default async function PaginaEditor({ params }: PropsPagina) {
  const { id } = await params;
  await requiereSesion(`/app/formularios/${id}/editar`);

  // El identificador llega de la URL: si no es un UUID no hay nada que buscar.
  const identificador = formIdSchema.safeParse(id);
  if (!identificador.success) notFound();

  let formulario: FormDetail;
  try {
    formulario = await getForm(identificador.data);
  } catch (error) {
    // Un identificador inexistente o mal formado es un 404, no un error del
    // servidor: la ruta la puede teclear cualquiera.
    if (isFormsError(error) && error.code === 'NO_ENCONTRADO') notFound();
    throw error;
  }

  return (
    <EditorConMedia
      formularioId={formulario.id}
      definicionInicial={formulario.definition}
      revisionInicial={formulario.draft?.revision ?? 1}
      urlPublica={formulario.activeVersionId === null ? null : `/f/${formulario.slug}`}
    />
  );
}
