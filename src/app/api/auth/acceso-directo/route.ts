/**
 * `POST /api/auth/acceso-directo` — entrada sin credenciales.
 *
 * Solo existe con `AUTH_DEV_BYPASS=1`; en cualquier otro caso responde 404, sin
 * pistas de que la ruta esté ahí. Es una ruta estática, así que Next la resuelve
 * antes que el comodín `[...nextauth]`.
 *
 * Crea una sesión persistida en `auth_sessions` y escribe la misma cookie que
 * usa Auth.js, de modo que `auth()`, `signOut()` y la caducidad funcionan sin
 * ninguna rama especial en el resto de la aplicación.
 */

import { NextResponse } from 'next/server';

import { crearSesionDeAccesoDirecto } from '@/lib/auth/acceso-directo';
import { nombreCookieSesion } from '@/lib/auth/cookies';
import { esBypassActivo } from '@/lib/auth/entorno';
import { normalizarDestino, PARAM_DESTINO } from '@/lib/auth/rutas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * URL base de la petición, respetando el proxy inverso si lo hay.
 *
 * El anfitrión **no** puede salir de `request.url`: bajo `next start`, Next lo
 * normaliza a `localhost:<puerto>` e ignora la cabecera `Host`. Con la
 * aplicación servida en cualquier otra dirección —`127.0.0.1`, un nombre de
 * host, un contenedor— el navegador enviaba `Origin` con esa dirección real y
 * la comprobación de origen la rechazaba con un 403 imposible de diagnosticar.
 * Se prefiere, en este orden: `x-forwarded-host`, `host` y, como último
 * recurso, lo que diga la URL.
 */
function urlBase(request: Request): URL {
  const url = new URL(request.url);

  const anfitrion = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (anfitrion !== null && anfitrion.trim() !== '') {
    // `x-forwarded-host` puede traer una lista si hay varios saltos; manda el primero.
    const primero = anfitrion.split(',')[0]?.trim();
    if (primero !== undefined && primero !== '') {
      url.host = primero;
    }
  }

  const protocolo = request.headers.get('x-forwarded-proto');
  if (protocolo === 'https' || protocolo === 'http') {
    url.protocol = `${protocolo}:`;
  }
  return url;
}

/**
 * Rechaza envíos desde otro origen. El navegador manda `Origin` en los POST de
 * formulario; si falta (curl, scripts de CI) se deja pasar.
 */
function origenPermitido(request: Request, base: URL): boolean {
  const origen = request.headers.get('origin');
  return origen === null || origen === base.origin;
}

export async function POST(request: Request): Promise<Response> {
  if (!esBypassActivo()) {
    return new NextResponse('No encontrado', { status: 404 });
  }

  const base = urlBase(request);
  if (!origenPermitido(request, base)) {
    return new NextResponse('Origen no permitido', { status: 403 });
  }

  const formulario = await request.formData().catch(() => null);
  const destino = normalizarDestino(formulario?.get(PARAM_DESTINO));

  const { token, expira } = await crearSesionDeAccesoDirecto();

  // 303 y no 307: la respuesta a un POST debe seguirse con un GET.
  //
  // `Location` relativo a propósito. `NextResponse.redirect` exige una URL
  // absoluta, y una absoluta mal calculada manda al navegador a otro origen —y
  // la cookie recién puesta se queda atrás. Un destino relativo lo resuelve el
  // propio navegador contra la dirección por la que ha entrado, que siempre es
  // la correcta.
  const respuesta = new NextResponse(null, {
    status: 303,
    headers: { Location: destino },
  });
  respuesta.cookies.set({
    name: nombreCookieSesion(base.protocol === 'https:'),
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: base.protocol === 'https:',
    expires: expira,
  });

  return respuesta;
}
