create table if not exists public.game_youtube_sources (
  id uuid primary key default gen_random_uuid(),
  igdb_game_id integer not null,
  game_title text not null,
  game_cover_url text,
  channel_url text not null,
  channel_id text not null,
  uploads_playlist_id text,
  channel_title text,
  enabled boolean not null default true,
  autopost_started_at timestamptz not null default timezone('utc', now()),
  last_checked_at timestamptz,
  last_seen_video_published_at timestamptz,
  last_webhook_received_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.game_youtube_sources
drop constraint if exists game_youtube_sources_game_id_positive;

alter table public.game_youtube_sources
add constraint game_youtube_sources_game_id_positive
check (igdb_game_id > 0);

alter table public.game_youtube_sources
drop constraint if exists game_youtube_sources_channel_id_valid;

alter table public.game_youtube_sources
add constraint game_youtube_sources_channel_id_valid
check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$');

create unique index if not exists game_youtube_sources_one_enabled_per_game_idx
on public.game_youtube_sources (igdb_game_id)
where enabled;

create index if not exists game_youtube_sources_channel_id_idx
on public.game_youtube_sources (channel_id);

create table if not exists public.youtube_imported_posts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.game_youtube_sources (id) on delete cascade,
  igdb_game_id integer not null,
  channel_id text not null,
  youtube_video_id text not null,
  youtube_video_url text not null,
  youtube_video_title text,
  youtube_published_at timestamptz not null,
  post_id uuid references public.posts (id) on delete set null,
  import_status text not null default 'imported',
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.youtube_imported_posts
drop constraint if exists youtube_imported_posts_video_id_valid;

alter table public.youtube_imported_posts
add constraint youtube_imported_posts_video_id_valid
check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$');

alter table public.youtube_imported_posts
drop constraint if exists youtube_imported_posts_status_valid;

alter table public.youtube_imported_posts
add constraint youtube_imported_posts_status_valid
check (import_status in ('imported', 'skipped', 'failed'));

create unique index if not exists youtube_imported_posts_source_video_idx
on public.youtube_imported_posts (source_id, youtube_video_id);

create unique index if not exists youtube_imported_posts_game_video_idx
on public.youtube_imported_posts (igdb_game_id, youtube_video_id);

create index if not exists youtube_imported_posts_channel_idx
on public.youtube_imported_posts (channel_id, youtube_published_at desc);

alter table public.game_youtube_sources enable row level security;
alter table public.youtube_imported_posts enable row level security;

drop policy if exists "Staff can read game youtube sources" on public.game_youtube_sources;
create policy "Staff can read game youtube sources"
on public.game_youtube_sources
for select
to authenticated
using (public.is_platform_staff(auth.uid()));

drop policy if exists "Staff can read youtube imported posts" on public.youtube_imported_posts;
create policy "Staff can read youtube imported posts"
on public.youtube_imported_posts
for select
to authenticated
using (public.is_platform_staff(auth.uid()));

alter table public.moderation_actions
drop constraint if exists moderation_actions_type_valid;

alter table public.moderation_actions
add constraint moderation_actions_type_valid
check (
  action_type in (
    'ban',
    'restore',
    'promote_moderator',
    'demote_moderator',
    'promote_admin',
    'set_scope',
    'set_developer_games',
    'warning',
    'review_flag',
    'retag_post',
    'pin_post',
    'update_integrity_settings',
    'hide_content',
    'restore_content',
    'delete_content',
    'run_retention_prune',
    'set_game_youtube_source'
  )
);
