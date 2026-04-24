# COMS Portal

## Database Migrations

- **Never hand-write Drizzle migration files or journal entries.** Always use `drizzle-kit generate` to produce migrations from schema changes. Drizzle manages the `when` timestamps in `meta/_journal.json` — manually setting them causes silent migration skips in production due to Drizzle's high-water-mark comparison.
- If you need a data-only migration (e.g. `UPDATE` statements with no schema change), make a trivial schema annotation change so `drizzle-kit generate` creates the journal entry, then replace the SQL content in the generated `.sql` file. This ensures the `when` timestamp is correct.
- Run migrations via CI (`bun run --cwd apps/api db:migrate`). The deploy workflow handles Cloud SQL Auth Proxy setup automatically.
