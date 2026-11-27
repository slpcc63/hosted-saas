# Database migrations

Plain SQL files, applied in order by `scripts/migrate.mjs` and recorded in `public.schema_migrations`.

- Name: `NNNN_short_description.sql` (next free number). Never edit a file after it has run anywhere:
  write a new one.
- Don't write `BEGIN`/`COMMIT`: each file already runs in a transaction. For `CREATE INDEX CONCURRENTLY`
  put `-- migrate:no-transaction` in the first lines and keep the file to that one statement.
- `-- migrate:baseline` marks a file that describes tables older databases already have; on those
  databases it is recorded without running (`baseline` mode).
- Run them with the **Run database migrations** workflow in GitHub Actions (QA first; production needs
  the owner's approval), or locally: `MIGRATION_DATABASE_URL=… node scripts/migrate.mjs plan`.

`supabase/migrations/` is historical: nothing ever applied it automatically, and parts of it (RLS with
`auth.uid()`) assume Supabase Auth, which this app does not use. Keep it for reference only.
