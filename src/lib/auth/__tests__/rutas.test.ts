import { describe, expect, it } from 'vitest';

import { esCookieDeSesion, hayCookieDeSesion, nombreCookieSesion } from '../cookies';
import {
  esRutaProtegida,
  esRutaPublica,
  normalizarDestino,
  RUTA_PANEL,
  urlDeAccesoDenegado,
  urlDeLogin,
} from '../rutas';

describe('esRutaPublica', () => {
  it.each([
    '/',
    '/api/health',
    '/f',
    '/f/mi-formulario',
    '/f/mi-formulario/gracias',
    '/api/auth/signin',
    '/api/auth/callback/slack',
    '/api/auth/acceso-directo',
    '/iniciar-sesion',
    '/acceso-denegado',
  ])('deja pública %s', (ruta) => {
    expect(esRutaPublica(ruta)).toBe(true);
  });

  it.each(['/app', '/app/formularios', '/api/forms', '/formularios', '/api/healthz'])(
    'no considera pública %s',
    (ruta) => {
      expect(esRutaPublica(ruta)).toBe(false);
    },
  );

  it('compara por segmento, no por prefijo de cadena', () => {
    expect(esRutaPublica('/formulario')).toBe(false);
    expect(esRutaPublica('/api/authentication')).toBe(false);
  });

  it('tolera la barra final', () => {
    expect(esRutaPublica('/f/mi-formulario/')).toBe(true);
    expect(esRutaPublica('/api/health/')).toBe(true);
  });
});

describe('esRutaProtegida', () => {
  it.each(['/app', '/app/', '/app/formularios', '/app/formularios/123/editar'])(
    'protege %s',
    (ruta) => {
      expect(esRutaProtegida(ruta)).toBe(true);
    },
  );

  it.each(['/', '/application', '/f/x', '/api/health'])('no protege %s', (ruta) => {
    expect(esRutaProtegida(ruta)).toBe(false);
  });
});

describe('normalizarDestino', () => {
  it('conserva una ruta interna con query', () => {
    expect(normalizarDestino('/app/formularios?estado=draft')).toBe('/app/formularios?estado=draft');
  });

  it.each([
    ['una URL absoluta', 'https://evil.example/robar'],
    ['un protocolo relativo', '//evil.example/robar'],
    ['una barra invertida', '/\\evil.example'],
    ['una ruta relativa', 'app/formularios'],
    ['un valor que no es cadena', 42],
    ['undefined', undefined],
  ])('descarta %s y cae al panel', (_caso, destino) => {
    expect(normalizarDestino(destino)).toBe(RUTA_PANEL);
  });

  it('evita el bucle de volver al propio login o al aviso de rechazo', () => {
    expect(normalizarDestino('/iniciar-sesion')).toBe(RUTA_PANEL);
    expect(normalizarDestino('/acceso-denegado?motivo=workspace-ajeno')).toBe(RUTA_PANEL);
  });
});

describe('urlDeLogin', () => {
  it('no añade destino cuando es el panel por defecto', () => {
    expect(urlDeLogin()).toBe('/iniciar-sesion');
    expect(urlDeLogin('https://evil.example')).toBe('/iniciar-sesion');
  });

  it('codifica el destino', () => {
    expect(urlDeLogin('/app/formularios?estado=draft')).toBe(
      '/iniciar-sesion?destino=%2Fapp%2Fformularios%3Festado%3Ddraft',
    );
  });
});

describe('urlDeAccesoDenegado', () => {
  it('lleva el motivo en la query', () => {
    expect(urlDeAccesoDenegado('workspace-ajeno')).toBe('/acceso-denegado?motivo=workspace-ajeno');
  });
});

describe('cookies de sesión', () => {
  it('usa el prefijo __Secure- solo sobre HTTPS', () => {
    expect(nombreCookieSesion(false)).toBe('authjs.session-token');
    expect(nombreCookieSesion(true)).toBe('__Secure-authjs.session-token');
  });

  it.each([
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'authjs.session-token.0',
    '__Secure-authjs.session-token.1',
  ])('reconoce %s', (nombre) => {
    expect(esCookieDeSesion(nombre)).toBe(true);
  });

  it.each(['authjs.csrf-token', 'authjs.callback-url', 'session-token', 'otra'])(
    'no confunde %s con la cookie de sesión',
    (nombre) => {
      expect(esCookieDeSesion(nombre)).toBe(false);
    },
  );

  it('detecta la sesión entre el resto de cookies', () => {
    expect(hayCookieDeSesion(['authjs.csrf-token', 'authjs.session-token'])).toBe(true);
    expect(hayCookieDeSesion(['authjs.csrf-token', 'authjs.callback-url'])).toBe(false);
    expect(hayCookieDeSesion([])).toBe(false);
  });
});
