// @vitest-environment node

/**
 * Resultados, métricas y CSV contra PostgreSQL de verdad.
 *
 * **Se salta solo cuando no hay `DATABASE_URL`**, para que CI siga en verde sin
 * base de datos. Con la base levantada:
 *
 * ```bash
 * DATABASE_URL=postgresql://typeapromo:typeapromo@localhost:5432/typeapromo \
 *   npx vitest run src/server/results
 * ```
 *
 * Cubre lo que solo puede comprobarse contra el motor:
 *
 * 1. El **abandono derivado en SQL** coincide con el predicado en memoria, y no
 *    hay ninguna fila ni ningún evento que lo materialice (PLAN.md · §2.9).
 * 2. Las **distribuciones y los promedios** cuadran con las respuestas
 *    guardadas.
 * 3. **Publicar una segunda versión no cambia ni un resultado de la primera**,
 *    ni en el panel ni en el CSV. Es el compromiso central del versionado.
 * 4. El **CSV escapa de verdad** comas, comillas, saltos de línea y acentos, y
 *    se emite por lotes con paginación por clave.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '@/server/forms/actor';

// `../tipos` es un módulo puro y esta importación es de solo tipos: se borra al
// compilar y no arrastra `@/db`, así que el fichero sigue pudiendo saltarse
// entero sin `DATABASE_URL`.
import type { FiltrosResultados } from '../tipos';

import { analizarCsv, TEXTO_DIFICIL } from './utiles';

const hasDatabase =
  typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
const describeDb = hasDatabase ? describe : describe.skip;

type ServicioModule = typeof import('../servicio');
type ConsultasModule = typeof import('../consultas');
type SesionesModule = typeof import('@/server/responses/sesiones');
type PublicoModule = typeof import('@/server/responses/publico');
type PublishModule = typeof import('@/server/publish/publicar');
type FormsServiceModule = typeof import('@/server/forms/service');
type DbModule = typeof import('@/db');
type SchemaModule = typeof import('@/db/schema');
type DrizzleModule = typeof import('drizzle-orm');
type FixturesModule = typeof import('@/lib/forms/__tests__/fixtures');

describeDb('resultados · integración', () => {
  let servicio: ServicioModule;
  let consultas: ConsultasModule;
  let sesiones: SesionesModule;
  let publico: PublicoModule;
  let publish: PublishModule;
  let service: FormsServiceModule;
  let dbModule: DbModule;
  let schema: SchemaModule;
  let drizzle: DrizzleModule;
  let fixtures: FixturesModule;

  const actor: Actor = { id: null, email: 'fase8@typeapromo.local', name: 'Fase 8' };
  const sufijo = `res${Date.now().toString(36)}`;
  const creados: string[] = [];

  /** Filtros por defecto, como los que arma la ruta sin parámetros. */
  function filtros(parcial: Partial<FiltrosResultados> = {}): FiltrosResultados {
    return {
      versionId: null,
      estado: 'todas',
      desde: null,
      hasta: null,
      page: 1,
      perPage: 25,
      ...parcial,
    };
  }

  beforeAll(async () => {
    [servicio, consultas, sesiones, publico, publish, service, dbModule, schema, drizzle, fixtures] =
      await Promise.all([
        import('../servicio'),
        import('../consultas'),
        import('@/server/responses/sesiones'),
        import('@/server/responses/publico'),
        import('@/server/publish/publicar'),
        import('@/server/forms/service'),
        import('@/db'),
        import('@/db/schema'),
        import('drizzle-orm'),
        import('@/lib/forms/__tests__/fixtures'),
      ]);
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    if (creados.length > 0) {
      await dbModule.db.delete(schema.forms).where(drizzle.inArray(schema.forms.id, creados));
    }
    await dbModule.pool.end();
  });

  /* ------------------------------------------------------------------------ */
  /* Escenario                                                                 */
  /* ------------------------------------------------------------------------ */

  /** Versión 1: selección, texto libre y valoración sobre 5. */
  function documentoV1() {
    return fixtures.makeForm({
      title: 'Encuesta v1',
      blocks: [
        fixtures.singleChoice('perfil', ['cliente', 'proveedor']),
        fixtures.longText('comentario'),
        fixtures.rating('satisfaccion', { scale: 5 }),
      ],
      endScreens: [fixtures.ending('gracias')],
    });
  }

  /**
   * Versión 2: **otros títulos, otras etiquetas y otra escala**. Si los
   * resultados de la v1 se leyeran contra este documento, cambiarían todos.
   */
  function documentoV2() {
    const base = fixtures.makeForm({
      title: 'Encuesta v2',
      blocks: [
        fixtures.singleChoice('perfil', ['cliente', 'proveedor']),
        fixtures.longText('comentario'),
        fixtures.rating('satisfaccion', { scale: 10 }),
      ],
      endScreens: [fixtures.ending('gracias')],
    });

    return {
      ...base,
      blocks: base.blocks.map((bloque) =>
        bloque.id === 'perfil'
          ? {
              ...bloque,
              title: 'TÍTULO REESCRITO EN LA V2',
              choices:
                'choices' in bloque
                  ? bloque.choices.map((opcion) => ({
                      ...opcion,
                      label: `ETIQUETA V2 ${opcion.value}`,
                    }))
                  : [],
            }
          : bloque,
      ),
    } as typeof base;
  }

  interface Escenario {
    readonly formId: string;
    readonly slug: string;
    readonly versionId: string;
    readonly versionNumber: number;
    readonly sesionCompletada: string;
    readonly sesionAbandonada: string;
    readonly sesionEnCurso: string;
  }

  /**
   * Formulario publicado con tres sesiones: una completada, una abandonada
   * —retrasando su última actividad dos horas, que es la única forma honesta de
   * fabricar un abandono derivado— y una en curso.
   */
  async function crearEscenario(nombre: string): Promise<Escenario> {
    const form = await service.createForm(
      { title: `${nombre} ${sufijo}`, definition: documentoV1() },
      actor,
    );
    creados.push(form.id);
    const publicada = await publish.publishForm(form.id, {}, actor);

    const disponible = await publico.exigirFormularioDisponible(form.slug);

    // Completada: responde a todo y cierra.
    const a = await sesiones.crearSesion(disponible);
    await sesiones.guardarRespuesta({
      formId: form.id,
      token: a.token,
      questionId: 'perfil',
      valor: 'cliente',
    });
    await sesiones.guardarRespuesta({
      formId: form.id,
      token: a.token,
      questionId: 'comentario',
      valor: TEXTO_DIFICIL,
    });
    await sesiones.guardarRespuesta({
      formId: form.id,
      token: a.token,
      questionId: 'satisfaccion',
      valor: 5,
    });
    await sesiones.completarSesion(form.id, a.token);

    // Abandonada: se queda en la segunda pantalla y calla dos horas.
    const b = await sesiones.crearSesion(disponible);
    await sesiones.guardarRespuesta({
      formId: form.id,
      token: b.token,
      questionId: 'perfil',
      valor: 'proveedor',
    });
    await dbModule.db
      .update(schema.responseSessions)
      .set({ lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(drizzle.eq(schema.responseSessions.id, b.sesion.sessionId));

    // En curso: acaba de responder.
    const c = await sesiones.crearSesion(disponible);
    await sesiones.guardarRespuesta({
      formId: form.id,
      token: c.token,
      questionId: 'perfil',
      valor: 'cliente',
    });

    return {
      formId: form.id,
      slug: form.slug,
      versionId: publicada.version.id,
      versionNumber: publicada.version.versionNumber,
      sesionCompletada: a.sesion.sessionId,
      sesionAbandonada: b.sesion.sessionId,
      sesionEnCurso: c.sesion.sessionId,
    };
  }

  /** Publica una segunda versión del formulario ya creado. */
  async function publicarV2(formId: string) {
    const detalle = await service.getForm(formId);
    await service.saveDraft(
      formId,
      { revision: detalle.draft?.revision ?? 1, definition: documentoV2() },
      actor,
    );
    return publish.publishForm(formId, {}, actor);
  }

  /** Consume la exportación entera en memoria. Solo el test puede permitírselo. */
  async function leerCsv(formId: string, parcial: Partial<FiltrosResultados> = {}) {
    const exportacion = await servicio.prepararCsv(formId, filtros(parcial));
    let texto = '';
    let trozos = 0;
    for await (const trozo of exportacion.trozos) {
      texto += trozo;
      trozos += 1;
    }
    return { ...exportacion, texto, trozos };
  }

  /* ------------------------------------------------------------------------ */
  /* Resumen y abandono derivado                                               */
  /* ------------------------------------------------------------------------ */

  it('deriva el abandono en la consulta, sin columna ni evento que lo materialice', async () => {
    const escenario = await crearEscenario('Resumen');
    const resultados = await servicio.obtenerResultados(escenario.formId, filtros());

    expect(resultados.resumen).toEqual({
      iniciadas: 3,
      completadas: 1,
      abandonadas: 1,
      enCurso: 1,
      tasaFinalizacion: 1 / 3,
    });

    // Ninguna sesión está marcada como abandonada en la base de datos…
    const estados = await dbModule.db
      .select({ status: schema.responseSessions.status })
      .from(schema.responseSessions)
      .where(drizzle.eq(schema.responseSessions.formId, escenario.formId));
    expect(estados.map((fila) => String(fila.status))).not.toContain('abandoned');

    // …ni existe un evento de abandono: el dato es una consulta, no un estado.
    const eventos = await dbModule.db
      .select({ type: schema.formEvents.type })
      .from(schema.formEvents)
      .where(drizzle.eq(schema.formEvents.formId, escenario.formId));
    expect(eventos.map((fila) => String(fila.type))).not.toContain('abandoned');
  });

  it('el abandono por pregunta señala la pantalla en la que se quedó la sesión', async () => {
    const escenario = await crearEscenario('Abandono');
    const resultados = await servicio.obtenerResultados(escenario.formId, filtros());

    expect(resultados.abandonoPorPregunta).toHaveLength(1);
    expect(resultados.abandonoPorPregunta[0]).toMatchObject({
      questionId: 'comentario',
      titulo: 'Texto largo comentario',
      abandonos: 1,
      porcentaje: 1,
    });
  });

  it('una sesión abandonada vuelve a estar en curso si retoma la actividad', async () => {
    const escenario = await crearEscenario('Regreso');

    await dbModule.db
      .update(schema.responseSessions)
      .set({ lastActivityAt: new Date() })
      .where(drizzle.eq(schema.responseSessions.id, escenario.sesionAbandonada));

    const resultados = await servicio.obtenerResultados(escenario.formId, filtros());
    expect(resultados.resumen.abandonadas).toBe(0);
    expect(resultados.resumen.enCurso).toBe(2);
  });

  /* ------------------------------------------------------------------------ */
  /* Distribuciones, promedios y tabla                                         */
  /* ------------------------------------------------------------------------ */

  it('distribuye y promedia lo que hay guardado', async () => {
    const escenario = await crearEscenario('Métricas');
    const resultados = await servicio.obtenerResultados(escenario.formId, filtros());

    const porId = new Map(resultados.preguntas.map((pregunta) => [pregunta.questionId, pregunta]));

    expect(porId.get('perfil')?.distribucion).toEqual([
      { valor: 'cliente', etiqueta: 'cliente', recuento: 2 },
      { valor: 'proveedor', etiqueta: 'proveedor', recuento: 1 },
    ]);

    const satisfaccion = porId.get('satisfaccion');
    expect(satisfaccion?.respondidas).toBe(1);
    expect(satisfaccion?.promedio).toBe(5);
    // (5 - 1) / (5 - 1) = 1: el máximo de la escala.
    expect(satisfaccion?.promedioNormalizado).toBe(1);
    expect(satisfaccion?.escalas).toEqual([5]);

    // El texto libre no se agrega: se lee completo en la tabla.
    expect(porId.get('comentario')?.distribucion).toBeNull();
  });

  it('la tabla trae las respuestas completas, con su estado y su versión', async () => {
    const escenario = await crearEscenario('Tabla');
    const resultados = await servicio.obtenerResultados(escenario.formId, filtros());

    expect(resultados.tabla.total).toBe(3);
    expect(resultados.tabla.pageCount).toBe(1);

    const completada = resultados.tabla.items.find(
      (fila) => fila.sessionId === escenario.sesionCompletada,
    );
    expect(completada?.estado).toBe('completada');
    expect(completada?.versionNumber).toBe(escenario.versionNumber);
    expect(completada?.respondidas).toBe(3);
    // Sin recortar y sin interpretar: PR.md excluye cualquier análisis del texto.
    expect(completada?.respuestas.comentario).toBe(TEXTO_DIFICIL);

    const abandonada = resultados.tabla.items.find(
      (fila) => fila.sessionId === escenario.sesionAbandonada,
    );
    expect(abandonada?.estado).toBe('abandonada');
  });

  it('el filtro de estado se aplica igual al resumen y a la tabla', async () => {
    const escenario = await crearEscenario('Filtro estado');

    const completadas = await servicio.obtenerResultados(
      escenario.formId,
      filtros({ estado: 'completadas' }),
    );
    expect(completadas.resumen.iniciadas).toBe(1);
    expect(completadas.tabla.total).toBe(1);
    expect(completadas.tabla.items[0]?.sessionId).toBe(escenario.sesionCompletada);

    const abandonadas = await servicio.obtenerResultados(
      escenario.formId,
      filtros({ estado: 'abandonadas' }),
    );
    expect(abandonadas.resumen.iniciadas).toBe(1);
    expect(abandonadas.tabla.items[0]?.sessionId).toBe(escenario.sesionAbandonada);

    const enCurso = await servicio.obtenerResultados(
      escenario.formId,
      filtros({ estado: 'en_curso' }),
    );
    expect(enCurso.tabla.items[0]?.sessionId).toBe(escenario.sesionEnCurso);
  });

  it('el rango de fechas recorta sobre el inicio de la sesión', async () => {
    const escenario = await crearEscenario('Filtro fechas');
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const dentro = await servicio.obtenerResultados(
      escenario.formId,
      filtros({ desde: ayer, hasta: manana }),
    );
    expect(dentro.resumen.iniciadas).toBe(3);

    const fuera = await servicio.obtenerResultados(escenario.formId, filtros({ hasta: ayer }));
    expect(fuera.resumen.iniciadas).toBe(0);
    expect(fuera.tabla.items).toEqual([]);
  });

  it('un formulario inexistente y una versión ajena fallan con NO_ENCONTRADO', async () => {
    const escenario = await crearEscenario('Errores');

    await expect(
      servicio.obtenerResultados('11111111-1111-4111-8111-111111111111', filtros()),
    ).rejects.toMatchObject({ code: 'NO_ENCONTRADO', status: 404 });

    await expect(
      servicio.obtenerResultados(
        escenario.formId,
        filtros({ versionId: '22222222-2222-4222-8222-222222222222' }),
      ),
    ).rejects.toMatchObject({ code: 'NO_ENCONTRADO', status: 404 });
  });

  /* ------------------------------------------------------------------------ */
  /* Inmutabilidad de los resultados por versión                               */
  /* ------------------------------------------------------------------------ */

  it('publicar una segunda versión no cambia ni un resultado de la primera', async () => {
    const escenario = await crearEscenario('Versionado');
    const soloV1 = filtros({ versionId: escenario.versionId });

    const antes = await servicio.obtenerResultados(escenario.formId, soloV1);
    const csvAntes = await leerCsv(escenario.formId, { versionId: escenario.versionId });

    const segunda = await publicarV2(escenario.formId);
    expect(segunda.version.versionNumber).toBe(escenario.versionNumber + 1);

    const despues = await servicio.obtenerResultados(escenario.formId, soloV1);
    const csvDespues = await leerCsv(escenario.formId, { versionId: escenario.versionId });

    // Cifras, distribuciones, abandono y filas: idénticos.
    expect(despues.resumen).toEqual(antes.resumen);
    expect(despues.preguntas).toEqual(antes.preguntas);
    expect(despues.abandonoPorPregunta).toEqual(antes.abandonoPorPregunta);
    expect(despues.tabla.items).toEqual(antes.tabla.items);
    // Y el CSV de la v1, byte a byte.
    expect(csvDespues.texto).toBe(csvAntes.texto);

    // Los títulos y las etiquetas de la v1 siguen siendo los suyos, aunque la v2
    // los haya reescrito enteros.
    const perfil = despues.preguntas.find((pregunta) => pregunta.questionId === 'perfil');
    expect(perfil?.titulo).toBe('Selección única perfil');
    expect(perfil?.titulo).not.toContain('REESCRITO');
    expect(perfil?.distribucion?.map((valor) => valor.etiqueta)).toEqual([
      'cliente',
      'proveedor',
    ]);

    // La nueva versión existe, aparece en el selector y todavía no tiene nada.
    expect(despues.versiones).toHaveLength(2);
    const nueva = await servicio.obtenerResultados(
      escenario.formId,
      filtros({ versionId: segunda.version.id }),
    );
    expect(nueva.resumen.iniciadas).toBe(0);
    expect(nueva.preguntas.find((pregunta) => pregunta.questionId === 'perfil')?.titulo).toBe(
      'TÍTULO REESCRITO EN LA V2',
    );
  });

  it('sin filtro de versión el catálogo une las dos, con el vocabulario del más reciente', async () => {
    const escenario = await crearEscenario('Unión');
    await publicarV2(escenario.formId);

    const resultados = await servicio.obtenerResultados(escenario.formId, filtros());

    // Las respuestas siguen siendo las de la v1 y se cuentan igual…
    expect(resultados.resumen.iniciadas).toBe(3);
    const perfil = resultados.preguntas.find((pregunta) => pregunta.questionId === 'perfil');
    expect(perfil?.distribucion).toEqual([
      { valor: 'cliente', etiqueta: 'ETIQUETA V2 cliente', recuento: 2 },
      { valor: 'proveedor', etiqueta: 'ETIQUETA V2 proveedor', recuento: 1 },
    ]);
    // …pero el título mostrado es el de la versión más nueva, que es con el que
    // piensa hoy quien mira el panel.
    expect(perfil?.titulo).toBe('TÍTULO REESCRITO EN LA V2');
  });

  /* ------------------------------------------------------------------------ */
  /* CSV                                                                       */
  /* ------------------------------------------------------------------------ */

  it('exporta una columna por pregunta y escapa el texto sin perder nada', async () => {
    const escenario = await crearEscenario('CSV');
    const csv = await leerCsv(escenario.formId);

    expect(csv.versionId).toBe(escenario.versionId);
    expect(csv.nombreArchivo).toBe(`${escenario.slug}-v${String(escenario.versionNumber)}-resultados.csv`);
    expect(csv.texto.startsWith('﻿')).toBe(true);

    const filas = analizarCsv(csv.texto);
    expect(filas[0]).toEqual([
      'sesion_id',
      'version',
      'estado',
      'iniciada_en',
      'ultima_actividad_en',
      'completada_en',
      'respuestas',
      'Selección única perfil',
      'Texto largo comentario',
      'Valoración satisfaccion',
    ]);

    expect(filas).toHaveLength(4);

    const completada = filas.find((fila) => fila[0] === escenario.sesionCompletada);
    expect(completada?.[1]).toBe(String(escenario.versionNumber));
    expect(completada?.[2]).toBe('Completada');
    expect(completada?.[6]).toBe('3');
    // La coma, las comillas, el salto de línea y los acentos vuelven intactos.
    expect(completada?.[8]).toBe(TEXTO_DIFICIL);
    expect(completada?.[9]).toBe('5');

    const abandonada = filas.find((fila) => fila[0] === escenario.sesionAbandonada);
    expect(abandonada?.[2]).toBe('Abandonada');
    // Sin fecha de finalización: celda en blanco, no la palabra «null».
    expect(abandonada?.[5]).toBe('');
  });

  it('el CSV respeta los filtros de la pantalla', async () => {
    const escenario = await crearEscenario('CSV filtrado');
    const csv = await leerCsv(escenario.formId, { estado: 'completadas' });

    const filas = analizarCsv(csv.texto);
    expect(filas).toHaveLength(2);
    expect(filas[1]?.[0]).toBe(escenario.sesionCompletada);
  });

  it('sin versión indicada exporta la activa, y tras publicar otra cambia con ella', async () => {
    const escenario = await crearEscenario('CSV activa');
    const primera = await leerCsv(escenario.formId);
    expect(primera.versionNumber).toBe(escenario.versionNumber);

    const segunda = await publicarV2(escenario.formId);
    const nueva = await leerCsv(escenario.formId);

    expect(nueva.versionId).toBe(segunda.version.id);
    // La v2 no tiene respuestas: solo cabecera, y con sus propios títulos.
    const filas = analizarCsv(nueva.texto);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.[7]).toBe('TÍTULO REESCRITO EN LA V2');
  });

  it('un formulario sin publicar no tiene CSV que exportar', async () => {
    const form = await service.createForm(
      { title: `Sin publicar ${sufijo}`, definition: documentoV1() },
      actor,
    );
    creados.push(form.id);

    await expect(servicio.prepararCsv(form.id, filtros())).rejects.toMatchObject({
      code: 'NO_ENCONTRADO',
      status: 404,
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Streaming                                                                 */
  /* ------------------------------------------------------------------------ */

  it('recorre las sesiones por lotes con paginación por clave, sin repetir ni perder', async () => {
    const escenario = await crearEscenario('Lotes');
    const condicion = consultas.condicionDeSesiones(escenario.formId, filtros(), new Date());

    const lotes: number[] = [];
    const vistas = new Set<string>();
    for await (const lote of consultas.recorrerSesiones(condicion, 2)) {
      lotes.push(lote.length);
      for (const sesion of lote) vistas.add(sesion.id);
    }

    // Tres sesiones en lotes de dos: dos vueltas, sin duplicados.
    expect(lotes).toEqual([2, 1]);
    expect(vistas.size).toBe(3);
  });

  it('el cursor distingue microsegundos: tres sesiones del mismo milisegundo no se repiten', async () => {
    const escenario = await crearEscenario('Microsegundos');

    // Las tres empiezan dentro del mismo milisegundo y se diferencian solo en
    // los microsegundos, que es la precisión que pierde el `Date` de
    // JavaScript. Con un cursor truncado, el recorrido devolvería la última fila
    // de cada lote otra vez —o no avanzaría nunca—.
    const ids = [
      escenario.sesionCompletada,
      escenario.sesionAbandonada,
      escenario.sesionEnCurso,
    ];
    for (const [indice, id] of ids.entries()) {
      await dbModule.db
        .update(schema.responseSessions)
        .set({
          startedAt: drizzle.sql`timestamptz '2026-01-01 10:00:00.00000Z' + ${indice} * interval '1 microsecond'`,
        })
        .where(drizzle.eq(schema.responseSessions.id, id));
    }

    const condicion = consultas.condicionDeSesiones(escenario.formId, filtros(), new Date());
    const lotes: number[] = [];
    const vistas = new Set<string>();
    for await (const lote of consultas.recorrerSesiones(condicion, 2)) {
      lotes.push(lote.length);
      for (const sesion of lote) vistas.add(sesion.id);
    }

    expect(lotes).toEqual([2, 1]);
    expect(vistas.size).toBe(3);
  });

  it('el CSV se emite en varios trozos, no como un único bloque montado en memoria', async () => {
    const escenario = await crearEscenario('CSV streaming');
    const csv = await leerCsv(escenario.formId);

    // Cabecera y al menos un lote de filas: el fichero nunca existe entero.
    expect(csv.trozos).toBeGreaterThanOrEqual(2);
  });
});
