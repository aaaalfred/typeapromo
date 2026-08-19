/**
 * Portada.
 *
 * No tiene contenido propio: el producto empieza en el panel. Redirige alli y
 * deja que el middleware decida, que es quien ya sabe hacerlo — a quien no
 * tenga sesion lo manda al login con `?destino=`, de modo que vuelve al panel
 * despues de entrar. Resolverlo aqui leyendo la sesion duplicaria esa decision
 * en dos sitios.
 */

import { redirect } from 'next/navigation'

import { RUTA_PANEL } from '@/lib/auth/rutas'

export const runtime = 'nodejs'

export default function HomePage(): never {
  redirect(RUTA_PANEL)
}
