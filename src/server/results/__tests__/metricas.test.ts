/**
 * Métricas de resultados sin base de datos.
 *
 * Todo lo que se comprueba aquí es puro: se importa `../metricas` y
 * `../catalogo` directamente y **nunca** el barril `@/server/results`, que
 * arrastra `@/db` y abre el pool de PostgreSQL en carga. Por eso este fichero
 * corre igual sin `DATABASE_URL`.
 *
 * Cubre las tres piezas que definen la fase 8 del lado del cálculo:
 *
 * 1. el **abandono derivado** (sin `completed_at` y con más de 30 minutos sin
 *    actividad), que no es una columna ni un evento;
 * 2. las **distribuciones y promedios por tipo**;
 * 3. el **rating normalizado** `(valor - 1) / (escala - 1)`, que es lo único
 *    comparable cuando el alcance mezcla dos escalas distintas.
 */

import { describe, expect, it } from 'vitest';

import type { FormDefinition } from '@/lib/forms';
import {
  longText,
  makeForm,
  multiChoice,
  rating,
  scale,
  singleChoice,
} from '@/lib/forms/__tests__/fixtures';
import { MINUTOS_PARA_ABANDONO } from '@/server/responses/abandono';

import { construirCatalogo, type VersionEnAlcance } from '../catalogo';
import {
  AcumuladorMetricas,
  clasificarSesion,
  construirResumen,
  desglosarAbandono,
  resumirSesiones,
  type RespuestaCruda,
} from '../metricas';

const AHORA = new Date('2026-08-17T12:00:00.000Z');

/** Instante de hace `minutos` minutos respecto a `AHORA`. */
function haceMinutos(minutos: number): Date {
  return new Date(AHORA.getTime() - minutos * 60_000);
}

function version(id: string, versionNumber: number, definition: FormDefinition): VersionEnAlcance {
  return { id, versionNumber, definition };
}

/* -------------------------------------------------------------------------- */
/* Abandono derivado                                                           */
/* -------------------------------------------------------------------------- */

describe('abandono derivado', () => {
  it('el umbral es el del predicado compartido, no una copia local', () => {
    expect(MINUTOS_PARA_ABANDONO).toBe(30);
  });

  it('clasifica completada, abandonada y en curso', () => {
    expect(
      clasificarSesion({ completedAt: haceMinutos(90), lastActivityAt: haceMinutos(90) }, AHORA),
    ).toBe('completada');

    expect(clasificarSesion({ completedAt: null, lastActivityAt: haceMinutos(31) }, AHORA)).toBe(
      'abandonada',
    );

    expect(clasificarSesion({ completedAt: null, lastActivityAt: haceMinutos(5) }, AHORA)).toBe(
      'en_curso',
    );
  });

  it('una sesión completada hace horas no es abandonada por mucho que calle', () => {
    // El predicado mira `completed_at` primero: terminar es terminar.
    expect(
      clasificarSesion({ completedAt: haceMinutos(600), lastActivityAt: haceMinutos(600) }, AHORA),
    ).toBe('completada');
  });

  it('el borde de los 30 minutos todavía cuenta como en curso', () => {
    // El predicado es estrictamente `<`: a los 30 minutos exactos aún no lo es.
    expect(clasificarSesion({ completedAt: null, lastActivityAt: haceMinutos(30) }, AHORA)).toBe(
      'en_curso',
    );
    expect(
      clasificarSesion(
        { completedAt: null, lastActivityAt: new Date(haceMinutos(30).getTime() - 1) },
        AHORA,
      ),
    ).toBe('abandonada');
  });

  it('una sesión abandonada deja de serlo si vuelve la actividad', () => {
    const sesion = { completedAt: null, lastActivityAt: haceMinutos(120) };
    expect(clasificarSesion(sesion, AHORA)).toBe('abandonada');

    // Alguien retoma la pestaña: la misma sesión sale del conjunto. Es lo que no
    // podría deshacer un estado materializado.
    expect(clasificarSesion({ ...sesion, lastActivityAt: AHORA }, AHORA)).toBe('en_curso');
  });

  it('resume iniciadas, completadas, abandonadas y tasa de finalización', () => {
    const resumen = resumirSesiones(
      [
        { completedAt: haceMinutos(10), lastActivityAt: haceMinutos(10) },
        { completedAt: haceMinutos(20), lastActivityAt: haceMinutos(20) },
        { completedAt: null, lastActivityAt: haceMinutos(45) },
        { completedAt: null, lastActivityAt: haceMinutos(2) },
      ],
      AHORA,
    );

    expect(resumen).toEqual({
      iniciadas: 4,
      completadas: 2,
      abandonadas: 1,
      enCurso: 1,
      tasaFinalizacion: 0.5,
    });
  });

  it('sin sesiones la tasa es 0 y no un NaN', () => {
    expect(resumirSesiones([], AHORA)).toEqual({
      iniciadas: 0,
      completadas: 0,
      abandonadas: 0,
      enCurso: 0,
      tasaFinalizacion: 0,
    });
    expect(construirResumen(0, 0, 0).tasaFinalizacion).toBe(0);
  });

  it('desglosa el abandono por pantalla, con los títulos de la versión', () => {
    const definicion = makeForm({
      blocks: [singleChoice('perfil', ['a', 'b']), longText('motivo')],
    });
    const catalogo = construirCatalogo([version('v1', 1, definicion)]);

    const filas = desglosarAbandono(
      [
        { questionId: 'motivo', abandonos: 3 },
        { questionId: 'perfil', abandonos: 1 },
        { questionId: null, abandonos: 1 },
      ],
      catalogo,
    );

    expect(filas.map((fila) => [fila.titulo, fila.abandonos, fila.porcentaje])).toEqual([
      ['Texto largo motivo', 3, 0.6],
      ['Selección única perfil', 1, 0.2],
      ['Sin pantalla registrada', 1, 0.2],
    ]);
  });

  it('sin abandonos el desglose está vacío y no divide por cero', () => {
    const catalogo = construirCatalogo([
      version('v1', 1, makeForm({ blocks: [singleChoice('perfil', ['a'])] })),
    ]);
    expect(desglosarAbandono([], catalogo)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Distribuciones y promedios                                                  */
/* -------------------------------------------------------------------------- */

/** Acumula respuestas contra un catálogo y devuelve las métricas por pregunta. */
function medir(
  versiones: readonly VersionEnAlcance[],
  respuestas: readonly RespuestaCruda[],
) {
  const acumulador = new AcumuladorMetricas(construirCatalogo(versiones));
  for (const respuesta of respuestas) acumulador.agregar(respuesta);
  const metricas = acumulador.resultado();
  return new Map(metricas.map((metrica) => [metrica.questionId, metrica]));
}

describe('distribuciones y promedios por tipo', () => {
  const definicion = makeForm({
    blocks: [
      singleChoice('perfil', ['cliente', 'proveedor', 'otro']),
      multiChoice('canales', ['email', 'slack', 'telefono']),
      scale('esfuerzo', { min: 1, max: 5 }),
      rating('satisfaccion', { scale: 5 }),
      longText('comentario'),
    ],
  });
  const versiones = [version('v1', 1, definicion)];

  it('la selección única cuenta cada opción y conserva las que nadie eligió', () => {
    const metricas = medir(versiones, [
      { versionId: 'v1', questionId: 'perfil', valueJson: 'cliente' },
      { versionId: 'v1', questionId: 'perfil', valueJson: 'cliente' },
      { versionId: 'v1', questionId: 'perfil', valueJson: 'proveedor' },
    ]);

    const perfil = metricas.get('perfil');
    expect(perfil?.respondidas).toBe(3);
    // `otro` sigue en la lista con un cero: no elegirla también es un dato.
    expect(perfil?.distribucion).toEqual([
      { valor: 'cliente', etiqueta: 'cliente', recuento: 2 },
      { valor: 'proveedor', etiqueta: 'proveedor', recuento: 1 },
      { valor: 'otro', etiqueta: 'otro', recuento: 0 },
    ]);
    expect(perfil?.promedio).toBeNull();
  });

  it('la selección múltiple suma una vez por opción marcada', () => {
    const metricas = medir(versiones, [
      { versionId: 'v1', questionId: 'canales', valueJson: ['email', 'slack'] },
      { versionId: 'v1', questionId: 'canales', valueJson: ['slack'] },
    ]);

    const canales = metricas.get('canales');
    // Dos respuestas, tres marcas.
    expect(canales?.respondidas).toBe(2);
    expect(canales?.distribucion).toEqual([
      { valor: 'email', etiqueta: 'email', recuento: 1 },
      { valor: 'slack', etiqueta: 'slack', recuento: 2 },
      { valor: 'telefono', etiqueta: 'telefono', recuento: 0 },
    ]);
  });

  it('la escala distribuye toda la rejilla declarada y promedia en sus unidades', () => {
    const metricas = medir(versiones, [
      { versionId: 'v1', questionId: 'esfuerzo', valueJson: 2 },
      { versionId: 'v1', questionId: 'esfuerzo', valueJson: 4 },
      { versionId: 'v1', questionId: 'esfuerzo', valueJson: 3 },
    ]);

    const esfuerzo = metricas.get('esfuerzo');
    expect(esfuerzo?.distribucion?.map((valor) => valor.recuento)).toEqual([0, 1, 1, 1, 0]);
    expect(esfuerzo?.promedio).toBe(3);
    // El normalizado es cosa de la valoración, no de la escala.
    expect(esfuerzo?.promedioNormalizado).toBeNull();
  });

  it('la valoración promedia y normaliza a la vez', () => {
    const metricas = medir(versiones, [
      { versionId: 'v1', questionId: 'satisfaccion', valueJson: 5 },
      { versionId: 'v1', questionId: 'satisfaccion', valueJson: 3 },
    ]);

    const satisfaccion = metricas.get('satisfaccion');
    expect(satisfaccion?.promedio).toBe(4);
    // (5-1)/4 = 1 y (3-1)/4 = 0,5 ⇒ 0,75.
    expect(satisfaccion?.promedioNormalizado).toBe(0.75);
    expect(satisfaccion?.escalas).toEqual([5]);
    expect(satisfaccion?.distribucion?.map((valor) => valor.recuento)).toEqual([0, 0, 1, 0, 1]);
  });

  it('el texto libre no se agrega: se lee completo en la tabla y en el CSV', () => {
    const metricas = medir(versiones, [
      { versionId: 'v1', questionId: 'comentario', valueJson: 'Todo bien, gracias' },
    ]);

    const comentario = metricas.get('comentario');
    expect(comentario?.respondidas).toBe(1);
    expect(comentario?.distribucion).toBeNull();
    expect(comentario?.promedio).toBeNull();
  });

  it('separa respondidas, en blanco y descartadas', () => {
    const metricas = medir(versiones, [
      { versionId: 'v1', questionId: 'perfil', valueJson: 'cliente' },
      { versionId: 'v1', questionId: 'perfil', valueJson: null },
      { versionId: 'v1', questionId: 'perfil', valueJson: '   ' },
      // Una versión que no está en el alcance: no se puede interpretar.
      { versionId: 'v9', questionId: 'perfil', valueJson: 'cliente' },
      // Una pregunta que ninguna versión del alcance define: se ignora entera.
      { versionId: 'v1', questionId: 'fantasma', valueJson: 'x' },
    ]);

    const perfil = metricas.get('perfil');
    expect(perfil?.respondidas).toBe(1);
    expect(perfil?.enBlanco).toBe(2);
    expect(perfil?.descartadas).toBe(1);
    expect(metricas.has('fantasma')).toBe(false);
  });

  it('un valor que no encaja con el tipo no rompe el recuento', () => {
    const metricas = medir(versiones, [
      { versionId: 'v1', questionId: 'satisfaccion', valueJson: 'cinco' },
    ]);

    const satisfaccion = metricas.get('satisfaccion');
    expect(satisfaccion?.respondidas).toBe(1);
    expect(satisfaccion?.promedio).toBeNull();
  });

  it('una opción que ya no existe en la versión reciente aparece al final', () => {
    const v1 = version('v1', 1, makeForm({ blocks: [singleChoice('perfil', ['a', 'b'])] }));
    const v2 = version('v2', 2, makeForm({ blocks: [singleChoice('perfil', ['a'])] }));

    const metricas = medir([v1, v2], [
      { versionId: 'v1', questionId: 'perfil', valueJson: 'b' },
      { versionId: 'v2', questionId: 'perfil', valueJson: 'a' },
    ]);

    expect(metricas.get('perfil')?.distribucion).toEqual([
      { valor: 'a', etiqueta: 'a', recuento: 1 },
      { valor: 'b', etiqueta: 'b', recuento: 1 },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Rating normalizado entre escalas distintas                                  */
/* -------------------------------------------------------------------------- */

describe('valoración con dos escalas en el alcance', () => {
  const v1 = version('v1', 1, makeForm({ blocks: [rating('satisfaccion', { scale: 3 })] }));
  const v2 = version('v2', 2, makeForm({ blocks: [rating('satisfaccion', { scale: 5 })] }));

  it('normaliza cada respuesta con la escala de su propia versión', () => {
    // 2 sobre 3 y 3 sobre 5 son la misma cosa: la mitad. Ninguna media en
    // unidades originales lo diría.
    const metricas = medir([v1, v2], [
      { versionId: 'v1', questionId: 'satisfaccion', valueJson: 2 },
      { versionId: 'v2', questionId: 'satisfaccion', valueJson: 3 },
    ]);

    const satisfaccion = metricas.get('satisfaccion');
    expect(satisfaccion?.promedioNormalizado).toBe(0.5);
    expect(satisfaccion?.escalas).toEqual([3, 5]);
  });

  it('con escalas mezcladas el promedio en unidades originales es null', () => {
    const metricas = medir([v1, v2], [
      { versionId: 'v1', questionId: 'satisfaccion', valueJson: 3 },
      { versionId: 'v2', questionId: 'satisfaccion', valueJson: 5 },
    ]);

    const satisfaccion = metricas.get('satisfaccion');
    // Los dos son el máximo de su escala: normalizado 1, promedio sin sentido.
    expect(satisfaccion?.promedioNormalizado).toBe(1);
    expect(satisfaccion?.promedio).toBeNull();
  });

  it('la rejilla de la distribución llega hasta la escala mayor observada', () => {
    const metricas = medir([v1, v2], [
      { versionId: 'v1', questionId: 'satisfaccion', valueJson: 3 },
      { versionId: 'v2', questionId: 'satisfaccion', valueJson: 5 },
    ]);

    expect(metricas.get('satisfaccion')?.distribucion?.map((valor) => valor.valor)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
  });

  it('con una sola escala el promedio en unidades originales vuelve', () => {
    const metricas = medir([v2], [
      { versionId: 'v2', questionId: 'satisfaccion', valueJson: 4 },
      { versionId: 'v2', questionId: 'satisfaccion', valueJson: 2 },
    ]);

    expect(metricas.get('satisfaccion')?.promedio).toBe(3);
    expect(metricas.get('satisfaccion')?.promedioNormalizado).toBe(0.5);
  });
});
