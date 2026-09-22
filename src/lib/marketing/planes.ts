/**
 * Catálogo comercial de planes de Typeapromo.
 *
 * Fuente de verdad para la landing pública y la página de «Próximamente».
 *
 * En la lógica de negocio y base de datos SOLO existen dos estados de facturación:
 * - no pagado (free): 1 publicado, 100 respuestas completadas/mes.
 * - pagado (pro + active/trialing): publicados ilimitados, 10.000 respuestas completadas/mes.
 *
 * Los planes «Pro» y «Equipo» forman parte del catálogo comercial proyectado
 * pero actualmente están en estado «proximamente».
 */

import { LIMITES_PLAN } from '@/server/billing/servicio';

export type PlanMarketingId = 'gratis' | 'pro' | 'business' | 'equipo';
export type PlanMarketingEstado = 'activo' | 'proximamente';

export interface PlanMarketing {
  readonly id: PlanMarketingId;
  readonly nombre: string;
  readonly precioLabel: string;
  readonly periodoLabel?: string;
  readonly cupo: string;
  readonly descripcion: string;
  readonly caracteristicas: readonly string[];
  readonly estado: PlanMarketingEstado;
  readonly href: string;
  readonly ctaLabel: string;
  readonly badge?: string;
  readonly destacado?: boolean;
}

/**
 * Obtiene la etiqueta del precio para el Plan Business configurada por entorno
 * (por ejemplo "$49 USD/mes"), o una etiqueta genérica si no se definió.
 */
export function obtenerPrecioBusiness(): string {
  const envLabel = process.env.NEXT_PUBLIC_BUSINESS_PRICE_LABEL?.trim();
  return envLabel && envLabel !== '' ? envLabel : 'Suscripción mensual';
}

/**
 * Devuelve la lista completa de planes del catálogo comercial.
 */
export function obtenerPlanesMarketing(): readonly PlanMarketing[] {
  const precioBusiness = obtenerPrecioBusiness();
  const esBusinessConCifra = precioBusiness.startsWith('$') || /\d/.test(precioBusiness);

  return [
    {
      id: 'gratis',
      nombre: 'Gratis',
      precioLabel: '$0',
      periodoLabel: '/mes',
      cupo: `${LIMITES_PLAN.free.formulariosPublicadosMax} publicado, ${LIMITES_PLAN.free.respuestasMesMax} completadas`,
      descripcion: 'Para probar y recoger primeras respuestas en proyectos personales o validar ideas.',
      caracteristicas: [
        `${LIMITES_PLAN.free.formulariosPublicadosMax} formulario publicado simultáneo`,
        `Hasta ${LIMITES_PLAN.free.respuestasMesMax} respuestas completadas al mes`,
        'Editor visual fluido con 11 tipos de bloques',
        'Lógica condicional hacia adelante',
        'Exportación CSV en tiempo real',
      ],
      estado: 'activo',
      href: '/crear-cuenta',
      ctaLabel: 'Empezar gratis',
    },
    {
      id: 'pro',
      nombre: 'Pro',
      precioLabel: '$19',
      periodoLabel: '/mes',
      cupo: '1.000 completadas, 3 asientos',
      descripcion: 'Para profesionales independientes y proyectos que necesitan mayor volumen y colaboración básica.',
      caracteristicas: [
        'Hasta 1.000 respuestas completadas al mes',
        '3 asientos para miembros de equipo',
        'Formularios publicados ilimitados',
        'Lógica y bifurcaciones avanzadas',
        'Personalización de colores y tipografías',
      ],
      estado: 'proximamente',
      href: '/proximamente?plan=pro',
      badge: 'Próximamente',
      ctaLabel: 'Próximamente',
    },
    {
      id: 'business',
      nombre: 'Business',
      precioLabel: precioBusiness,
      periodoLabel: esBusinessConCifra && !precioBusiness.includes('/') ? '/mes' : undefined,
      cupo: `${LIMITES_PLAN.pro.respuestasMesMax.toLocaleString('es-ES')} completadas, ilim. publicados`,
      descripcion: 'El plan de producción para empresas que exigen capacidad completa y marca propia.',
      caracteristicas: [
        'Formularios publicados ilimitados',
        `Hasta ${LIMITES_PLAN.pro.respuestasMesMax.toLocaleString('es-ES')} respuestas completadas al mes`,
        'Gestión autónoma con Stripe Customer Portal',
        'Avisos automáticos por correo al recibir respuestas',
        'Redirección al terminar hacia tu propia web',
        'Slug personalizado para cada formulario',
      ],
      estado: 'activo',
      href: '/crear-cuenta?plan=business',
      badge: 'Disponible ahora',
      destacado: true,
      ctaLabel: 'Elegir Business',
    },
    {
      id: 'equipo',
      nombre: 'Equipo',
      precioLabel: '$49',
      periodoLabel: '/mes',
      cupo: '10.000 completadas, 5 asientos, 3 webhooks',
      descripcion: 'Para organizaciones con múltiples creadores de formularios y automatización extendida.',
      caracteristicas: [
        'Hasta 10.000 respuestas completadas al mes',
        '5 asientos para miembros con roles',
        'Hasta 3 webhooks externos automáticos',
        'Soporte prioritario por correo',
        'Trazabilidad de respuestas y eventos',
      ],
      estado: 'proximamente',
      href: '/proximamente?plan=equipo',
      badge: 'Próximamente',
      ctaLabel: 'Próximamente',
    },
  ] as const;
}

/**
 * Busca un plan por su identificador.
 */
export function obtenerPlanMarketingPorId(id: string | null | undefined): PlanMarketing | undefined {
  if (!id) return undefined;
  const limpio = id.trim().toLowerCase();
  return obtenerPlanesMarketing().find((p) => p.id === limpio);
}
