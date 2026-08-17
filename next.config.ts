import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Salida standalone: la imagen Docker multi-stage copia solo lo imprescindible.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // `pg` y Drizzle son dependencias nativas de servidor: no deben empaquetarse.
  serverExternalPackages: ['pg', 'drizzle-orm'],
  // El lint corre como paso propio en CI (`npm run lint`): Next 16 ya no lo ejecuta
  // durante el build, así que no hay nada que desactivar aquí.
  typescript: {
    // El typecheck corre como paso propio en CI (`npm run typecheck`).
    ignoreBuildErrors: false,
  },
}

export default nextConfig
