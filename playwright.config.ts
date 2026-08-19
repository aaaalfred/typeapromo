import path from 'node:path'
import process from 'node:process'

import { defineConfig, devices } from '@playwright/test'

/**
 * Suite end-to-end (fase 8).
 *
 * Tres decisiones que conviene conocer:
 *
 * 1. **Puerto 3100, no 3000.** El 3000 se lo suele quedar cualquier otro
 *    proyecto de Node en la máquina, y el fallo resultante —una aplicación
 *    ajena respondiendo 404— cuesta mucho más de diagnosticar que de evitar.
 *
 * 2. **`AUTH_DEV_BYPASS=1`.** Slack exige redirecciones por HTTPS y no se puede
 *    automatizar contra el workspace real; PLAN.md §2.3 resuelve precisamente
 *    esto con el acceso directo tras flag. La protección 3 (`npm run
 *    verify:bypass`) garantiza aparte que la variable no llega a producción.
 *
 * 3. **Se prueba contra el servidor de producción, no `next dev`.** Compilar
 *    tarda más, pero `next dev` no ejerce el mismo código: sin él, los fallos
 *    que solo aparecen en el build se descubren en el despliegue.
 */

const PUERTO = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://127.0.0.1:${PUERTO}`

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://typeapromo:typeapromo@localhost:5432/typeapromo'

export default defineConfig({
  testDir: path.join(import.meta.dirname, 'e2e'),
  outputDir: path.join(import.meta.dirname, '.playwright'),

  // En CI nadie mira una ejecución a medias: que falle rápido y del todo.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  },

  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    // PR.md pide prioridad móvil y prueba responsiva; sin un proyecto móvil, la
    // parte de la interfaz que más se usa no la prueba nadie.
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: `npm run build && npx next start --port ${PUERTO}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL,
      AUTH_DEV_BYPASS: '1',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'secreto-solo-para-pruebas-e2e',
      AUTH_URL: BASE_URL,
      PUBLIC_BASE_URL: BASE_URL,
      R2_ENDPOINT: process.env.R2_ENDPOINT ?? 'http://localhost:9000',
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? 'minioadmin',
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? 'minioadmin',
      R2_BUCKET_STAGING: 'forms-media-staging',
      R2_BUCKET_PUBLIC: 'forms-media-public',
      MEDIA_PUBLIC_BASE_URL: 'http://localhost:9000/forms-media-public',
      S3_FORCE_PATH_STYLE: '1',
      CLEANUP_SECRET: 'secreto-limpieza-e2e',
    },
  },
})
