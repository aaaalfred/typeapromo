import { describe, expect, it } from 'vitest';
import { LIMITES_PLAN, inicioDeMesActual } from '../servicio';

describe('billing y cuotas de planes (unitario)', () => {
  it('el plan Free permite exactamente 1 formulario publicado y 100 respuestas al mes', () => {
    expect(LIMITES_PLAN.free.formulariosPublicadosMax).toBe(1);
    expect(LIMITES_PLAN.free.respuestasMesMax).toBe(100);
  });

  it('el plan Pro permite formularios ilimitados y cuota amplia de respuestas', () => {
    expect(LIMITES_PLAN.pro.formulariosPublicadosMax).toBe(Infinity);
    expect(LIMITES_PLAN.pro.respuestasMesMax).toBeGreaterThanOrEqual(10_000);
  });

  it('inicioDeMesActual calcula el primer instante del mes en UTC', () => {
    const fecha = new Date(Date.UTC(2026, 8, 21, 14, 30, 0)); // Septiembre 2026
    const inicio = inicioDeMesActual(fecha);

    expect(inicio.getUTCFullYear()).toBe(2026);
    expect(inicio.getUTCMonth()).toBe(8); // Septiembre (0-indexado)
    expect(inicio.getUTCDate()).toBe(1);
    expect(inicio.getUTCHours()).toBe(0);
    expect(inicio.getUTCMinutes()).toBe(0);
    expect(inicio.getUTCSeconds()).toBe(0);
    expect(inicio.getUTCMilliseconds()).toBe(0);
  });
});
