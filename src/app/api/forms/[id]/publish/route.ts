/**
 * `POST /api/forms/:id/publish` — valida el borrador entero, crea el snapshot
 * inmutable y mueve `active_version_id` en la misma transacción.
 *
 * Contrato de error idéntico al del resto de `/api/forms`
 * (`{ error: { code, message, details? } }`, mensajes en español), que es lo que
 * el panel ya sabe leer. Cuando la validación falla, el código es
 * `DATOS_INVALIDOS` y `details` lleva **los problemas concretos**
 * (`{ errors, warnings }` con `code`, `message` y `path`), no un recuento: el
 * editor tiene que poder enlazar cada aviso con la regla o el bloque que lo
 * provoca.
 */

import type { NextRequest } from 'next/server';

import { formIdSchema, requireActor } from '@/server/forms';
import { publishForm, publishFormSchema } from '@/server/publish';

import { jsonResponse, parseWith, readJsonBody, route } from '../../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return route(async () => {
    const actor = await requireActor();
    const { id } = await context.params;
    const input = parseWith(publishFormSchema, await readJsonBody(request));

    const resultado = await publishForm(parseWith(formIdSchema, id), input, actor);

    return jsonResponse({
      form: resultado.form,
      version: resultado.version,
      warnings: resultado.warnings,
    });
  });
}
