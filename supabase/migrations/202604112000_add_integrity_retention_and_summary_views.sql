create or replace view public.integrity_daily_summary as
select
  date_trunc('day', created_at) as summary_day,
  event_type,
  count(*) as event_count,
  count(*) filter (where is_positive) as positive_count,
  count(distinct user_id) as distinct_actor_count,
  count(distinct target_user_id) filter (where target_user_id is not null) as distinct_target_count,
  count(distinct request_ip_hash) as distinct_network_count
from public.integrity_events
group by 1, 2;

create or replace view public.integrity_blocked_daily_summary as
select
  date_trunc('day', created_at) as summary_day,
  coalesce(evidence_json->>'event_type', 'blocked') as blocked_event_type,
  count(*) as blocked_count,
  count(distinct user_id) as distinct_actor_count,
  count(distinct evidence_json->>'request_ip_hash') filter (where evidence_json ? 'request_ip_hash') as distinct_network_count
from public.moderation_flags
where origin = 'integrity'
group by 1, 2;

create or replace function public.prune_old_integrity_data(
  integrity_retention_days integer default 90,
  moderation_action_retention_days integer default 365
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_integrity_events integer := 0;
  deleted_review_actions integer := 0;
begin
  if integrity_retention_days < 30 then
    raise exception 'integrity_retention_days must be at least 30';
  end if;

  if moderation_action_retention_days < 90 then
    raise exception 'moderation_action_retention_days must be at least 90';
  end if;

  delete from public.integrity_events
  where created_at < timezone('utc', now()) - make_interval(days => integrity_retention_days);

  get diagnostics deleted_integrity_events = row_count;

  delete from public.moderation_actions
  where action_type in ('review_flag', 'update_integrity_settings')
    and created_at < timezone('utc', now()) - make_interval(days => moderation_action_retention_days);

  get diagnostics deleted_review_actions = row_count;

  return jsonb_build_object(
    'deleted_integrity_events', deleted_integrity_events,
    'deleted_review_actions', deleted_review_actions
  );
end;
$$;
