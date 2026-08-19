/**
 * Layout de las páginas de sesión (login y acceso denegado).
 *
 * Deliberadamente sin navegación: son pantallas sin sesión, y cualquier enlace
 * al panel acabaría en una redirección de vuelta.
 */

import type { ReactNode } from 'react';

// La franja de aviso del bypass se monta ahora en el layout raíz, para que
// cubra toda la interfaz. Aquí se quitó para no pintarla dos veces.

export default function LayoutAutenticacion({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
