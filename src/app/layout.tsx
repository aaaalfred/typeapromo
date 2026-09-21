import type { Metadata, Viewport } from 'next'

import { FranjaAvisoBypass } from '@/lib/auth/aviso-bypass'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Typeapromo',
    template: '%s · Typeapromo',
  },
  description: 'Formularios conversacionales para equipos.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {/*
          Protección 2 de PLAN.md · «Seguridad del bypass»: el aviso va en el
          layout raíz para que cubra toda la interfaz, no solo las pantallas de
          sesión. Se autogestiona: devuelve `null` sin `AUTH_DEV_BYPASS`, así
          que en producción no pinta nada.
        */}
        <FranjaAvisoBypass />
        {children}
      </body>
    </html>
  )
}
