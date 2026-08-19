/**
 * `POST /api/internal/cleanup`
 *
 * PLAN.md · §1 y §2.2: no hay scheduler dentro del proceso, así que el cron del
 * host llama a este endpoint una vez al día con el secreto en una cabecera.
 *
 * ```bash
 * curl -fsS -X POST http://localhost:3000/api/internal/cleanup \
 *   -H "x-cleanup-secret: $CLEANUP_SECRET"
 * ```
 *
 * El secreto **solo** se lee de cabecera: ver `@/server/media/secreto`. Una
 * petición con `?secret=…` es tan anónima como una sin nada y recibe el mismo
 * `401`.
 *
 * Es idempotente: cada purga selecciona por estado y antigüedad, de modo que
 * volver a llamarla —porque el cron se solapó o porque falló la red y se
 * reintentó— no borra nada de más.
 */

import type { NextRequest } from 'next/server';

import {
  MediaError,
  ejecutarLimpieza,
  autorizarLimpieza,
  errorResponse,
  jsonResponse,
  route,
} from '@/server/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return route(async () => {
    const veredicto = autorizarLimpieza(request.headers);

    if (!veredicto.autorizado) {
      if (veredicto.motivo === 'no-configurado') {
        // Falla cerrado y lo dice: un 401 aquí haría pensar que el cron tiene
        // mal el secreto cuando el problema está en el despliegue.
        console.error('[api/internal/cleanup] CLEANUP_SECRET no está configurado');
        return errorResponse(
          new MediaError(
            'NO_CONFIGURADO',
            'La limpieza programada no está configurada en el servidor.',
          ),
        );
      }
      return errorResponse(
        new MediaError('NO_AUTENTICADO', 'Secreto de limpieza no válido.'),
      );
    }

    const resultado = await ejecutarLimpieza();
    return jsonResponse(resultado);
  });
}
