// @vitest-environment node

/**
 * Las dos reglas que más caro salen si se equivocan: qué se puede borrar y qué
 * se puede limpiar.
 */

import { describe, expect, it } from 'vitest';

import {
  DIAS_GRACIA_HUERFANOS,
  HORAS_STAGING_CADUCADO,
  esHuerfanoCaducado,
  esStagingCaducado,
  limiteHuerfanos,
  limiteRateLimits,
  limiteStagingCaducado,
  mensajeDeBloqueo,
  puedeBorrarse,
  resumirReferencias,
  type ActivoParaLimpieza,
} from '../decisiones';

const AHORA = new Date('2026-08-17T12:00:00.000Z');
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

function haceHoras(horas: number): Date {
  return new Date(AHORA.getTime() - horas * HORA);
}

function haceDias(dias: number): Date {
  return new Date(AHORA.getTime() - dias * DIA);
}

describe('borrado seguro según media_asset_refs', () => {
  it('sin referencias, borrable', () => {
    const resumen = resumirReferencias([]);
    expect(resumen).toEqual({ total: 0, borradores: 0, versiones: 0 });
    expect(puedeBorrarse(resumen)).toBe(true);
  });

  it('una referencia desde una versión publicada bloquea el borrado', () => {
    const resumen = resumirReferencias([{ scope: 'version' }]);
    expect(resumen).toEqual({ total: 1, borradores: 0, versiones: 1 });
    expect(puedeBorrarse(resumen)).toBe(false);
    expect(mensajeDeBloqueo(resumen)).toMatch(/versión publicada/);
    expect(mensajeDeBloqueo(resumen)).toMatch(/mientras esa versión exista/);
  });

  it('una referencia desde un borrador también bloquea, con otro mensaje', () => {
    const resumen = resumirReferencias([{ scope: 'draft' }]);
    expect(puedeBorrarse(resumen)).toBe(false);
    expect(mensajeDeBloqueo(resumen)).toMatch(/borrador/);
    expect(mensajeDeBloqueo(resumen)).toMatch(/Quítala del formulario/);
  });

  it('desglosa borradores y versiones cuando hay de las dos', () => {
    const resumen = resumirReferencias([
      { scope: 'draft' },
      { scope: 'version' },
      { scope: 'version' },
    ]);
    expect(resumen).toEqual({ total: 3, borradores: 1, versiones: 2 });
    expect(mensajeDeBloqueo(resumen)).toContain('2 versiones publicadas');
    expect(mensajeDeBloqueo(resumen)).toContain('1 borrador');
  });

  it('cuenta las referencias de varios formularios al mismo activo (duplicar comparte)', () => {
    // Duplicar un formulario crea otra fila con el mismo `asset_id`: el activo
    // pasa a estar en uso por dos formularios y `created_by` deja de decidir.
    const resumen = resumirReferencias([{ scope: 'draft' }, { scope: 'draft' }]);
    expect(resumen.total).toBe(2);
    expect(puedeBorrarse(resumen)).toBe(false);
  });
});

describe('selección de candidatos de limpieza', () => {
  const base: ActivoParaLimpieza = {
    status: 'uploading',
    createdAt: haceHoras(48),
    readyAt: null,
    referencias: 0,
  };

  it('los plazos son los de PR.md', () => {
    expect(HORAS_STAGING_CADUCADO).toBe(24);
    expect(DIAS_GRACIA_HUERFANOS).toBe(7);
    expect(limiteStagingCaducado(AHORA)).toEqual(haceHoras(24));
    expect(limiteHuerfanos(AHORA)).toEqual(haceDias(7));
    expect(limiteRateLimits(AHORA)).toEqual(haceHoras(24));
  });

  it('una carga incompleta de más de 24 h es candidata', () => {
    expect(esStagingCaducado(base, AHORA)).toBe(true);
  });

  it('una carga incompleta reciente no se toca', () => {
    expect(esStagingCaducado({ ...base, createdAt: haceHoras(23) }, AHORA)).toBe(false);
  });

  it('una carga fallida vieja se limpia igual que una incompleta', () => {
    expect(esStagingCaducado({ ...base, status: 'failed' }, AHORA)).toBe(true);
  });

  it('un activo publicado nunca entra en la purga de staging', () => {
    expect(
      esStagingCaducado(
        { ...base, status: 'ready', readyAt: haceDias(30) },
        AHORA,
      ),
    ).toBe(false);
  });

  it('un activo referenciado no se limpia jamás, por viejo que sea', () => {
    expect(esStagingCaducado({ ...base, referencias: 1 }, AHORA)).toBe(false);
    expect(
      esHuerfanoCaducado(
        { status: 'ready', createdAt: haceDias(90), readyAt: haceDias(90), referencias: 1 },
        AHORA,
      ),
    ).toBe(false);
  });

  it('un huérfano publicado se borra tras la gracia de siete días', () => {
    const huerfano: ActivoParaLimpieza = {
      status: 'ready',
      createdAt: haceDias(10),
      readyAt: haceDias(8),
      referencias: 0,
    };
    expect(esHuerfanoCaducado(huerfano, AHORA)).toBe(true);
  });

  it('dentro de la gracia, el huérfano sobrevive', () => {
    const recien: ActivoParaLimpieza = {
      status: 'ready',
      createdAt: haceDias(7),
      readyAt: haceDias(6),
      referencias: 0,
    };
    expect(esHuerfanoCaducado(recien, AHORA)).toBe(false);
  });

  it('la gracia se cuenta desde readyAt, no desde createdAt', () => {
    // Subido hace un mes pero publicado ayer: no es huérfano caducado.
    const publicadoTarde: ActivoParaLimpieza = {
      status: 'ready',
      createdAt: haceDias(30),
      readyAt: haceDias(1),
      referencias: 0,
    };
    expect(esHuerfanoCaducado(publicadoTarde, AHORA)).toBe(false);
  });

  it('sin readyAt se cae a createdAt en lugar de conservarlo para siempre', () => {
    const sinFecha: ActivoParaLimpieza = {
      status: 'ready',
      createdAt: haceDias(30),
      readyAt: null,
      referencias: 0,
    };
    expect(esHuerfanoCaducado(sinFecha, AHORA)).toBe(true);
  });

  it('las dos purgas son disjuntas: ningún activo cae en las dos', () => {
    const candidatos: ActivoParaLimpieza[] = [
      base,
      { ...base, status: 'failed' },
      { status: 'ready', createdAt: haceDias(30), readyAt: haceDias(30), referencias: 0 },
    ];
    for (const activo of candidatos) {
      expect(esStagingCaducado(activo, AHORA) && esHuerfanoCaducado(activo, AHORA)).toBe(
        false,
      );
    }
  });
});
