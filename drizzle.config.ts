import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

// `src/db/schema` lo define la fase de modelo de datos; este fichero solo apunta a él.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema',
  out: './drizzle',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})
