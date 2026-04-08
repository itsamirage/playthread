-- PlayThread Phase 1 schema
-- Run this in the Supabase SQL Editor.

create extension if not exists "pgcrypto";

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    split_part(new.email, '@', 1),
    split_part(new.email, '@', 1),
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
  constraint profiles_username_format check (username ~ '^[a-z0-9_]+$'),
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
  title text,
  body text not null default '',
  rating numeric(2,1),
  image_url text,
  spoiler boolean not null default false,
  spoiler_tag text,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint posts_type_valid check (type in ('review', 'discussion', 'screenshot', 'clip')),
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

create index if not exists follows_user_id_idx on public.follows (user_id);
create index if not exists follows_igdb_game_id_idx on public.follows (igdb_game_id);
create index if not exists posts_user_id_idx on public.posts (user_id);
create index if not exists posts_igdb_game_id_idx on public.posts (igdb_game_id);
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists likes_user_id_idx on public.likes (user_id);
create index if not exists likes_post_id_idx on public.likes (post_id);

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.game_cache enable row level security;

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

drop policy if exists "Authenticated users can view game cache" on public.game_cache;
create policy "Authenticated users can view game cache"
on public.game_cache
for select
to authenticated
using (true);
