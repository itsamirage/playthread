-- PlayThread Phase 1 schema
-- Run this in the Supabase SQL Editor.

create extension if not exists "pgcrypto";

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fallback_username text;
begin
  fallback_username := 'user_' || substring(replace(new.id::text, '-', '') from 1 for 12);

  insert into public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    bio,
    genres,
    linked_platforms,
    created_at
  )
  values (
    new.id,
    fallback_username,
    fallback_username,
    null,
    null,
    '{}',
    '{}',
    timezone('utc', now())
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  genres text[] not null default '{}',
  linked_platforms text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  constraint profiles_username_length check (char_length(username) between 3 and 20),
  constraint profiles_username_trimmed check (username = btrim(username)),
  constraint profiles_username_format check (username ~ '^[ -~]+$'),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 160),
  constraint profiles_linked_platforms_valid check (
    linked_platforms <@ array['steam', 'xbox', 'psn']::text[]
  )
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  igdb_game_id integer not null,
  game_title text not null,
  game_cover_url text,
  play_status text not null default 'currently_playing',
  created_at timestamptz not null default timezone('utc', now()),
  constraint follows_unique_user_game unique (user_id, igdb_game_id),
  constraint follows_play_status_valid check (
    play_status in ('have_not_played', 'currently_playing', 'taking_a_break', 'completed')
  )
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  igdb_game_id integer not null,
  game_title text not null,
  game_cover_url text,
  type text not null,
  reaction_mode text not null default 'sentiment',
  title text,
  body text not null default '',
  rating numeric(2,1),
  image_url text,
  image_urls text[] not null default '{}',
  spoiler boolean not null default false,
  spoiler_tag text,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint posts_type_valid check (type in ('review', 'discussion', 'screenshot', 'clip', 'guide', 'tip', 'image')),
  constraint posts_reaction_mode_valid check (reaction_mode in ('utility', 'sentiment', 'appreciation')),
  constraint posts_rating_valid check (rating is null or rating between 0.5 and 5.0),
  constraint posts_likes_count_valid check (likes_count >= 0),
  constraint posts_comments_count_valid check (comments_count >= 0)
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint likes_unique_user_post unique (user_id, post_id)
);

create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  reaction_type text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint post_reactions_unique_user_post unique (user_id, post_id),
  constraint post_reactions_type_valid check (
    reaction_type in ('like', 'dislike', 'helpful', 'not_helpful', 'respect')
  )
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint post_comments_body_length check (char_length(btrim(body)) between 1 and 600)
);

create table if not exists public.game_cache (
  igdb_game_id integer primary key,
  title text not null,
  cover_url text,
  genre text,
  studio text,
  release_year integer,
  metacritic integer,
  summary text,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint game_cache_metacritic_valid check (
    metacritic is null or (metacritic between 0 and 100)
  )
);

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

create index if not exists follows_user_id_idx on public.follows (user_id);
create index if not exists follows_igdb_game_id_idx on public.follows (igdb_game_id);
create index if not exists posts_user_id_idx on public.posts (user_id);
create index if not exists posts_igdb_game_id_idx on public.posts (igdb_game_id);
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists likes_user_id_idx on public.likes (user_id);
create index if not exists likes_post_id_idx on public.likes (post_id);
create index if not exists post_reactions_user_id_idx on public.post_reactions (user_id);
create index if not exists post_reactions_post_id_idx on public.post_reactions (post_id);
create index if not exists post_comments_user_id_idx on public.post_comments (user_id);
create index if not exists post_comments_post_id_idx on public.post_comments (post_id);
create index if not exists post_comments_created_at_idx on public.post_comments (created_at desc);
create index if not exists connected_accounts_user_id_idx on public.connected_accounts (user_id);
create index if not exists connected_accounts_provider_idx on public.connected_accounts (provider);
create index if not exists external_games_provider_idx on public.external_games (provider);
create index if not exists user_game_stats_user_id_idx on public.user_game_stats (user_id);
create index if not exists user_achievements_user_id_idx on public.user_achievements (user_id);
create index if not exists profile_showcase_items_user_id_idx on public.profile_showcase_items (user_id);

create or replace function public.sync_post_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := coalesce(new.post_id, old.post_id);

  update public.posts
  set comments_count = (
    select count(*)
    from public.post_comments
    where post_id = target_post_id
  )
  where id = target_post_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_post_comments_count_on_insert on public.post_comments;
create trigger sync_post_comments_count_on_insert
after insert on public.post_comments
for each row
execute function public.sync_post_comments_count();

drop trigger if exists sync_post_comments_count_on_delete on public.post_comments;
create trigger sync_post_comments_count_on_delete
after delete on public.post_comments
for each row
execute function public.sync_post_comments_count();

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;
alter table public.game_cache enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.external_games enable row level security;
alter table public.user_game_stats enable row level security;
alter table public.user_achievements enable row level security;
alter table public.profile_showcase_items enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Users can delete their own profile"
on public.profiles
for delete
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can view all follows" on public.follows;
create policy "Users can view all follows"
on public.follows
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own follows" on public.follows;
create policy "Users can insert their own follows"
on public.follows
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own follows" on public.follows;
create policy "Users can update their own follows"
on public.follows
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own follows" on public.follows;
create policy "Users can delete their own follows"
on public.follows
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can view all posts" on public.posts;
create policy "Users can view all posts"
on public.posts
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own posts" on public.posts;
create policy "Users can insert their own posts"
on public.posts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts"
on public.posts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts"
on public.posts
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can view all likes" on public.likes;
create policy "Users can view all likes"
on public.likes
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own likes" on public.likes;
create policy "Users can insert their own likes"
on public.likes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own likes" on public.likes;
create policy "Users can delete their own likes"
on public.likes
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can view all post reactions" on public.post_reactions;
create policy "Users can view all post reactions"
on public.post_reactions
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own post reactions" on public.post_reactions;
create policy "Users can insert their own post reactions"
on public.post_reactions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own post reactions" on public.post_reactions;
create policy "Users can update their own post reactions"
on public.post_reactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own post reactions" on public.post_reactions;
create policy "Users can delete their own post reactions"
on public.post_reactions
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can view all post comments" on public.post_comments;
create policy "Users can view all post comments"
on public.post_comments
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own post comments" on public.post_comments;
create policy "Users can insert their own post comments"
on public.post_comments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own post comments" on public.post_comments;
create policy "Users can delete their own post comments"
on public.post_comments
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Authenticated users can view game cache" on public.game_cache;
create policy "Authenticated users can view game cache"
on public.game_cache
for select
to authenticated
using (true);

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

alter table public.integrity_events
drop constraint if exists integrity_events_type_valid;

alter table public.integrity_events
add constraint integrity_events_type_valid check (
  event_type in (
    'post_create',
    'comment_create',
    'post_reaction',
    'comment_reaction',
    'coin_gift',
    'coin_adjustment',
    'store_spend',
    'clip_upload'
  )
);
