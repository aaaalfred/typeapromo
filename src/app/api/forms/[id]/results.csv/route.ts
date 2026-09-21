/**
 * `GET /api/forms/:id/results.csv` — exportación de resultados **en streaming**.
 *
 * El nombre del directorio lleva el punto a propósito: un *route group* no es, y
 * el App Router lo trata como un segmento literal, así que la URL termina en
 * `results.csv` y el navegador ya propone un nombre coherente aunque alguien
 * ignore `Content-Disposition`.
 *
 * Tres cosas que definen esta ruta:
 *
 * 1. **Una versión por exportación.** «Una columna por pregunta» solo significa
 *    algo dentro de un snapshot; sin `versionId` se exporta la activa y, a falta
 *    de activa, la última publicada. Lo resuelve `prepararCsv`.
 * 2. **Nada se monta en memoria.** El cuerpo es un `ReadableStream` alimentado
 *    por el recorrido paginado por clave: en ningún momento hay más de un lote
 *    de sesiones vivo, tenga el formulario cien respuestas o cien mil.
 * 3. **Los errores se deciden antes del primer byte.** Sesión, formulario y
 *    versión se comprueban mientras todavía se puede responder con el sobre
 *    `{ error: { code, message } }`; a partir de ahí solo cabe abortar el flujo.
 *
 * Los filtros de estado y de fechas son los mismos que los del panel, así que lo
 * que se descarga coincide exactamente con lo que se está mirando.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { formIdSchema, requireActor } from '@/server/forms';
import {
  cabecerasCsv,
  filtrosDesdeQuery,
  flujoCsv,
  prepararCsv,
  resultsQueryFromSearchParams,
  resultsQuerySchema,
} from '@/server/results';

import { parseWith, route } from '../../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return route(async () => {
    await requireActor();
    const { id } = await context.params;

    const query = parseWith(
      resultsQuerySchema,
      resultsQueryFromSearchParams(request.nextUrl.searchParams),
    );

    const exportacion = await prepararCsv(
      parseWith(formIdSchema, id),
      filtrosDesdeQuery(query),
    );

    return new NextResponse(flujoCsv(exportacion.trozos), {
      headers: cabecerasCsv(exportacion.nombreArchivo),
    });
  });
}
