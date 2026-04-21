# Retention Operations

PlayThread has two retention paths:

- Owner manual prune from `/admin`
- Scheduled prune through the `integrity-retention` Edge Function

## Scheduled Function

`supabase/migrations/202604210900_schedule_integrity_retention.sql` installs a daily cron job:

- job name: `playthread-integrity-retention-daily`
- schedule: `17 8 * * *` UTC
- target: `https://zippqumynxivnhhmvblc.supabase.co/functions/v1/integrity-retention`

Deploy `integrity-retention`, then set these Supabase secrets:

```powershell
npm.cmd exec supabase -- secrets set RETENTION_CRON_SECRET="<long random secret>"
npm.cmd exec supabase -- secrets set INTEGRITY_RETENTION_DAYS="90"
npm.cmd exec supabase -- secrets set MODERATION_ACTION_RETENTION_DAYS="365"
npm.cmd exec supabase -- secrets set INTEGRITY_REPORT_DAYS="14"
npm.cmd exec supabase -- db query --linked "select vault.create_secret('<same long random secret>', 'retention_cron_secret');"
```

Call the function with `POST` and the `x-retention-secret` header. The function:

- runs `public.prune_old_integrity_data(...)`
- uses minimum windows of 30 days for integrity events and 90 days for moderation actions
- returns the recent `public.integrity_daily_summary` rows for operational reporting

Recommended production cadence: daily. The current database cron job already follows that cadence.

The manual owner prune should stay available for one-off cleanup and verification, but scheduled retention should be the routine path.
