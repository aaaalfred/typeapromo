import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Configuración de tests.
 *
 * El entorno es `jsdom` para todo: la mayoría de los tests son de lógica pura y
 * les da igual, y así los de componentes no necesitan opt-in por fichero (una
 * anotación que se olvida y produce fallos desconcertantes).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
