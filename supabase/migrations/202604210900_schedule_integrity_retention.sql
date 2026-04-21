create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'playthread-integrity-retention-daily'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'playthread-integrity-retention-daily',
  '17 8 * * *',
  $$
  select net.http_post(
    url := 'https://zippqumynxivnhhmvblc.supabase.co/functions/v1/integrity-retention',
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'x-retention-secret',
      (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'retention_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
