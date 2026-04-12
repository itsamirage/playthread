create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  display_name text,
  avatar_url text,
  profile_url text,
  sync_status text not null default 'pending',
  last_synced_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint connected_accounts_unique_provider_user unique (provider, provider_user_id),
  constraint connected_accounts_unique_user_provider unique (user_id, provider),
  constraint connected_accounts_provider_valid check (provider in ('steam', 'xbox', 'psn')),
  constraint connected_accounts_sync_status_valid check (
    sync_status in ('pending', 'linked', 'syncing', 'error')
  )
);

create table if not exists public.external_games (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_game_id text not null,
  title text not null,
  cover_url text,
  platform text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint external_games_unique_provider_game unique (provider, provider_game_id),
  constraint external_games_provider_valid check (provider in ('steam', 'xbox', 'psn'))
);

create table if not exists public.user_game_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  provider_game_id text not null,
  completion_percent numeric(5,2),
  completed_achievement_count integer not null default 0,
  total_achievement_count integer not null default 0,
  last_synced_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_game_stats_unique_user_provider_game unique (user_id, provider, provider_game_id),
  constraint user_game_stats_provider_valid check (provider in ('steam', 'xbox', 'psn')),
  constraint user_game_stats_completion_valid check (
    completion_percent is null or (completion_percent between 0 and 100)
  ),
  constraint user_game_stats_counts_valid check (
    completed_achievement_count >= 0 and total_achievement_count >= 0
  )
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  provider_game_id text not null,
  provider_achievement_id text not null,
  title text not null,
  description text,
  icon_url text,
  is_unlocked boolean not null default false,
  unlocked_at timestamptz,
  rarity_percent numeric(5,2),
  last_synced_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_achievements_unique_user_provider_achievement unique (
    user_id,
    provider,
    provider_game_id,
    provider_achievement_id
  ),
  constraint user_achievements_provider_valid check (provider in ('steam', 'xbox', 'psn')),
  constraint user_achievements_rarity_valid check (
    rarity_percent is null or (rarity_percent between 0 and 100)
  )
);

create table if not exists public.profile_showcase_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  provider text not null,
  provider_game_id text,
  provider_achievement_id text,
  title text not null,
  subtitle text,
  image_url text,
  metadata_json jsonb not null default '{}'::jsonb,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profile_showcase_items_unique_user_position unique (user_id, position),
  constraint profile_showcase_items_kind_valid check (kind in ('game', 'achievement')),
  constraint profile_showcase_items_provider_valid check (provider in ('steam', 'xbox', 'psn')),
  constraint profile_showcase_items_position_valid check (position >= 0)
);

create index if not exists connected_accounts_user_id_idx on public.connected_accounts (user_id);
create index if not exists connected_accounts_provider_idx on public.connected_accounts (provider);
create index if not exists external_games_provider_idx on public.external_games (provider);
create index if not exists user_game_stats_user_id_idx on public.user_game_stats (user_id);
create index if not exists user_achievements_user_id_idx on public.user_achievements (user_id);
create index if not exists profile_showcase_items_user_id_idx on public.profile_showcase_items (user_id);

alter table public.connected_accounts enable row level security;
alter table public.external_games enable row level security;
alter table public.user_game_stats enable row level security;
alter table public.user_achievements enable row level security;
alter table public.profile_showcase_items enable row level security;

drop policy if exists "Users can view their own connected accounts" on public.connected_accounts;
create policy "Users can view their own connected accounts"
on public.connected_accounts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own connected accounts" on public.connected_accounts;
create policy "Users can insert their own connected accounts"
on public.connected_accounts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own connected accounts" on public.connected_accounts;
create policy "Users can update their own connected accounts"
on public.connected_accounts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own connected accounts" on public.connected_accounts;
create policy "Users can delete their own connected accounts"
on public.connected_accounts
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Authenticated users can view external games" on public.external_games;
create policy "Authenticated users can view external games"
on public.external_games
for select
to authenticated
using (true);

drop policy if exists "Service role manages external games" on public.external_games;
create policy "Service role manages external games"
on public.external_games
for all
to service_role
using (true)
with check (true);

drop policy if exists "Users can view their own game stats" on public.user_game_stats;
create policy "Users can view their own game stats"
on public.user_game_stats
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can manage their own game stats" on public.user_game_stats;
create policy "Users can manage their own game stats"
on public.user_game_stats
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own achievements" on public.user_achievements;
create policy "Users can view their own achievements"
on public.user_achievements
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can manage their own achievements" on public.user_achievements;
create policy "Users can manage their own achievements"
on public.user_achievements
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view all showcase items" on public.profile_showcase_items;
create policy "Users can view all showcase items"
on public.profile_showcase_items
for select
to authenticated
using (true);

drop policy if exists "Users can manage their own showcase items" on public.profile_showcase_items;
create policy "Users can manage their own showcase items"
on public.profile_showcase_items
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
