// @vitest-environment node

/**
 * Experiencia de respuesta contra PostgreSQL de verdad.
 *
 * **Se salta solo cuando no hay `DATABASE_URL`**, para que CI siga en verde sin
 * base de datos. Con la base levantada:
 *
 * ```bash
 * DATABASE_URL=postgresql://typeapromo:typeapromo@localhost:5432/typeapromo \
 *   npx vitest run src/server/responses
 * ```
 *
 * Cubre los cuatro compromisos de la fase que solo se pueden comprobar contra la
 * base de datos:
 *
 * 1. Publicar una segunda versión **no altera ni un recorrido, ni una etiqueta,
 *    ni una respuesta** de la primera.
 * 2. El autosave es **idempotente**: reeditar una respuesta actualiza la fila.
 * 3. El **token en claro no aparece en la base de datos**.
 * 4. **No se guarda ninguna IP** en ninguna de las tablas de respuesta.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '@/server/forms/actor';

const hasDatabase =
  typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
const describeDb = hasDatabase ? describe : describe.skip;

type SesionesModule = typeof import('../sesiones');
type PublicoModule = typeof import('../publico');
type TokenModule = typeof import('../token');
type PublishModule = typeof import('@/server/publish/publicar');
type FormsServiceModule = typeof import('@/server/forms/service');
type DbModule = typeof import('@/db');
type SchemaModule = typeof import('@/db/schema');
type DrizzleModule = typeof import('drizzle-orm');
type FixturesModule = typeof import('@/lib/forms/__tests__/fixtures');

describeDb('experiencia de respuesta · integración', () => {
  let sesiones: SesionesModule;
  let publico: PublicoModule;
  let tokenLib: TokenModule;
  let publish: PublishModule;
  let service: FormsServiceModule;
  let dbModule: DbModule;
  let schema: SchemaModule;
  let drizzle: DrizzleModule;
  let fixtures: FixturesModule;

  const actor: Actor = { id: null, email: 'fase7@typeapromo.local', name: 'Fase 7' };
  const sufijo = `resp${Date.now().toString(36)}`;
  const creados: string[] = [];

  beforeAll(async () => {
    [sesiones, publico, tokenLib, publish, service, dbModule, schema, drizzle, fixtures] =
      await Promise.all([
        import('../sesiones'),
        import('../publico'),
        import('../token'),
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
      await dbModule.db
        .delete(schema.forms)
        .where(drizzle.inArray(schema.forms.id, creados));
    }
    await dbModule.pool.end();
  });

  /* ------------------------------------------------------------------------ */
  /* Documentos                                                                */
  /* ------------------------------------------------------------------------ */

  /**
   * Versión 1: quien elige `proveedor` salta a la valoración y se salta la
   * pregunta de empresa.
   */
  function documentoV1() {
    return fixtures.makeForm({
      title: 'Documento v1',
      blocks: [
        fixtures.singleChoice('perfil', ['cliente', 'proveedor'], { required: true }),
        fixtures.shortText('empresa'),
        fixtures.rating('satisfaccion', { scale: 5 }),
      ],
      rules: [
        fixtures.rule('r1', 'perfil', 'equals', 'proveedor', fixtures.toBlock('satisfaccion')),
      ],
      endScreens: [fixtures.ending('gracias')],
    });
  }

  /**
   * Versión 2: **etiquetas distintas y sin la regla**. Si la sesión de la v1
   * leyera esta versión, cambiarían tanto su recorrido como sus textos.
   */
  function documentoV2() {
    const base = fixtures.makeForm({
      title: 'Documento v2',
      blocks: [
        fixtures.singleChoice('perfil', ['cliente', 'proveedor'], { required: true }),
        fixtures.shortText('empresa'),
        fixtures.rating('satisfaccion', { scale: 5 }),
      ],
      rules: [],
      endScreens: [fixtures.ending('gracias')],
    });

    return {
      ...base,
      meta: { ...base.meta, closedMessage: 'La convocatoria se cerró el 30 de junio.' },
      blocks: base.blocks.map((bloque) =>
        bloque.id === 'perfil'
          ? { ...bloque, title: 'TITULO REESCRITO EN LA V2' }
          : bloque,
      ),
    } as typeof base;
  }

  async function crearYPublicar(nombre: string) {
    const form = await service.createForm(
      { title: `${nombre} ${sufijo}`, definition: documentoV1() },
      actor,
    );
    creados.push(form.id);
    const version = await publish.publishForm(form.id, {}, actor);
    return { formId: form.id, slug: form.slug, version: version.version };
  }

  async function disponible(slug: string) {
    return publico.exigirFormularioDisponible(slug);
  }

  /* ------------------------------------------------------------------------ */
  /* Lectura pública                                                           */
  /* ------------------------------------------------------------------------ */

  it('sirve la versión activa y nunca el borrador', async () => {
    const { formId, slug } = await crearYPublicar('Público');

    // El borrador cambia, pero nadie lo publica.
    const detalle = await service.getForm(formId);
    await service.saveDraft(
      formId,
      { revision: detalle.draft?.revision ?? 1, definition: documentoV2() },
      actor,
    );

    const formulario = await publico.cargarFormularioPublico(slug);
    expect(formulario?.estado).toBe('disponible');
    const perfil = formulario?.version?.definition.blocks.find(
      (bloque) => bloque.id === 'perfil',
    );
    expect(perfil?.title).not.toContain('REESCRITO');
  });

  it('un formulario cerrado no es un 404: devuelve el mensaje configurado', async () => {
    const { formId, slug } = await crearYPublicar('Cerrado');

    const detalle = await service.getForm(formId);
    await service.saveDraft(
      formId,
      { revision: detalle.draft?.revision ?? 1, definition: documentoV2() },
      actor,
    );
    await publish.publishForm(formId, {}, actor);
    await service.closeForm(formId);

    const formulario = await publico.cargarFormularioPublico(slug);
    expect(formulario).not.toBeNull();
    expect(formulario?.estado).toBe('cerrado');
    expect(formulario?.mensaje).toBe('La convocatoria se cerró el 30 de junio.');
    expect(formulario?.version).not.toBeNull();

    await expect(disponible(slug)).rejects.toMatchObject({
      code: 'FORMULARIO_NO_DISPONIBLE',
      status: 409,
    });
  });

  it('un slug inexistente sí es un 404', async () => {
    expect(await publico.cargarFormularioPublico(`no-existe-${sufijo}`)).toBeNull();
  });

  /* ------------------------------------------------------------------------ */
  /* Privacidad                                                                */
  /* ------------------------------------------------------------------------ */

  it('el token en claro no aparece en ninguna columna de la sesión', async () => {
    const { formId, slug } = await crearYPublicar('Token');
    const { token, sesion } = await sesiones.crearSesion(await disponible(slug));

    const [fila] = await dbModule.db
      .select()
      .from(schema.responseSessions)
      .where(drizzle.eq(schema.responseSessions.id, sesion.sessionId));

    expect(fila).toBeDefined();
    expect(fila?.tokenHash).toBe(tokenLib.hashDeToken(token));
    expect(fila?.tokenHash).not.toBe(token);
    expect(JSON.stringify(fila)).not.toContain(token);

    // Y tampoco en la fila de eventos, que es lo otro que se escribe al iniciar.
    const eventos = await dbModule.db
      .select()
      .from(schema.formEvents)
      .where(drizzle.eq(schema.formEvents.formId, formId));
    expect(JSON.stringify(eventos)).not.toContain(token);
  });

  it('una búsqueda por el token en claro no encuentra ninguna sesión', async () => {
    const { slug } = await crearYPublicar('Token opaco');
    const { token } = await sesiones.crearSesion(await disponible(slug));

    const porTokenEnClaro = await dbModule.db
      .select({ id: schema.responseSessions.id })
      .from(schema.responseSessions)
      .where(drizzle.eq(schema.responseSessions.tokenHash, token));

    expect(porTokenEnClaro).toHaveLength(0);
  });

  it('ninguna tabla de respuesta tiene una columna de IP', async () => {
    const filas = await dbModule.db.execute<{ table_name: string; column_name: string }>(
      drizzle.sql`
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('response_sessions', 'answers', 'form_events')
      `,
    );

    const columnas = filas.rows.map((fila) => `${fila.table_name}.${fila.column_name}`);
    expect(columnas.length).toBeGreaterThan(0);
    for (const columna of columnas) {
      expect(columna).not.toMatch(/(^|[._])ip($|[._])/i);
      expect(columna).not.toMatch(/address|remote_addr|forwarded/i);
    }
  });

  it('no se guarda la dirección IP en ninguna fila de la respuesta', async () => {
    const IP = '203.0.113.77';
    const { formId, slug } = await crearYPublicar('Sin IP');
    const { token } = await sesiones.crearSesion(await disponible(slug));

    // Se «responde» mientras el control de abuso contabiliza esa misma IP.
    const { consumirLimite } = await import('@/server/rate-limit/limitador');
    await consumirLimite({ ambito: 'respuestas', cliente: IP });

    await sesiones.guardarRespuesta({
      formId,
      token,
      questionId: 'perfil',
      valor: 'cliente',
    });

    const [sesionFila] = await dbModule.db
      .select()
      .from(schema.responseSessions)
      .where(drizzle.eq(schema.responseSessions.formId, formId));
    const respuestas = await dbModule.db
      .select()
      .from(schema.answers)
      .where(drizzle.eq(schema.answers.formId, formId));
    const eventos = await dbModule.db
      .select()
      .from(schema.formEvents)
      .where(drizzle.eq(schema.formEvents.formId, formId));

    const volcado = JSON.stringify({ sesionFila, respuestas, eventos });
    expect(volcado).not.toContain(IP);
    expect(volcado).not.toContain('203.0.113');
  });

  /* ------------------------------------------------------------------------ */
  /* Autosave                                                                  */
  /* ------------------------------------------------------------------------ */

  it('el upsert es idempotente: reeditar una respuesta actualiza la fila', async () => {
    const { formId, slug } = await crearYPublicar('Upsert');
    const { token, sesion } = await sesiones.crearSesion(await disponible(slug));

    await sesiones.guardarRespuesta({ formId, token, questionId: 'perfil', valor: 'cliente' });
    await sesiones.guardarRespuesta({ formId, token, questionId: 'perfil', valor: 'cliente' });
    await sesiones.guardarRespuesta({
      formId,
      token,
      questionId: 'perfil',
      valor: 'proveedor',
    });

    const filas = await dbModule.db
      .select()
      .from(schema.answers)
      .where(drizzle.eq(schema.answers.sessionId, sesion.sessionId));

    expect(filas).toHaveLength(1);
    expect(filas[0]?.valueJson).toBe('proveedor');
    expect(filas[0]?.questionType).toBe('single_choice');
    expect(filas[0]?.versionId).toBe(sesion.versionId);
  });

  it('guarda una pregunta pasada en blanco como `null`, no como ausencia de fila', async () => {
    const { formId, slug } = await crearYPublicar('En blanco');
    const { token, sesion } = await sesiones.crearSesion(await disponible(slug));

    await sesiones.guardarRespuesta({ formId, token, questionId: 'perfil', valor: 'cliente' });
    await sesiones.guardarRespuesta({ formId, token, questionId: 'empresa', valor: null });

    const [fila] = await dbModule.db
      .select()
      .from(schema.answers)
      .where(
        drizzle.and(
          drizzle.eq(schema.answers.sessionId, sesion.sessionId),
          drizzle.eq(schema.answers.questionId, 'empresa'),
        ),
      );

    expect(fila).toBeDefined();
    expect(fila?.valueJson).toBeNull();
  });

  it('rechaza una respuesta inválida sin escribir nada', async () => {
    const { formId, slug } = await crearYPublicar('Inválida');
    const { token, sesion } = await sesiones.crearSesion(await disponible(slug));

    await expect(
      sesiones.guardarRespuesta({
        formId,
        token,
        questionId: 'perfil',
        valor: 'inexistente',
      }),
    ).rejects.toMatchObject({ code: 'DATOS_INVALIDOS', status: 400 });

    const filas = await dbModule.db
      .select()
      .from(schema.answers)
      .where(drizzle.eq(schema.answers.sessionId, sesion.sessionId));
    expect(filas).toHaveLength(0);
  });

  it('el destino lo decide el motor en el servidor, no el cliente', async () => {
    const { formId, slug } = await crearYPublicar('Recorrido');
    const { token } = await sesiones.crearSesion(await disponible(slug));

    const comoProveedor = await sesiones.guardarRespuesta({
      formId,
      token,
      questionId: 'perfil',
      valor: 'proveedor',
    });
    expect(comoProveedor.vista.pantalla).toEqual({ kind: 'block', id: 'satisfaccion' });

    const comoCliente = await sesiones.guardarRespuesta({
      formId,
      token,
      questionId: 'perfil',
      valor: 'cliente',
    });
    expect(comoCliente.vista.pantalla).toEqual({ kind: 'block', id: 'empresa' });
  });

  it('actualiza `last_activity_at` y el contador de respondidas', async () => {
    const { formId, slug } = await crearYPublicar('Actividad');
    const { token, sesion } = await sesiones.crearSesion(await disponible(slug));

    const [antes] = await dbModule.db
      .select()
      .from(schema.responseSessions)
      .where(drizzle.eq(schema.responseSessions.id, sesion.sessionId));

    await sesiones.guardarRespuesta({ formId, token, questionId: 'perfil', valor: 'cliente' });

    const [despues] = await dbModule.db
      .select()
      .from(schema.responseSessions)
      .where(drizzle.eq(schema.responseSessions.id, sesion.sessionId));

    expect(despues?.answeredCount).toBe(1);
    expect(despues?.currentQuestionId).toBe('empresa');
    expect((despues?.lastActivityAt.getTime() ?? 0) >= (antes?.lastActivityAt.getTime() ?? 0)).toBe(
      true,
    );
  });

  /* ------------------------------------------------------------------------ */
  /* Reanudación                                                               */
  /* ------------------------------------------------------------------------ */

  it('reanuda con el mismo token, con sus respuestas y su pantalla', async () => {
    const { formId, slug } = await crearYPublicar('Reanudar');
    const { token } = await sesiones.crearSesion(await disponible(slug));

    await sesiones.guardarRespuesta({ formId, token, questionId: 'perfil', valor: 'cliente' });
    await sesiones.guardarRespuesta({ formId, token, questionId: 'empresa', valor: 'ACME' });

    const reanudada = await sesiones.cargarSesion(formId, token);
    expect(reanudada?.respuestas).toEqual({ perfil: 'cliente', empresa: 'ACME' });
    expect(reanudada?.pantalla).toEqual({ kind: 'block', id: 'satisfaccion' });
    expect(reanudada?.completada).toBe(false);
  });

  it('no reanuda con un token ajeno, inventado o de otro formulario', async () => {
    const primero = await crearYPublicar('Ajeno A');
    const segundo = await crearYPublicar('Ajeno B');
    const { token } = await sesiones.crearSesion(await disponible(primero.slug));

    expect(await sesiones.cargarSesion(segundo.formId, token)).toBeNull();
    expect(await sesiones.cargarSesion(primero.formId, tokenLib.crearToken())).toBeNull();
    expect(await sesiones.cargarSesion(primero.formId, undefined)).toBeNull();
    expect(await sesiones.cargarSesion(primero.formId, 'basura')).toBeNull();
  });

  /* ------------------------------------------------------------------------ */
  /* Criterio de «hecho» de la fase                                            */
  /* ------------------------------------------------------------------------ */

  it('publicar una segunda versión no altera ni un recorrido, ni una etiqueta, ni una respuesta', async () => {
    const { formId, slug } = await crearYPublicar('Dos versiones');

    // Alguien empieza a responder con la versión 1 y elige la rama del salto.
    const { token, sesion } = await sesiones.crearSesion(await disponible(slug));
    const versionDeLaSesion = sesion.versionId;

    await sesiones.guardarRespuesta({
      formId,
      token,
      questionId: 'perfil',
      valor: 'proveedor',
    });

    const [respuestaAntes] = await dbModule.db
      .select()
      .from(schema.answers)
      .where(drizzle.eq(schema.answers.sessionId, sesion.sessionId));

    // Se publica una versión 2 con otras etiquetas y sin la regla del salto.
    const detalle = await service.getForm(formId);
    await service.saveDraft(
      formId,
      { revision: detalle.draft?.revision ?? 1, definition: documentoV2() },
      actor,
    );
    const segunda = await publish.publishForm(formId, {}, actor);
    expect(segunda.version.versionNumber).toBe(2);

    // 1 · La sesión sigue ligada a su versión.
    const reanudada = await sesiones.cargarSesion(formId, token);
    expect(reanudada?.versionId).toBe(versionDeLaSesion);
    expect(reanudada?.versionNumber).toBe(1);

    // 2 · Ni una etiqueta ha cambiado.
    const perfil = reanudada?.definicion.blocks.find((bloque) => bloque.id === 'perfil');
    expect(perfil?.title).not.toContain('REESCRITO');
    expect(reanudada?.definicion.rules).toHaveLength(1);

    // 3 · Ni el recorrido: sigue saltando a la valoración, como en la v1.
    expect(reanudada?.pantalla).toEqual({ kind: 'block', id: 'satisfaccion' });
    const siguiente = await sesiones.guardarRespuesta({
      formId,
      token,
      questionId: 'perfil',
      valor: 'proveedor',
    });
    expect(siguiente.vista.pantalla).toEqual({ kind: 'block', id: 'satisfaccion' });

    // 4 · Ni la respuesta guardada.
    const [respuestaDespues] = await dbModule.db
      .select()
      .from(schema.answers)
      .where(drizzle.eq(schema.answers.sessionId, sesion.sessionId));
    expect(respuestaDespues?.valueJson).toBe(respuestaAntes?.valueJson);
    expect(respuestaDespues?.versionId).toBe(versionDeLaSesion);

    // 5 · Y quien llegue ahora sí ve la versión 2.
    const nueva = await sesiones.crearSesion(await disponible(slug));
    expect(nueva.sesion.versionId).toBe(segunda.version.id);
    const perfilNuevo = nueva.sesion.definicion.blocks.find(
      (bloque) => bloque.id === 'perfil',
    );
    expect(perfilNuevo?.title).toContain('REESCRITO');
  });

  /* ------------------------------------------------------------------------ */
  /* Finalización y eventos                                                    */
  /* ------------------------------------------------------------------------ */

  it('completar cierra la sesión, es idempotente y deja la traza de eventos', async () => {
    const { formId, slug } = await crearYPublicar('Completar');
    const { token, sesion } = await sesiones.crearSesion(await disponible(slug));

    await sesiones.guardarRespuesta({ formId, token, questionId: 'perfil', valor: 'cliente' });
    await sesiones.guardarRespuesta({ formId, token, questionId: 'empresa', valor: 'ACME' });
    const ultimo = await sesiones.guardarRespuesta({
      formId,
      token,
      questionId: 'satisfaccion',
      valor: 4,
    });
    expect(ultimo.terminado).toBe(true);
    expect(ultimo.vista.pantalla).toEqual({ kind: 'end_screen', id: 'gracias' });

    await sesiones.completarSesion(formId, token);
    await sesiones.completarSesion(formId, token);

    const [fila] = await dbModule.db
      .select()
      .from(schema.responseSessions)
      .where(drizzle.eq(schema.responseSessions.id, sesion.sessionId));

    expect(fila?.status).toBe('completed');
    expect(fila?.completedAt).not.toBeNull();

    const eventos = await dbModule.db
      .select()
      .from(schema.formEvents)
      .where(drizzle.eq(schema.formEvents.sessionId, sesion.sessionId));

    const tipos = eventos.map((evento) => evento.type);
    expect(tipos.filter((tipo) => tipo === 'started')).toHaveLength(1);
    expect(tipos.filter((tipo) => tipo === 'advanced')).toHaveLength(3);
    // Idempotente: completar dos veces registra un solo evento.
    expect(tipos.filter((tipo) => tipo === 'completed')).toHaveLength(1);
    // El abandono se deriva en consulta y nunca se escribe.
    expect(tipos).not.toContain('abandoned');
  });

  it('una sesión ya completada no admite más respuestas', async () => {
    const { formId, slug } = await crearYPublicar('Cerrada');
    const { token } = await sesiones.crearSesion(await disponible(slug));

    await sesiones.completarSesion(formId, token);

    await expect(
      sesiones.guardarRespuesta({ formId, token, questionId: 'perfil', valor: 'cliente' }),
    ).rejects.toMatchObject({ code: 'SESION_COMPLETADA', status: 409 });
  });

  it('sin sesión válida, guardar y completar responden que no hay nada que reanudar', async () => {
    const { formId } = await crearYPublicar('Sin sesión');

    await expect(
      sesiones.guardarRespuesta({
        formId,
        token: tokenLib.crearToken(),
        questionId: 'perfil',
        valor: 'cliente',
      }),
    ).rejects.toMatchObject({ code: 'SESION_NO_ENCONTRADA', status: 404 });

    await expect(sesiones.completarSesion(formId, undefined)).rejects.toMatchObject({
      code: 'SESION_NO_ENCONTRADA',
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Progreso                                                                  */
  /* ------------------------------------------------------------------------ */

  it('el progreso se calcula sobre el recorrido efectivo y es una estimación', async () => {
    const { formId, slug } = await crearYPublicar('Progreso');
    const { token, sesion } = await sesiones.crearSesion(await disponible(slug));

    // Con la bifurcación abierta, el total todavía puede cambiar.
    const inicial = sesiones.aVistaSesion(sesion);
    expect(inicial.progreso.answered).toBe(0);
    expect(inicial.progreso.deterministic).toBe(false);

    // Al elegir `proveedor`, la pregunta de empresa deja de ser alcanzable.
    const tras = await sesiones.guardarRespuesta({
      formId,
      token,
      questionId: 'perfil',
      valor: 'proveedor',
    });

    expect(tras.vista.progreso.answered).toBe(1);
    expect(tras.vista.progreso.total).toBe(2);
    expect(tras.vista.progreso.deterministic).toBe(true);
  });
});
