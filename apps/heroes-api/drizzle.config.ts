import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: '../../packages/heroes-shared/src/db/migrations',
  schema: '../../packages/heroes-shared/src/db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
