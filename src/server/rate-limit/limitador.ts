/**
 * Contador de ventana fija sobre `rate_limits` (PLAN.md · §2.6).
 *
 * El incremento es una sola sentencia atómica sobre la clave primaria
 * `(key_hash, window_start)`:
 *
 * ```sql
 * INSERT INTO rate_limits (key_hash, window_start, count, updated_at)
 * VALUES ($1, $2, 1, now())
 * ON CONFLICT (key_hash, window_start)
 * DO UPDATE SET count = rate_limits.count + 1, updated_at = now()
 * RETURNING count;
 * ```
 *
 * Sin lectura previa y sin bloqueo explícito: dos peticiones simultáneas de la
 * misma clave no pueden contar una sola vez.
 *
 * Las filas no se borran aquí. `POST /api/internal/cleanup` purga las ventanas
 * caducadas (`@/server/media/limpieza`), que es lo que mantiene la tabla
 * pequeña y efímera.
 */

import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { rateLimits } from '@/db/schema';

import { claveDeLimite, clienteDePeticion, inicioDeVentana, type AmbitoLimite } from './clave';
import { salDeProceso } from './sal';

/** Política de un ámbito: cuántas peticiones y en cuánto tiempo. */
export interface PoliticaLimite {
  /** Peticiones admitidas dentro de una ventana. */
  readonly maximo: number;
  /** Tamaño de la ventana en milisegundos. */
  readonly ventanaMs: number;
}

const UN_MINUTO = 60_000;
const UNA_HORA = 60 * UN_MINUTO;

export const POLITICAS: Readonly<Record<AmbitoLimite, PoliticaLimite>> = {
  sesiones: { maximo: 20, ventanaMs: 10 * UN_MINUTO },
  respuestas: { maximo: 120, ventanaMs: UN_MINUTO },
  completar: { maximo: 30, ventanaMs: 10 * UN_MINUTO },
  registro: { maximo: 5, ventanaMs: UNA_HORA },
  login: { maximo: 5, ventanaMs: 15 * UN_MINUTO },
  recuperar: { maximo: 3, ventanaMs: UNA_HORA },
  'reenviar-verificacion': { maximo: 3, ventanaMs: UNA_HORA },
};

export interface ResultadoLimite {
  readonly permitido: boolean;
  /** Peticiones contabilizadas en la ventana, esta incluida. */
  readonly contador: number;
  /** Peticiones que aún caben en la ventana. Nunca negativo. */
  readonly restantes: number;
  /** Momento en que la ventana se reinicia. */
  readonly reiniciaEn: Date;
  /** Segundos que faltan para el reinicio, para la cabecera `Retry-After`. */
  readonly reintentarEnSegundos: number;
}

export interface OpcionesConsumo {
  readonly ambito: AmbitoLimite;
  /** Identificador del cliente ya extraído. Se hashea, nunca se guarda. */
  readonly cliente: string;
  readonly politica?: PoliticaLimite;
  readonly ahora?: Date;
}

/**
 * Contabiliza una petición y dice si se admite.
 *
 * **Falla abierta**: si la base de datos no responde, la petición se deja pasar
 * y se registra el fallo. Un limitador caído no puede convertirse en una caída
 * de la experiencia pública; el riesgo de abuso durante ese hueco es menor que
 * el de dejar el formulario inaccesible.
 */
export async function consumirLimite(
  opciones: OpcionesConsumo,
): Promise<ResultadoLimite> {
  const politica = opciones.politica ?? POLITICAS[opciones.ambito];
  const ahora = opciones.ahora ?? new Date();
  const windowStart = inicioDeVentana(ahora, politica.ventanaMs);
  const reiniciaEn = new Date(windowStart.getTime() + politica.ventanaMs);
  const reintentarEnSegundos = Math.max(
    1,
    Math.ceil((reiniciaEn.getTime() - ahora.getTime()) / 1000),
  );

  const keyHash = claveDeLimite(opciones.ambito, opciones.cliente, salDeProceso());

  let contador: number;
  try {
    const [fila] = await db
      .insert(rateLimits)
      .values({ keyHash, windowStart, count: 1, updatedAt: ahora })
      .onConflictDoUpdate({
        target: [rateLimits.keyHash, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1`, updatedAt: ahora },
      })
      .returning({ count: rateLimits.count });

    contador = fila?.count ?? 1;
  } catch (error) {
    console.error('[rate-limit] no se ha podido contabilizar la petición', error);
    return {
      permitido: true,
      contador: 0,
      restantes: politica.maximo,
      reiniciaEn,
      reintentarEnSegundos,
    };
  }

  return {
    permitido: contador <= politica.maximo,
    contador,
    restantes: Math.max(0, politica.maximo - contador),
    reiniciaEn,
    reintentarEnSegundos,
  };
}

/** Atajo para las rutas: extrae el cliente de la petición y consume una unidad. */
export async function consumirLimiteDePeticion(
  ambito: AmbitoLimite,
  cabeceras: Headers,
  politica?: PoliticaLimite,
): Promise<ResultadoLimite> {
  return consumirLimite({
    ambito,
    cliente: clienteDePeticion(cabeceras),
    ...(politica === undefined ? {} : { politica }),
  });
}
