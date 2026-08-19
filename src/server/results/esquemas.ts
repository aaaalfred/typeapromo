/**
 * Contratos Zod de **entrada** de los resultados.
 *
 * Solo describe los parámetros de consulta; el documento del formulario se lee
 * del snapshot de `form_versions` y no viaja nunca por aquí.
 *
 * Todos los mensajes están en español porque salen tal cual dentro de
 * `details` cuando la validación falla.
 */

import { z } from 'zod';

import { ESTADOS_RESULTADO, type FiltrosResultados } from './tipos';

/** Tamaño de página por defecto de la tabla de respuestas individuales. */
export const PAGINA_POR_DEFECTO = 25;
/** Tope duro: la tabla es una vista, no una exportación. Para eso está el CSV. */
export const PAGINA_MAXIMA = 100;

/**
 * Fecha civil `YYYY-MM-DD` o instante ISO completo.
 *
 * Las fechas civiles se interpretan en **UTC** —`desde` al comienzo del día y
 * `hasta` al final— para que el rango no dependa de la zona horaria del
 * proceso, que en contenedor no es la de quien mira el panel. Quien necesite
 * precisión de zona puede mandar un instante ISO completo.
 */
const FECHA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;

function instanteValido(valor: string): Date | null {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Convierte el texto a instante, colocando las fechas civiles en el borde pedido. */
export function limiteTemporal(valor: string, borde: 'inicio' | 'fin'): Date | null {
  if (FECHA_CIVIL.test(valor)) {
    const [anio, mes, dia] = valor.split('-').map(Number);
    if (anio === undefined || mes === undefined || dia === undefined) return null;
    const marca =
      borde === 'inicio'
        ? Date.UTC(anio, mes - 1, dia, 0, 0, 0, 0)
        : Date.UTC(anio, mes - 1, dia, 23, 59, 59, 999);
    const fecha = new Date(marca);
    if (Number.isNaN(fecha.getTime())) return null;

    // `Date.UTC` no rechaza un día fuera de mes: convierte el 31 de febrero en
    // el 3 de marzo. Un filtro que se desplaza solo es peor que uno que falla,
    // así que se comprueba que la fecha construida sea la que se pidió.
    const coincide =
      fecha.getUTCFullYear() === anio &&
      fecha.getUTCMonth() === mes - 1 &&
      fecha.getUTCDate() === dia;
    return coincide ? fecha : null;
  }
  return instanteValido(valor);
}

function esquemaFecha(borde: 'inicio' | 'fin') {
  return z
    .string()
    .trim()
    .min(1)
    .transform((valor, ctx) => {
      const fecha = limiteTemporal(valor, borde);
      if (fecha === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Se espera una fecha YYYY-MM-DD o un instante ISO válido',
        });
        return z.NEVER;
      }
      return fecha;
    });
}

export const estadoResultadoSchema = z.enum(ESTADOS_RESULTADO, {
  message: 'Estado de sesión desconocido',
});

export const resultsQuerySchema = z
  .object({
    versionId: z.uuid({ message: 'Identificador de versión inválido' }).optional(),
    estado: estadoResultadoSchema.default('todas'),
    desde: esquemaFecha('inicio').optional(),
    hasta: esquemaFecha('fin').optional(),
    page: z.coerce
      .number({ message: 'La página debe ser un número' })
      .int({ message: 'La página debe ser un número entero' })
      .min(1, { message: 'La página empieza en 1' })
      .default(1),
    perPage: z.coerce
      .number({ message: 'El tamaño de página debe ser un número' })
      .int({ message: 'El tamaño de página debe ser un número entero' })
      .min(1, { message: 'El tamaño de página mínimo es 1' })
      .max(PAGINA_MAXIMA, {
        message: `El tamaño de página máximo es ${String(PAGINA_MAXIMA)}`,
      })
      .default(PAGINA_POR_DEFECTO),
  })
  .strict()
  .refine(
    (valor) => valor.desde === undefined || valor.hasta === undefined || valor.desde <= valor.hasta,
    { message: 'El inicio del rango es posterior a su fin' },
  );

export type ResultsQuery = z.infer<typeof resultsQuerySchema>;

/** Normaliza la consulta validada al objeto de filtros que usa el servicio. */
export function filtrosDesdeQuery(query: ResultsQuery): FiltrosResultados {
  return {
    versionId: query.versionId ?? null,
    estado: query.estado,
    desde: query.desde ?? null,
    hasta: query.hasta ?? null,
    page: query.page,
    perPage: query.perPage,
  };
}

/**
 * Traduce los parámetros de una URL al objeto que valida `resultsQuerySchema`.
 * Se omiten las claves ausentes o vacías para dejar actuar a los valores por
 * defecto de zod.
 */
export function resultsQueryFromSearchParams(params: URLSearchParams): unknown {
  const bruto: Record<string, string> = {};
  for (const clave of ['versionId', 'estado', 'desde', 'hasta', 'page', 'perPage']) {
    const valor = params.get(clave);
    if (valor !== null && valor.trim() !== '') {
      bruto[clave] = valor;
    }
  }
  return bruto;
}
