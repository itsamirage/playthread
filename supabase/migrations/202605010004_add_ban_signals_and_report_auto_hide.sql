create table if not exists public.moderation_ban_signals (
  id uuid primary key default gen_random_uuid(),
  signal_type text not null,
  signal_hash text not null,
  source_user_id uuid references public.profiles (id) on delete cascade,
  banned_by uuid references public.profiles (id) on delete set null,
  reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint moderation_ban_signals_type_valid check (signal_type in ('network', 'device')),
  constraint moderation_ban_signals_unique_signal unique (signal_type, signal_hash, source_user_id)
);

create index if not exists moderation_ban_signals_lookup_idx
on public.moderation_ban_signals (signal_type, signal_hash, is_active);

create index if not exists moderation_ban_signals_source_user_idx
on public.moderation_ban_signals (source_user_id, is_active);

drop trigger if exists set_moderation_ban_signals_updated_at on public.moderation_ban_signals;
create trigger set_moderation_ban_signals_updated_at
before update on public.moderation_ban_signals
for each row
execute function public.set_updated_at();

alter table public.moderation_ban_signals enable row level security;

drop policy if exists "Staff can view moderation ban signals" on public.moderation_ban_signals;
create policy "Staff can view moderation ban signals"
on public.moderation_ban_signals
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and account_role in ('moderator', 'admin', 'owner')
  )
);

drop policy if exists "Service role manages moderation ban signals" on public.moderation_ban_signals;
create policy "Service role manages moderation ban signals"
on public.moderation_ban_signals
for all
to service_role
using (true)
with check (true);
