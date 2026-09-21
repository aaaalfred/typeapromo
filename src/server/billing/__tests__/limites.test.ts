import { describe, expect, it } from 'vitest';
import {
  LIMITES_PLAN,
  esWorkspacePagado,
  evaluarLimitePublicacion,
  evaluarLimiteRespuestas,
  inicioDeMesActual,
} from '../servicio';

describe('billing y cuotas de planes (unitario)', () => {
  it('el plan Free permite exactamente 1 formulario publicado y 100 respuestas completadas al mes', () => {
    expect(LIMITES_PLAN.free.formulariosPublicadosMax).toBe(1);
    expect(LIMITES_PLAN.free.respuestasMesMax).toBe(100);
  });

  it('el plan Pro (Business) permite formularios ilimitados y exactamente 10.000 respuestas completadas al mes', () => {
    expect(LIMITES_PLAN.pro.formulariosPublicadosMax).toBe(Infinity);
    expect(LIMITES_PLAN.pro.respuestasMesMax).toBe(10_000);
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

  describe('esWorkspacePagado', () => {
    it('reconoce como pagado solo plan pro con status active o trialing', () => {
      expect(esWorkspacePagado('pro', 'active')).toBe(true);
      expect(esWorkspacePagado('pro', 'trialing')).toBe(true);
    });

    it('trata pro con past_due o canceled como no pagado', () => {
      expect(esWorkspacePagado('pro', 'past_due')).toBe(false);
      expect(esWorkspacePagado('pro', 'canceled')).toBe(false);
    });

    it('trata plan free como no pagado siempre', () => {
      expect(esWorkspacePagado('free', 'active')).toBe(false);
      expect(esWorkspacePagado('free', 'trialing')).toBe(false);
      expect(esWorkspacePagado('free', 'past_due')).toBe(false);
      expect(esWorkspacePagado('free', 'canceled')).toBe(false);
    });
  });

  describe('evaluarLimitePublicacion', () => {
    it('permite publicar si el workspace tiene menos formularios de su máximo', () => {
      const res = evaluarLimitePublicacion({
        formulariosPublicados: 0,
        formulariosPublicadosMax: 1,
      });
      expect(res.permitido).toBe(true);
    });

    it('bloquea publicación en plan free si ya tiene 1 publicado', () => {
      const res = evaluarLimitePublicacion({
        formulariosPublicados: 1,
        formulariosPublicadosMax: 1,
      });
      expect(res.permitido).toBe(false);
      expect(res.motivo).toContain('El plan Free permite 1 formulario publicado');
    });

    it('permite publicación ilimitada en plan pro activo (máximo Infinity)', () => {
      const res = evaluarLimitePublicacion({
        formulariosPublicados: 50,
        formulariosPublicadosMax: Infinity,
      });
      expect(res.permitido).toBe(true);
    });
  });

  describe('evaluarLimiteRespuestas', () => {
    it('permite responder si está por debajo del cupo en plan free', () => {
      const res = evaluarLimiteRespuestas({
        respuestasMes: 99,
        respuestasMesMax: 100,
      });
      expect(res.permitido).toBe(true);
    });

    it('bloquea respuestas si alcanza 100 en plan no pagado', () => {
      const res = evaluarLimiteRespuestas({
        respuestasMes: 100,
        respuestasMesMax: 100,
      });
      expect(res.permitido).toBe(false);
      expect(res.motivo).toBe('Este formulario no admite más respuestas este mes.');
    });

    it('permite responder en pro si está por debajo de 10.000', () => {
      const res = evaluarLimiteRespuestas({
        respuestasMes: 9_999,
        respuestasMesMax: 10_000,
      });
      expect(res.permitido).toBe(true);
    });

    it('NO hace early return para pro: bloquea al alcanzar 10.000 respuestas en pro', () => {
      const res = evaluarLimiteRespuestas({
        respuestasMes: 10_000,
        respuestasMesMax: 10_000,
      });
      expect(res.permitido).toBe(false);
      expect(res.motivo).toBe('Este formulario no admite más respuestas este mes.');
    });
  });
});
