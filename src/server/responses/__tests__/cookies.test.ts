/**
 * Cookie de sesión. Módulo puro: no hace falta PostgreSQL.
 *
 * Lo que se fija aquí es el contrato de PLAN.md · §2.1: `HttpOnly`,
 * `SameSite=Lax` y **una cookie por formulario**, para que responder a un
 * segundo formulario no pise la sesión del primero.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_EDAD_COOKIE_SEGUNDOS,
  debeSerSegura,
  esCookieDeSesion,
  nombreCookieSesion,
  opcionesBorradoCookie,
  opcionesCookieSesion,
} from '../cookies';

const FORM_A = '11111111-1111-4111-8111-111111111111';
const FORM_B = '22222222-2222-4222-8222-222222222222';

describe('nombreCookieSesion', () => {
  it('da un nombre distinto por formulario', () => {
    expect(nombreCookieSesion(FORM_A)).not.toBe(nombreCookieSesion(FORM_B));
  });

  it('produce un nombre de cookie válido', () => {
    expect(nombreCookieSesion(FORM_A)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('se reconoce con `esCookieDeSesion`', () => {
    expect(esCookieDeSesion(nombreCookieSesion(FORM_A))).toBe(true);
    expect(esCookieDeSesion('authjs.session-token')).toBe(false);
  });
});

describe('opcionesCookieSesion', () => {
  it('es HttpOnly y SameSite=Lax, con alcance a todo el sitio', () => {
    const opciones = opcionesCookieSesion(false);
    expect(opciones.httpOnly).toBe(true);
    expect(opciones.sameSite).toBe('lax');
    expect(opciones.path).toBe('/');
    expect(opciones.maxAge).toBe(MAX_EDAD_COOKIE_SEGUNDOS);
  });

  it('propaga la marca de segura', () => {
    expect(opcionesCookieSesion(true).secure).toBe(true);
    expect(opcionesCookieSesion(false).secure).toBe(false);
  });
});

describe('opcionesBorradoCookie', () => {
  it('caduca la cookie sin cambiar el resto de atributos', () => {
    const borrado = opcionesBorradoCookie(true);
    expect(borrado.maxAge).toBe(0);
    expect(borrado.httpOnly).toBe(true);
    expect(borrado.sameSite).toBe('lax');
    expect(borrado.secure).toBe(true);
  });
});

describe('debeSerSegura', () => {
  it('marca segura solo cuando la aplicación se sirve por HTTPS', () => {
    expect(debeSerSegura('https://formularios.example.com')).toBe(true);
    expect(debeSerSegura('HTTPS://Formularios.Example.com')).toBe(true);
    expect(debeSerSegura('http://localhost:3000')).toBe(false);
    expect(debeSerSegura('')).toBe(false);
    expect(debeSerSegura(undefined)).toBe(false);
  });
});
