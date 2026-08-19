/**
 * Franja de aviso del bypass de autenticación.
 *
 * Protección 2 de PLAN.md · «Seguridad del bypass»: con el acceso directo
 * activo la interfaz lo dice de forma permanente y visible, para que nadie
 * confunda un entorno abierto con uno protegido.
 *
 * Es un componente de servidor y se autogestiona: devuelve `null` cuando el
 * bypass está apagado, así que montarlo en el layout raíz no tiene efecto en
 * producción.
 *
 *     import { FranjaAvisoBypass } from '@/lib/auth/aviso-bypass';
 *     …
 *     <body>
 *       <FranjaAvisoBypass />
 *       {children}
 *     </body>
 */

import { TriangleAlert } from 'lucide-react';

import { esBypassActivo } from './entorno';

export function FranjaAvisoBypass() {
  if (!esBypassActivo()) return null;

  return (
    <div
      role="alert"
      aria-label="Aviso de seguridad"
      className="sticky top-0 z-50 flex w-full items-center justify-center gap-2 border-b border-amber-500 bg-amber-300 px-4 py-2 text-center text-sm font-medium text-amber-950"
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      <p>
        <strong className="font-semibold">Acceso sin credenciales activo</strong>
        {'. '}
        Cualquiera con acceso a esta dirección puede entrar al panel. Es un modo de
        desarrollo: <code className="font-mono">AUTH_DEV_BYPASS</code> no debe existir en
        producción.
      </p>
    </div>
  );
}
