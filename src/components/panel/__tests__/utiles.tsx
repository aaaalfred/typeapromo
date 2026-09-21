/**
 * Utilidades compartidas por los tests del panel.
 *
 * Las respuestas se construyen con `Response` de verdad, no con un objeto
 * simulado: así el cliente pasa por el mismo `json()` y el mismo `ok` que en el
 * navegador, y un 404 servido como HTML —el caso de `publish` mientras la fase 7
 * no aterrice— se comporta exactamente igual aquí que en producción.
 */

import type { PaginaFormularios, ResumenFormulario } from '../tipos';

export const FECHA_EDICION = '2026-08-14T09:30:00.000Z';

/** Resumen de formulario con valores razonables, ajustable por partes. */
export function crearResumen(parcial: Partial<ResumenFormulario> = {}): ResumenFormulario {
  const base: ResumenFormulario = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'encuesta-de-verano',
    title: 'Encuesta de verano',
    status: 'draft',
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: FECHA_EDICION,
    closedAt: null,
    archivedAt: null,
    activeVersionId: null,
    activeVersionNumber: null,
    publishedAt: null,
    draft: { revision: 3, updatedAt: FECHA_EDICION },
    responses: { sessions: 12, completed: 7 },
  };
  return { ...base, ...parcial };
}

export function crearPagina(items: readonly ResumenFormulario[]): PaginaFormularios {
  return { items, total: items.length, page: 1, perPage: 50, pageCount: 1 };
}

export function respuestaJson(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Implementación de `fetch` que devuelve siempre el mismo cuerpo.
 *
 * Se construye una `Response` **nueva** en cada llamada porque su cuerpo solo
 * puede leerse una vez: reutilizar la misma instancia haría fallar la segunda
 * petición del test con «body is unusable», que no se parece en nada al fallo
 * que se está probando.
 */
export function siempreJson(datos: unknown, estado = 200): () => Promise<Response> {
  return () => Promise.resolve(respuestaJson(datos, estado));
}

/** Error con el sobre del contrato: `{ error: { code, message } }`. */
export function respuestaError(estado: number, codigo: string, mensaje: string): Response {
  return respuestaJson({ error: { code: codigo, message: mensaje } }, estado);
}

/** Respuesta que no es JSON, como el 404 de Next para una ruta inexistente. */
export function respuestaHtml(estado: number): Response {
  return new Response('<!doctype html><title>404</title>', {
    status: estado,
    headers: { 'content-type': 'text/html' },
  });
}

/** URL de una llamada registrada por el doble de `fetch`. */
export function urlDeLlamada(argumentos: readonly unknown[]): string {
  return String(argumentos[0]);
}

/** Método HTTP de una llamada registrada por el doble de `fetch`. */
export function metodoDeLlamada(argumentos: readonly unknown[]): string {
  const init = argumentos[1];
  if (typeof init !== 'object' || init === null || !('method' in init)) return 'GET';
  return String((init as { readonly method?: unknown }).method ?? 'GET');
}
