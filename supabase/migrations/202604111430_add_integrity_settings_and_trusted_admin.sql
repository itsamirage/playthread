create table if not exists public.integrity_settings (
  id boolean primary key default true,
  lookback_days integer not null default 7,
  max_distinct_accounts_per_ip integer not null default 5,
  max_distinct_positive_accounts_per_post integer not null default 3,
  max_distinct_positive_accounts_per_comment integer not null default 3,
  max_distinct_positive_accounts_per_target integer not null default 4,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint integrity_settings_singleton check (id = true),
  constraint integrity_settings_lookback_days_valid check (lookback_days between 1 and 60),
  constraint integrity_settings_accounts_per_ip_valid check (max_distinct_accounts_per_ip between 1 and 20),
  constraint integrity_settings_accounts_per_post_valid check (max_distinct_positive_accounts_per_post between 1 and 20),
  constraint integrity_settings_accounts_per_comment_valid check (max_distinct_positive_accounts_per_comment between 1 and 20),
  constraint integrity_settings_accounts_per_target_valid check (max_distinct_positive_accounts_per_target between 1 and 20)
);

insert into public.integrity_settings (
  id,
  lookback_days,
  max_distinct_accounts_per_ip,
  max_distinct_positive_accounts_per_post,
  max_distinct_positive_accounts_per_comment,
  max_distinct_positive_accounts_per_target
)
values (true, 7, 5, 3, 3, 4)
on conflict (id) do nothing;

alter table public.integrity_settings enable row level security;

drop policy if exists "Staff can view integrity settings" on public.integrity_settings;
create policy "Staff can view integrity settings"
on public.integrity_settings
for select
to authenticated
using (public.is_platform_staff(auth.uid()));

drop policy if exists "Service role manages integrity settings" on public.integrity_settings;
create policy "Service role manages integrity settings"
on public.integrity_settings
for all
to service_role
using (true)
with check (true);

create or replace function public.block_direct_admin_profile_field_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  request_role text := current_setting('request.jwt.claim.role', true);
begin
  if request_role = 'service_role' then
    return new;
  end if;

  if
    new.account_role is distinct from old.account_role
    or new.moderation_scope is distinct from old.moderation_scope
    or new.moderation_game_ids is distinct from old.moderation_game_ids
    or new.is_banned is distinct from old.is_banned
    or new.banned_at is distinct from old.banned_at
    or new.banned_reason is distinct from old.banned_reason
    or new.integrity_exempt is distinct from old.integrity_exempt
  then
    raise exception 'Admin-only profile fields must be changed through trusted server functions.';
  end if;

  return new;
end;
$$;

drop trigger if exists block_direct_admin_profile_field_changes on public.profiles;
create trigger block_direct_admin_profile_field_changes
before update on public.profiles
for each row
execute function public.block_direct_admin_profile_field_changes();

drop policy if exists "Staff can update moderation flags" on public.moderation_flags;
drop policy if exists "Admins can insert moderation actions" on public.moderation_actions;

drop policy if exists "Service role manages moderation flags" on public.moderation_flags;
create policy "Service role manages moderation flags"
on public.moderation_flags
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages moderation actions" on public.moderation_actions;
create policy "Service role manages moderation actions"
on public.moderation_actions
for all
to service_role
using (true)
with check (true);
