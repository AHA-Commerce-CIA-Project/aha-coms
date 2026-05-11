import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './packages/shared/src/db/migrations',
  schema: './packages/shared/src/db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
