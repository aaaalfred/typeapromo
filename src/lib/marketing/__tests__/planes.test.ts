import { describe, expect, it } from 'vitest';
import { LIMITES_PLAN } from '@/server/billing/servicio';
import {
  obtenerPlanesMarketing,
  obtenerPlanMarketingPorId,
  obtenerPrecioBusiness,
} from '../planes';

describe('catálogo comercial de planes (planes.ts)', () => {
  it('contiene exactamente los 4 planes definidos en el catálogo', () => {
    const planes = obtenerPlanesMarketing();
    expect(planes).toHaveLength(4);
    expect(planes.map((p) => p.id)).toEqual(['gratis', 'pro', 'business', 'equipo']);
  });

  it('el plan Gratis está activo con los límites de LIMITES_PLAN.free', () => {
    const gratis = obtenerPlanMarketingPorId('gratis');
    expect(gratis).toBeDefined();
    expect(gratis?.nombre).toBe('Gratis');
    expect(gratis?.precioLabel).toBe('$0');
    expect(gratis?.estado).toBe('activo');
    expect(gratis?.href).toBe('/crear-cuenta');
    expect(gratis?.cupo).toContain(`${LIMITES_PLAN.free.formulariosPublicadosMax} publicado`);
    expect(gratis?.cupo).toContain(`${LIMITES_PLAN.free.respuestasMesMax} completadas`);
  });

  it('el plan Pro está en estado próximamente y redirige a /proximamente?plan=pro', () => {
    const pro = obtenerPlanMarketingPorId('pro');
    expect(pro).toBeDefined();
    expect(pro?.nombre).toBe('Pro');
    expect(pro?.precioLabel).toBe('$19');
    expect(pro?.estado).toBe('proximamente');
    expect(pro?.badge).toBe('Próximamente');
    expect(pro?.href).toBe('/proximamente?plan=pro');
  });

  it('el plan Business está activo con badge Disponible ahora y cupos de LIMITES_PLAN.pro', () => {
    const business = obtenerPlanMarketingPorId('business');
    expect(business).toBeDefined();
    expect(business?.nombre).toBe('Business');
    expect(business?.estado).toBe('activo');
    expect(business?.badge).toBe('Disponible ahora');
    expect(business?.destacado).toBe(true);
    expect(business?.href).toBe('/crear-cuenta?plan=business');
    expect(business?.cupo).toContain('10.000 completadas');
    expect(business?.cupo).toContain('ilim. publicados');
  });

  it('el plan Equipo está en estado próximamente y redirige a /proximamente?plan=equipo', () => {
    const equipo = obtenerPlanMarketingPorId('equipo');
    expect(equipo).toBeDefined();
    expect(equipo?.nombre).toBe('Equipo');
    expect(equipo?.precioLabel).toBe('$49');
    expect(equipo?.estado).toBe('proximamente');
    expect(equipo?.badge).toBe('Próximamente');
    expect(equipo?.href).toBe('/proximamente?plan=equipo');
    expect(equipo?.cupo).toContain('5 asientos');
  });

  it('obtenerPrecioBusiness usa la variable NEXT_PUBLIC_BUSINESS_PRICE_LABEL si existe o fallback', () => {
    const original = process.env.NEXT_PUBLIC_BUSINESS_PRICE_LABEL;

    delete process.env.NEXT_PUBLIC_BUSINESS_PRICE_LABEL;
    expect(obtenerPrecioBusiness()).toBe('Suscripción mensual');

    process.env.NEXT_PUBLIC_BUSINESS_PRICE_LABEL = '$49 USD/mes';
    expect(obtenerPrecioBusiness()).toBe('$49 USD/mes');

    if (original !== undefined) {
      process.env.NEXT_PUBLIC_BUSINESS_PRICE_LABEL = original;
    } else {
      delete process.env.NEXT_PUBLIC_BUSINESS_PRICE_LABEL;
    }
  });

  it('obtenerPlanMarketingPorId es insensible a mayúsculas y espacios y maneja planes desconocidos', () => {
    expect(obtenerPlanMarketingPorId('BUSINESS')?.id).toBe('business');
    expect(obtenerPlanMarketingPorId('  pro  ')?.id).toBe('pro');
    expect(obtenerPlanMarketingPorId('desconocido')).toBeUndefined();
    expect(obtenerPlanMarketingPorId('')).toBeUndefined();
    expect(obtenerPlanMarketingPorId(null)).toBeUndefined();
  });
});
