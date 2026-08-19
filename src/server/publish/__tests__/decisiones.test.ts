/**
 * Decisiones de la publicación. Módulo puro: no hace falta PostgreSQL.
 */

import { describe, expect, it } from 'vitest';

import { validateForPublication } from '@/lib/forms';
import {
  ending,
  makeRawForm,
  rule,
  shortText,
  toBlock,
} from '@/lib/forms/__tests__/fixtures';

import {
  PRIMERA_VERSION,
  decidirPublicacion,
  detallesDeValidacion,
  mensajeDeValidacion,
  siguienteNumeroDeVersion,
} from '../decisiones';

describe('siguienteNumeroDeVersion', () => {
  it('la primera publicación es la versión 1', () => {
    expect(siguienteNumeroDeVersion(null)).toBe(PRIMERA_VERSION);
  });

  it('incrementa el máximo existente', () => {
    expect(siguienteNumeroDeVersion(1)).toBe(2);
    expect(siguienteNumeroDeVersion(41)).toBe(42);
  });

  it('un máximo corrupto no produce un número por debajo del primero', () => {
    expect(siguienteNumeroDeVersion(0)).toBe(PRIMERA_VERSION);
    expect(siguienteNumeroDeVersion(-5)).toBe(PRIMERA_VERSION);
  });
});

describe('decidirPublicacion', () => {
  it('publicar un borrador lo deja publicado', () => {
    expect(decidirPublicacion('draft')).toEqual({ ok: true, estado: 'published' });
  });

  it('republicar un formulario publicado sigue siendo válido', () => {
    expect(decidirPublicacion('published')).toEqual({ ok: true, estado: 'published' });
  });

  it('republicar uno cerrado lo reabre', () => {
    expect(decidirPublicacion('closed')).toEqual({ ok: true, estado: 'published' });
  });

  it('un formulario archivado no se publica, y lo explica en español', () => {
    const decision = decidirPublicacion('archived');
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.message).toContain('archivado');
      expect(decision.message).toContain('Desarchívalo');
    }
  });
});

describe('detallesDeValidacion', () => {
  /** Salto hacia atrás: uno de los cuatro casos que el plan exige detectar. */
  const informe = validateForPublication(
    makeRawForm({
      blocks: [shortText('uno'), shortText('dos')],
      rules: [rule('r1', 'dos', 'is_not_empty', null, toBlock('uno'))],
      endScreens: [ending('fin')],
    }),
  );

  it('el documento del caso de prueba no es publicable', () => {
    expect(informe.ok).toBe(false);
    expect(informe.errors.length).toBeGreaterThan(0);
  });

  it('conserva los problemas concretos, no un recuento', () => {
    const detalles = detallesDeValidacion(informe);

    expect(detalles.errors.length).toBe(informe.errors.length);
    for (const problema of detalles.errors) {
      expect(problema.code).not.toBe('');
      expect(problema.message).not.toBe('');
      expect(typeof problema.path).toBe('string');
    }
    expect(detalles.errors.some((problema) => problema.code === 'RULE_TARGET_BACKWARD')).toBe(
      true,
    );
  });

  it('serializa la ruta dentro del documento con puntos', () => {
    const conRuta = detallesDeValidacion(informe).errors.find(
      (problema) => problema.path !== '',
    );
    expect(conRuta?.path).toMatch(/^[A-Za-z0-9.]+$/);
  });

  it('las advertencias viajan aunque no bloqueen', () => {
    const detalles = detallesDeValidacion(informe);
    expect(Array.isArray(detalles.warnings)).toBe(true);
  });
});

describe('mensajeDeValidacion', () => {
  it('concuerda en singular con un solo problema', () => {
    const informe = validateForPublication(
      makeRawForm({ blocks: [], endScreens: [ending('fin')] }),
    );
    expect(informe.errors).toHaveLength(1);
    expect(mensajeDeValidacion(informe)).toBe(
      'El formulario tiene un problema que impide publicarlo.',
    );
  });

  it('cuenta los problemas cuando hay varios', () => {
    const informe = validateForPublication(
      makeRawForm({
        blocks: [shortText('uno'), shortText('uno')],
        rules: [rule('r1', 'fantasma', 'is_not_empty', null, toBlock('uno'))],
        endScreens: [ending('fin')],
      }),
    );
    expect(informe.errors.length).toBeGreaterThan(1);
    expect(mensajeDeValidacion(informe)).toBe(
      `El formulario tiene ${String(informe.errors.length)} problemas que impiden publicarlo.`,
    );
  });
});
