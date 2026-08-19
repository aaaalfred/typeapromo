/**
 * `/f/:slug` — experiencia pública de respuesta.
 *
 * Tres decisiones que sostienen la página:
 *
 * 1. **Siempre la versión activa, nunca el borrador.** `cargarFormularioPublico`
 *    ni siquiera importa `form_drafts`. Y si el navegador trae una sesión en
 *    curso, se sirve **la versión de esa sesión**, aunque entretanto se haya
 *    publicado otra: publicar de nuevo no puede cambiarle el recorrido a quien
 *    está a mitad.
 * 2. **Cerrado o archivado no es un 404.** El formulario existe y se muestra su
 *    mensaje configurable con el tema de la versión publicada. El 404 se
 *    reserva para un slug que no corresponde a ningún formulario.
 * 3. **Las imágenes se resuelven en el servidor.** El navegador recibe URL
 *    públicas ya listas y nunca pide activos por identificador.
 *
 * Dinámica por definición: la respuesta depende de la cookie de sesión, así que
 * no hay nada que prerenderizar ni que cachear.
 */

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { ExperienciaPublica, PantallaMensaje } from '@/components/publico';
import {
  cargarFormularioPublico,
  cargarSesion,
  nombreCookieSesion,
  resolverMediosDeDocumento,
  slugPublicoSchema,
} from '@/server/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

/** Slug con forma inválida: no puede existir, así que es un 404 sin consultar. */
function slugValido(slug: string): string | null {
  const parsed = slugPublicoSchema.safeParse(slug);
  return parsed.success ? parsed.data : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const limpio = slugValido(slug);
  if (limpio === null) return { title: 'Formulario' };

  const formulario = await cargarFormularioPublico(limpio);
  if (formulario === null) return { title: 'Formulario' };

  const definicion = formulario.version?.definition;

  return {
    // Sin plantilla del layout raíz: la página pública no es «… · Typeapromo».
    title: { absolute: definicion?.meta.title ?? formulario.title },
    ...(definicion?.meta.description === undefined
      ? {}
      : { description: definicion.meta.description }),
    // Un formulario en curso no tiene por qué acabar en un buscador.
    robots: { index: false, follow: false },
  };
}

export default async function PaginaFormularioPublico({ params }: Props) {
  const { slug } = await params;
  const limpio = slugValido(slug);
  if (limpio === null) notFound();

  const formulario = await cargarFormularioPublico(limpio);
  if (formulario === null) notFound();

  if (formulario.estado !== 'disponible' || formulario.version === null) {
    return (
      <PantallaMensaje
        titulo={formulario.title}
        mensaje={formulario.mensaje ?? 'Este formulario no está disponible.'}
        {...(formulario.version === null ? {} : { tema: formulario.version.definition.theme })}
      />
    );
  }

  // La reanudación se resuelve aquí, en el servidor: la cookie es `HttpOnly` y
  // el cliente no puede leerla ni para saber si existe.
  const almacen = await cookies();
  const token = almacen.get(nombreCookieSesion(formulario.formId))?.value;
  const sesion = await cargarSesion(formulario.formId, token);

  const definicion = sesion?.definicion ?? formulario.version.definition;
  const medios = await resolverMediosDeDocumento(definicion);

  return (
    <ExperienciaPublica
      formId={formulario.formId}
      slug={formulario.slug}
      definicion={definicion}
      medios={medios}
      sesionInicial={
        sesion === null
          ? null
          : {
              respuestas: sesion.respuestas,
              pantalla: sesion.pantalla,
              completada: sesion.completada,
            }
      }
    />
  );
}
