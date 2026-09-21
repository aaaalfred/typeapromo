/**
 * Contrato de entrada de los resultados: filtros de versión, estado y fechas.
 *
 * El detalle que más se nota en producción es la interpretación de las fechas
 * civiles: se colocan en **UTC**, `desde` al comienzo del día y `hasta` al
 * final, para que el rango no dependa de la zona horaria del contenedor. Un
 * `hasta=2026-08-17` que se quedara a medianoche dejaría fuera todas las
 * respuestas de ese día, que es el error clásico de este filtro.
 */

import { describe, expect, it } from 'vitest';

import {
  PAGINA_MAXIMA,
  PAGINA_POR_DEFECTO,
  filtrosDesdeQuery,
  limiteTemporal,
  resultsQueryFromSearchParams,
  resultsQuerySchema,
} from '../esquemas';

function analizar(entrada: Record<string, string>) {
  return resultsQuerySchema.safeParse(resultsQueryFromSearchParams(new URLSearchParams(entrada)));
}

describe('limiteTemporal', () => {
  it('coloca la fecha civil de inicio al principio del día UTC', () => {
    expect(limiteTemporal('2026-08-17', 'inicio')?.toISOString()).toBe('2026-08-17T00:00:00.000Z');
  });

  it('coloca la fecha civil de fin al final del día UTC, no a su medianoche', () => {
    expect(limiteTemporal('2026-08-17', 'fin')?.toISOString()).toBe('2026-08-17T23:59:59.999Z');
  });

  it('acepta un instante ISO completo para quien necesite precisión de zona', () => {
    expect(limiteTemporal('2026-08-17T10:30:00.000Z', 'inicio')?.toISOString()).toBe(
      '2026-08-17T10:30:00.000Z',
    );
  });

  it('rechaza lo que no es una fecha', () => {
    expect(limiteTemporal('ayer', 'inicio')).toBeNull();
    expect(limiteTemporal('2026-13-45', 'inicio')).toBeNull();
  });

  it('rechaza un día que no existe en lugar de desplazarlo al mes siguiente', () => {
    // `Date.UTC(2026, 1, 31)` daría el 3 de marzo sin protestar: un filtro que
    // se mueve solo es peor que uno que falla.
    expect(limiteTemporal('2026-02-31', 'inicio')).toBeNull();
    expect(limiteTemporal('2026-02-28', 'inicio')?.toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });
});

describe('resultsQuerySchema', () => {
  it('sin parámetros aplica los valores por defecto', () => {
    const analizado = analizar({});
    expect(analizado.success).toBe(true);
    expect(analizado.success && filtrosDesdeQuery(analizado.data)).toEqual({
      versionId: null,
      estado: 'todas',
      desde: null,
      hasta: null,
      page: 1,
      perPage: PAGINA_POR_DEFECTO,
    });
  });

  it('los parámetros vacíos no cuentan como enviados', () => {
    // Un `<select>` sin elegir manda la cadena vacía; eso no es un filtro.
    expect(resultsQueryFromSearchParams(new URLSearchParams({ versionId: '', estado: '  ' }))).toEqual(
      {},
    );
  });

  it('acepta versión, estado y rango completos', () => {
    const analizado = analizar({
      versionId: '11111111-1111-4111-8111-111111111111',
      estado: 'abandonadas',
      desde: '2026-08-01',
      hasta: '2026-08-31',
      page: '3',
      perPage: '50',
    });

    expect(analizado.success).toBe(true);
    if (!analizado.success) return;

    const filtros = filtrosDesdeQuery(analizado.data);
    expect(filtros.estado).toBe('abandonadas');
    expect(filtros.desde?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(filtros.hasta?.toISOString()).toBe('2026-08-31T23:59:59.999Z');
    expect(filtros.page).toBe(3);
  });

  it('rechaza un estado desconocido, un identificador que no es UUID y un rango invertido', () => {
    expect(analizar({ estado: 'inventado' }).success).toBe(false);
    expect(analizar({ versionId: 'no-es-uuid' }).success).toBe(false);
    expect(analizar({ desde: '2026-08-31', hasta: '2026-08-01' }).success).toBe(false);
  });

  it('la tabla es una vista, no una exportación: el tamaño de página tiene tope', () => {
    expect(analizar({ perPage: String(PAGINA_MAXIMA) }).success).toBe(true);
    expect(analizar({ perPage: String(PAGINA_MAXIMA + 1) }).success).toBe(false);
    expect(analizar({ page: '0' }).success).toBe(false);
    expect(analizar({ page: '1.5' }).success).toBe(false);
  });

  it('un parámetro que no existe se rechaza en lugar de ignorarse', () => {
    // `strict()`: un filtro mal escrito debe fallar, no aplicarse a medias.
    expect(resultsQuerySchema.safeParse({ estadoo: 'todas' }).success).toBe(false);
  });

  it('los mensajes de validación están en español', () => {
    const analizado = analizar({ estado: 'inventado' });
    expect(analizado.success).toBe(false);
    if (analizado.success) return;
    expect(analizado.error.issues[0]?.message).toBe('Estado de sesión desconocido');
  });
});
