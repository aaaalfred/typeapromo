import { NextResponse } from 'next/server'
import { Client } from 'pg'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Estado de la conexión con PostgreSQL.
 * `not-configured` distingue «falta DATABASE_URL» de «la base de datos no responde».
 */
type DatabaseStatus = 'up' | 'down' | 'not-configured'

/**
 * `dev-bypass` es comprobable desde fuera a propósito (PLAN.md, «Seguridad del bypass»,
 * protección 2): permite auditar sin entrar al servidor si producción tiene el flag abierto.
 */
type AuthMode = 'dev-bypass' | 'slack'

interface HealthPayload {
  status: 'ok' | 'degraded'
  db: DatabaseStatus
  authMode: AuthMode
}

const CONNECT_TIMEOUT_MS = 3_000

function resolveAuthMode(): AuthMode {
  return process.env.AUTH_DEV_BYPASS === '1' ? 'dev-bypass' : 'slack'
}

async function checkDatabase(): Promise<DatabaseStatus> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    return 'not-configured'
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: CONNECT_TIMEOUT_MS,
  })

  try {
    await client.connect()
    await client.query('select 1')
    return 'up'
  } catch {
    // El detalle del error puede contener la cadena de conexión con credenciales:
    // se descarta deliberadamente y nunca se propaga en la respuesta.
    return 'down'
  } finally {
    await client.end().catch(() => undefined)
  }
}

export async function GET(): Promise<NextResponse<HealthPayload>> {
  const db = await checkDatabase()
  const payload: HealthPayload = {
    status: db === 'up' ? 'ok' : 'degraded',
    db,
    authMode: resolveAuthMode(),
  }

  return NextResponse.json(payload, {
    status: payload.status === 'ok' ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
}
