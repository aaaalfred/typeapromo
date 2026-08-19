// @vitest-environment node

/**
 * Integración del borde HTTP: se invocan los manejadores de ruta reales.
 *
 * Se salta solo sin `DATABASE_URL`.
 *
 * La sesión se sustituye por un doble: el módulo real arrastra Auth.js, que sin
 * `AUTH_SECRET` aborta la configuración y convertiría cualquier ruta en un 500
 * que no dice nada. Lo que se prueba aquí es el borde HTTP —códigos, cuerpos y
 * el 409 de revisión—, no la lectura de la cookie, que ya cubren los tests de
 * `src/lib/auth`. El caso «sin sesión» también se comprueba, con el doble
 * devolviendo `null`.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { FormDefinition } from '@/lib/forms';

const auth = vi.hoisted(() => ({
  sesionActual: vi.fn(),
  evaluarSesion: vi.fn(() => ({ permitido: true, teamId: null })),
}));

vi.mock('@/lib/auth/sesion', () => auth);

/** Usuario real en la base: `forms.created_by` tiene clave foránea contra `users`. */
const USUARIO_ID = '9f1c0d3e-4b7a-4c2e-8f10-5a6b7c8d9e01';

function sesionDe(id: string) {
  return {
    user: {
      id,
      name: 'Integración',
      email: `integracion-${id.slice(0, 8)}@typeapromo.test`,
      image: null,
      slackUserId: null,
      slackTeamId: null,
    },
    expires: '2099-01-01T00:00:00.000Z',
  };
}

const hasDatabase = typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
const describeDb = hasDatabase ? describe : describe.skip;

type ListRoute = typeof import('@/app/api/forms/route');
type DetailRoute = typeof import('@/app/api/forms/[id]/route');
type DraftRoute = typeof import('@/app/api/forms/[id]/draft/route');
type DuplicateRoute = typeof import('@/app/api/forms/[id]/duplicate/route');
type CloseRoute = typeof import('@/app/api/forms/[id]/close/route');
type NextServer = typeof import('next/server');

interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
}

describeDb('rutas de /api/forms · integración', () => {
  let listRoute: ListRoute;
  let detailRoute: DetailRoute;
  let draftRoute: DraftRoute;
  let duplicateRoute: DuplicateRoute;
  let closeRoute: CloseRoute;
  let next: NextServer;

  const sufijo = `http-${Date.now().toString(36)}`;
  const creados: string[] = [];

  beforeAll(async () => {
    auth.sesionActual.mockResolvedValue(sesionDe(USUARIO_ID));

    const [{ db }, { users }] = await Promise.all([import('@/db'), import('@/db/schema')]);
    await db
      .insert(users)
      .values({ id: USUARIO_ID, email: sesionDe(USUARIO_ID).user.email, name: 'Integración' })
      .onConflictDoNothing();

    [listRoute, detailRoute, draftRoute, duplicateRoute, closeRoute, next] = await Promise.all([
      import('@/app/api/forms/route'),
      import('@/app/api/forms/[id]/route'),
      import('@/app/api/forms/[id]/draft/route'),
      import('@/app/api/forms/[id]/duplicate/route'),
      import('@/app/api/forms/[id]/close/route'),
      import('next/server'),
    ]);
  });

  afterEach(() => {
    // Devuelve la sesión válida: hay un test que la anula a propósito.
    auth.sesionActual.mockResolvedValue(sesionDe(USUARIO_ID));
    auth.evaluarSesion.mockReturnValue({ permitido: true, teamId: null });
  });

  afterAll(async () => {
    if (!hasDatabase) return;

    const [{ db, pool }, { forms, users }, { eq, inArray }] = await Promise.all([
      import('@/db'),
      import('@/db/schema'),
      import('drizzle-orm'),
    ]);
    if (creados.length > 0) {
      await db.delete(forms).where(inArray(forms.id, creados));
    }
    await db.delete(users).where(eq(users.id, USUARIO_ID));
    await pool.end();
  });

  /** `NextRequest` declara su propio `RequestInit`, más estricto que el del DOM. */
  type NextRequestInit = ConstructorParameters<NextServer['NextRequest']>[1];

  function request(url: string, init?: NextRequestInit) {
    return new next.NextRequest(new URL(url, 'http://localhost').toString(), init);
  }

  function context(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  async function crear(titulo: string): Promise<{ id: string; slug: string; title: string }> {
    const response = await listRoute.POST(
      request('/api/forms', { method: 'POST', body: JSON.stringify({ title: titulo }) }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { form: { id: string; slug: string; title: string } };
    creados.push(body.form.id);
    return body.form;
  }

  it('POST crea y devuelve 201 con el formulario completo', async () => {
    const form = await crear(`Ruta crear ${sufijo}`);
    expect(form.slug).toBe(`ruta-crear-${sufijo}`);
  });

  it('POST con cuerpo inválido devuelve 400 con el detalle por campo', async () => {
    const response = await listRoute.POST(
      request('/api/forms', { method: 'POST', body: JSON.stringify({ title: '' }) }),
    );
    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe('DATOS_INVALIDOS');
    expect(JSON.stringify(body.error.details)).toMatch(/título/i);
  });

  it('POST con JSON corrupto devuelve 400 sin filtrar la excepción', async () => {
    const response = await listRoute.POST(
      request('/api/forms', { method: 'POST', body: '{esto no es json' }),
    );
    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe('DATOS_INVALIDOS');
    expect(body.error.message).toMatch(/JSON/i);
  });

  it('GET lista con búsqueda y no cachea', async () => {
    const form = await crear(`Ruta listar ${sufijo}`);
    const response = await listRoute.GET(
      request(`/api/forms?q=${encodeURIComponent(`Ruta listar ${sufijo}`)}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const body = (await response.json()) as { items: { id: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0]?.id).toBe(form.id);
  });

  it('GET /:id devuelve 400 si el identificador no es un UUID y 404 si no existe', async () => {
    const invalido = await detailRoute.GET(request('/api/forms/abc'), context('abc'));
    expect(invalido.status).toBe(400);

    const ausente = await detailRoute.GET(
      request('/api/forms/00000000-0000-4000-8000-000000000000'),
      context('00000000-0000-4000-8000-000000000000'),
    );
    expect(ausente.status).toBe(404);
    expect(((await ausente.json()) as ErrorBody).error.code).toBe('NO_ENCONTRADO');
  });

  it('PUT /:id/draft devuelve 409 con la revisión del servidor en la segunda pestaña', async () => {
    const form = await crear(`Ruta borrador ${sufijo}`);

    const detalle = await detailRoute.GET(request(`/api/forms/${form.id}`), context(form.id));
    const { form: leido } = (await detalle.json()) as {
      form: { definition: FormDefinition; draft: { revision: number } };
    };
    expect(leido.draft.revision).toBe(1);

    const cuerpo = (titulo: string): string =>
      JSON.stringify({
        revision: 1,
        definition: { ...leido.definition, meta: { ...leido.definition.meta, title: titulo } },
      });

    const primera = await draftRoute.PUT(
      request(`/api/forms/${form.id}/draft`, { method: 'PUT', body: cuerpo('Pestaña A') }),
      context(form.id),
    );
    expect(primera.status).toBe(200);
    expect((await primera.json()) as { draft: { revision: number } }).toMatchObject({
      draft: { revision: 2 },
    });

    const segunda = await draftRoute.PUT(
      request(`/api/forms/${form.id}/draft`, { method: 'PUT', body: cuerpo('Pestaña B') }),
      context(form.id),
    );
    expect(segunda.status).toBe(409);

    const body = (await segunda.json()) as ErrorBody;
    expect(body.error.code).toBe('CONFLICTO_REVISION');
    expect(body.error.details).toEqual({ revisionEnviada: 1, revisionServidor: 2 });

    // Sin sobrescritura: sigue lo que guardó la primera pestaña.
    const final = await detailRoute.GET(request(`/api/forms/${form.id}`), context(form.id));
    const { form: releido } = (await final.json()) as { form: { definition: FormDefinition } };
    expect(releido.definition.meta.title).toBe('Pestaña A');
  });

  it('PATCH actualiza metadatos y POST /duplicate crea la copia con 201', async () => {
    const form = await crear(`Ruta metadatos ${sufijo}`);

    const patch = await detailRoute.PATCH(
      request(`/api/forms/${form.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: `Ruta renombrada ${sufijo}` }),
      }),
      context(form.id),
    );
    expect(patch.status).toBe(200);
    expect((await patch.json()) as { form: { title: string } }).toMatchObject({
      form: { title: `Ruta renombrada ${sufijo}` },
    });

    const duplicado = await duplicateRoute.POST(
      request(`/api/forms/${form.id}/duplicate`, { method: 'POST' }),
      context(form.id),
    );
    expect(duplicado.status).toBe(201);

    const { form: copia } = (await duplicado.json()) as {
      form: { id: string; title: string; slug: string };
    };
    creados.push(copia.id);
    expect(copia.title).toBe(`Ruta renombrada ${sufijo} (copia)`);
    expect(copia.slug).not.toBe(form.slug);
  });

  it('POST /close rechaza con 409 lo que nunca se publicó', async () => {
    const form = await crear(`Ruta cerrar ${sufijo}`);
    const response = await closeRoute.POST(
      request(`/api/forms/${form.id}/close`, { method: 'POST' }),
      context(form.id),
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as ErrorBody).error.code).toBe('TRANSICION_INVALIDA');
  });

  it('sin sesión todas las rutas responden 401, no una redirección al login', async () => {
    auth.sesionActual.mockResolvedValue(null);

    const AUSENTE = '00000000-0000-4000-8000-000000000000';

    // Secuencial a propósito. En paralelo, las cuatro rutas hacen a la vez su
    // primera importación dinámica del módulo de sesión y la resolución del
    // doble se pisa: tres se quedan con el módulo real, que arrastra Auth.js y
    // revienta. El test no gana nada con la concurrencia.
    const llamadas: (() => Promise<Response>)[] = [
      () => listRoute.GET(request('/api/forms')),
      () =>
        listRoute.POST(
          request('/api/forms', { method: 'POST', body: JSON.stringify({ title: 'X' }) }),
        ),
      () => detailRoute.GET(request(`/api/forms/${AUSENTE}`), context(AUSENTE)),
      () =>
        closeRoute.POST(
          request(`/api/forms/${AUSENTE}/close`, { method: 'POST' }),
          context(AUSENTE),
        ),
    ];

    const resultado: { status: number; code: string }[] = [];
    for (const llamada of llamadas) {
      const respuesta = await llamada();
      resultado.push({
        status: respuesta.status,
        code: ((await respuesta.json()) as ErrorBody).error.code,
      });
    }

    expect(resultado).toEqual(llamadas.map(() => ({ status: 401, code: 'NO_AUTENTICADO' })));
  });
});
