/**
 * `GET /api/forms/:id/results` — resumen, métricas y tabla de respuestas.
 *
 * Filtros de consulta (`versionId`, `estado`, `desde`, `hasta`, `page`,
 * `perPage`) aplicados **igual al resumen y a la tabla**: lo que se cuenta
 * arriba es exactamente lo que se lista abajo.
 *
 * Las sesiones abandonadas se derivan en la propia consulta (PLAN.md · §2.9);
 * no hay columna, ni evento, ni job que las materialice.
 */

import type { NextRequest } from 'next/server';

import { formIdSchema, requireActor } from '@/server/forms';
import {
  filtrosDesdeQuery,
  obtenerResultados,
  resultsQueryFromSearchParams,
  resultsQuerySchema,
} from '@/server/results';

import { jsonResponse, parseWith, route } from '../../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return route(async () => {
    const actor = await requireActor();
    const { id } = await context.params;

    const query = parseWith(
      resultsQuerySchema,
      resultsQueryFromSearchParams(request.nextUrl.searchParams),
    );

    const resultados = await obtenerResultados(
      parseWith(formIdSchema, id),
      filtrosDesdeQuery(query),
      actor.workspaceId,
    );

    return jsonResponse(resultados);
  });
}
