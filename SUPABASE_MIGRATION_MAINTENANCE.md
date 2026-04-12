# Supabase Migration Maintenance

This project has three legacy shorthand remote migration versions that still appear in `supabase migration list --linked`:

- `20260408`
- `20260410`
- `20260411`

Local compatibility files exist as:

- `supabase/migrations/20260408_legacy.sql`
- `supabase/migrations/20260410_legacy.sql`
- `supabase/migrations/20260411_legacy.sql`

They are intentionally idempotent and exist only to keep `db push --include-all` workable.

## Safe Push Sequence

When `supabase db push --include-all` fails with:

`Remote migration versions not found in local migrations directory`

run:

```powershell
$env:SUPABASE_ACCESS_TOKEN='...'
npm.cmd exec supabase -- migration repair --status reverted 20260408 20260410 20260411
npm.cmd exec supabase -- db push --include-all
```

## Why This Exists

Earlier remote migration history used shorthand versions without descriptive filenames. The current local repo uses real migration files. Supabase CLI still surfaces the mismatch in `migration list --linked`, even though the schema is deployable.

## If You Want To Fully Normalize It

Do it deliberately, not ad hoc:

1. Freeze deploys briefly.
2. Export current remote schema and migration history.
3. Decide whether to keep shorthand versions or replace them fully.
4. Repair history in one pass and verify on a fresh clone.
5. Remove the `_legacy.sql` files only after `migration list --linked` is clean and `db push` works without repair.
