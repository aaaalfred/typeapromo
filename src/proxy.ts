/**
 * Proxy (lo que hasta Next.js 15 se llamaba middleware; el fichero
 * `middleware.ts` está deprecado en 16 y el runtime de `proxy.ts` es Node.js y
 * no configurable).
 *
 * Protege `/app/**` y deja públicas la portada, `/f/**`, `/api/health`,
 * `/api/auth/**` y las páginas de sesión.
 *
 * La comprobación es **optimista**: solo mira si existe la cookie de sesión, sin
 * consultar la base de datos. Es lo que recomienda la documentación de Next
 * («Proxy no debe usarse como solución completa de gestión de sesión o
 * autorización») y evita una consulta por cada navegación. La autorización real
 * —sesión válida en PostgreSQL y workspace correcto— la hace `requiereSesion()`
 * de `@/lib/auth/sesion` en las páginas y rutas de `/app/**`.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { hayCookieDeSesion } from '@/lib/auth/cookies';
import { esRutaProtegida, esRutaPublica, PARAM_DESTINO, RUTA_LOGIN } from '@/lib/auth/rutas';

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (esRutaPublica(pathname) || !esRutaProtegida(pathname)) {
    return NextResponse.next();
  }

  const nombresDeCookie = request.cookies.getAll().map((cookie) => cookie.name);
  if (hayCookieDeSesion(nombresDeCookie)) {
    return NextResponse.next();
  }

  const destino = request.nextUrl.clone();
  destino.pathname = RUTA_LOGIN;
  destino.search = '';
  destino.searchParams.set(PARAM_DESTINO, `${pathname}${search}`);
  return NextResponse.redirect(destino);
}

export const config = {
  /**
   * Se excluyen los estáticos de Next y el favicon: sin esto el proxy correría
   * también sobre CSS, JS e imágenes.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
