import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDatabase = typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL !== '';
const describeDb = hasDatabase ? describe : describe.skip;

type DbModule = typeof import('@/db');
type SchemaModule = typeof import('@/db/schema');
type DrizzleModule = typeof import('drizzle-orm');

describeDb('autenticación por email, verificación y restablecimiento · integración', () => {
  let dbModule: DbModule;
  let schema: SchemaModule;
  let drizzle: DrizzleModule;

  const testEmail = `test-auth-${Date.now()}@typeapromo.local`;
  const testPassword = 'PasswordSegura123!';
  let testUserId: string;
  let verificationTokenPlano: string;
  let resetTokenPlano: string;

  beforeAll(async () => {
    [dbModule, schema, drizzle] = await Promise.all([
      import('@/db'),
      import('@/db/schema'),
      import('drizzle-orm'),
    ]);
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    const { db } = dbModule;
    const { users, workspaces, workspaceMembers, eq, inArray } = { ...schema, ...drizzle };

    if (testUserId) {
      const memberships = await db
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, testUserId));

      const wsIds = memberships.map((m) => m.workspaceId);

      await db.delete(users).where(eq(users.id, testUserId));
      if (wsIds.length > 0) {
        await db.delete(workspaces).where(inArray(workspaces.id, wsIds));
      }
    }
  });

  describe('registro', () => {
    it('rechaza contraseñas con menos de 10 caracteres', async () => {
      const { POST: registroHandler } = await import('@/app/api/auth/registro/route');

      const peticion = new Request('http://localhost:3000/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test',
          email: testEmail,
          password: 'corta',
        }),
      });

      const respuesta = await registroHandler(peticion);
      expect(respuesta.status).toBe(400);

      const json = await respuesta.json();
      expect(json.error).toContain('10');
    });

    it('crea usuario, espacio personal y token de verificación para credenciales válidas', async () => {
      const { POST: registroHandler } = await import('@/app/api/auth/registro/route');

      const peticion = new Request('http://localhost:3000/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Usuario',
          email: testEmail,
          password: testPassword,
        }),
      });

      const respuesta = await registroHandler(peticion);
      expect(respuesta.status).toBe(200);

      const json = await respuesta.json();
      expect(json.ok).toBe(true);

      // Comprobar que existe en la BD
      const { db } = dbModule;
      const { users, workspaces, workspaceMembers, emailVerificationTokens, eq } = {
        ...schema,
        ...drizzle,
      };

      const [usuarioEnDb] = await db
        .select()
        .from(users)
        .where(eq(users.email, testEmail));

      expect(usuarioEnDb).toBeDefined();
      if (!usuarioEnDb) throw new Error('usuarioEnDb no definido');
      expect(usuarioEnDb.emailVerified).toBeNull();
      expect(usuarioEnDb.passwordHash).toMatch(/^\$argon2id\$/);
      testUserId = usuarioEnDb.id;

      // Comprobar membresía de workspace
      const [membresia] = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, testUserId));

      expect(membresia).toBeDefined();
      if (!membresia) throw new Error('membresia no definida');
      expect(membresia.role).toBe('owner');

      const [espacio] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, membresia.workspaceId));

      expect(espacio).toBeDefined();
      if (!espacio) throw new Error('espacio no definido');
      expect(espacio.name).toBe('Espacio de Test Usuario');

      // Obtener el token de verificación creado
      const [tokenFila] = await db
        .select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.userId, testUserId));

      expect(tokenFila).toBeDefined();
      if (!tokenFila) throw new Error('tokenFila no definido');
      expect(tokenFila.consumedAt).toBeNull();
    });

    it('no enumera usuarios: responder 200 genérico si el correo ya existe sin duplicar', async () => {
      const { POST: registroHandler } = await import('@/app/api/auth/registro/route');

      const peticion = new Request('http://localhost:3000/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Duplicado',
          email: testEmail,
          password: testPassword,
        }),
      });

      const respuesta = await registroHandler(peticion);
      expect(respuesta.status).toBe(200);

      const json = await respuesta.json();
      expect(json.ok).toBe(true);
    });
  });

  describe('login previo a verificación', () => {
    it('rechaza login con 403 si el email no ha sido verificado', async () => {
      const { POST: iniciarHandler } = await import('@/app/api/auth/iniciar/route');

      const peticion = new Request('http://localhost:3000/api/auth/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      const respuesta = await iniciarHandler(peticion);
      expect(respuesta.status).toBe(403);

      const json = await respuesta.json();
      expect(json.noVerificado).toBe(true);
    });

    it('rechaza login con 401 si la contraseña es incorrecta', async () => {
      const { POST: iniciarHandler } = await import('@/app/api/auth/iniciar/route');

      const peticion = new Request('http://localhost:3000/api/auth/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'PasswordIncorrecta123!',
        }),
      });

      const respuesta = await iniciarHandler(peticion);
      expect(respuesta.status).toBe(401);
    });
  });

  describe('verificación de correo', () => {
    it('activa al usuario y crea sesión al consumir token válido', async () => {
      const { crearTokenVerificacion } = await import('@/server/auth/tokens');
      const { GET: verificarHandler } = await import('@/app/api/auth/verificar/route');

      verificationTokenPlano = await crearTokenVerificacion(testUserId);

      const peticion = new Request(
        `http://localhost:3000/api/auth/verificar?token=${verificationTokenPlano}`,
      );

      const respuesta = await verificarHandler(peticion);
      expect(respuesta.status).toBe(303);
      expect(respuesta.headers.get('Location')).toContain('/app');

      // Comprobar cookie de sesión
      const setCookie = respuesta.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('authjs.session-token=');

      // Comprobar que en BD se marcó emailVerified
      const { db } = dbModule;
      const { users, eq } = { ...schema, ...drizzle };

      const [usuarioActualizado] = await db
        .select()
        .from(users)
        .where(eq(users.id, testUserId));

      expect(usuarioActualizado).toBeDefined();
      if (!usuarioActualizado) throw new Error('usuarioActualizado no definido');
      expect(usuarioActualizado.emailVerified).not.toBeNull();
    });

    it('rechaza reutilizar el mismo token ya consumido', async () => {
      const { GET: verificarHandler } = await import('@/app/api/auth/verificar/route');

      const peticion = new Request(
        `http://localhost:3000/api/auth/verificar?token=${verificationTokenPlano}`,
      );

      const respuesta = await verificarHandler(peticion);
      expect(respuesta.status).toBe(303);
      expect(respuesta.headers.get('Location')).toContain('token-invalido');
    });
  });

  describe('login tras verificación', () => {
    it('inicia sesión con credenciales correctas y devuelve cookie de sesión', async () => {
      const { POST: iniciarHandler } = await import('@/app/api/auth/iniciar/route');

      const peticion = new Request('http://localhost:3000/api/auth/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      const respuesta = await iniciarHandler(peticion);
      expect(respuesta.status).toBe(200);

      const setCookie = respuesta.headers.get('set-cookie');
      expect(setCookie).toContain('authjs.session-token=');

      const json = await respuesta.json();
      expect(json.ok).toBe(true);
    });
  });

  describe('restablecimiento de contraseña', () => {
    it('genera token de restablecimiento mediante POST /api/auth/recuperar', async () => {
      const { POST: recuperarHandler } = await import('@/app/api/auth/recuperar/route');
      const { crearTokenRestablecimiento } = await import('@/server/auth/tokens');

      const peticion = new Request('http://localhost:3000/api/auth/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      });

      const respuesta = await recuperarHandler(peticion);
      expect(respuesta.status).toBe(200);

      // Generar token para probar restablecer
      resetTokenPlano = await crearTokenRestablecimiento(testUserId);
      expect(resetTokenPlano).toBeDefined();
    });

    it('actualiza la contraseña e invalida sesiones previas', async () => {
      const { POST: restablecerHandler } = await import('@/app/api/auth/restablecer/route');
      const { POST: iniciarHandler } = await import('@/app/api/auth/iniciar/route');
      const { db } = dbModule;
      const { authSessions, eq } = { ...schema, ...drizzle };

      // Comprobar que hay sesiones previas
      const sesionesAntes = await db
        .select()
        .from(authSessions)
        .where(eq(authSessions.userId, testUserId));

      expect(sesionesAntes.length).toBeGreaterThan(0);

      const nuevaPassword = 'NuevaPassword456!';
      const peticion = new Request('http://localhost:3000/api/auth/restablecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetTokenPlano,
          password: nuevaPassword,
        }),
      });

      const respuesta = await restablecerHandler(peticion);
      expect(respuesta.status).toBe(200);

      // Verificar que las sesiones previas se han invalidado
      const sesionesDespues = await db
        .select()
        .from(authSessions)
        .where(eq(authSessions.userId, testUserId));

      expect(sesionesDespues.length).toBe(0);

      // Probar login con contraseña antigua (debe fallar)
      const loginAntiguo = await iniciarHandler(
        new Request('http://localhost:3000/api/auth/iniciar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: testEmail, password: testPassword }),
        }),
      );
      expect(loginAntiguo.status).toBe(401);

      // Probar login con contraseña nueva (debe funcionar)
      const loginNuevo = await iniciarHandler(
        new Request('http://localhost:3000/api/auth/iniciar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: testEmail, password: nuevaPassword }),
        }),
      );
      expect(loginNuevo.status).toBe(200);
    });
  });
});
