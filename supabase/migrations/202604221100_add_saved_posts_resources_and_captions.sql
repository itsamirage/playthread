alter table public.posts
  add column if not exists image_captions text[] not null default '{}';

create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  collection text not null default 'General',
  note text,
  notify_comments boolean not null default false,
  notify_edits boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create index if not exists saved_posts_user_created_idx on public.saved_posts (user_id, created_at desc);
create index if not exists saved_posts_post_idx on public.saved_posts (post_id);

alter table public.saved_posts enable row level security;

drop policy if exists "Users can view own saved posts" on public.saved_posts;
create policy "Users can view own saved posts"
on public.saved_posts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can manage own saved posts" on public.saved_posts;
create policy "Users can manage own saved posts"
on public.saved_posts
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Service role manages saved posts" on public.saved_posts;
create policy "Service role manages saved posts"
on public.saved_posts
for all
to service_role
using (true)
with check (true);

create table if not exists public.game_community_resources (
  id uuid primary key default gen_random_uuid(),
  igdb_game_id bigint not null,
  game_title text,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'guide',
  title text not null,
  url text,
  body text,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_community_resources_kind_valid check (kind in ('guide', 'faq', 'tip', 'link', 'build'))
);

create index if not exists game_community_resources_game_idx on public.game_community_resources (igdb_game_id, is_pinned desc, created_at desc);

alter table public.game_community_resources enable row level security;

drop policy if exists "Public can view community resources" on public.game_community_resources;
create policy "Public can view community resources"
on public.game_community_resources
for select
using (true);

drop policy if exists "Authenticated users can create community resources" on public.game_community_resources;
create policy "Authenticated users can create community resources"
on public.game_community_resources
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own community resources" on public.game_community_resources;
create policy "Users can update own community resources"
on public.game_community_resources
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own community resources" on public.game_community_resources;
create policy "Users can delete own community resources"
on public.game_community_resources
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.notify_saved_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    user_id,
    actor_user_id,
    kind,
    title,
    body,
    entity_type,
    entity_id,
    metadata_json
  )
  select
    saved_posts.user_id,
    new.user_id,
    'post_comment',
    'Saved post has a new comment',
    left(coalesce(new.body, 'Image comment'), 180),
    'post',
    new.post_id::text,
    jsonb_build_object('postId', new.post_id, 'savedPost', true)
  from public.saved_posts
  where saved_posts.post_id = new.post_id
    and saved_posts.notify_comments = true
    and saved_posts.user_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists notify_saved_post_comment_trigger on public.post_comments;
create trigger notify_saved_post_comment_trigger
after insert on public.post_comments
for each row
execute function public.notify_saved_post_comment();

create or replace function public.notify_saved_post_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.updated_at is distinct from new.updated_at and old.body is distinct from new.body then
    insert into public.notifications (
      user_id,
      actor_user_id,
      kind,
      title,
      body,
      entity_type,
      entity_id,
      metadata_json
    )
    select
      saved_posts.user_id,
      new.user_id,
      'followed_game_post',
      'Saved post was updated',
      left(coalesce(new.title, new.game_title, 'A saved post'), 180),
      'post',
      new.id::text,
      jsonb_build_object('postId', new.id, 'savedPost', true, 'gameId', new.igdb_game_id, 'gameTitle', new.game_title)
    from public.saved_posts
    where saved_posts.post_id = new.id
      and saved_posts.notify_edits = true
      and saved_posts.user_id <> new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_saved_post_edit_trigger on public.posts;
create trigger notify_saved_post_edit_trigger
after update on public.posts
for each row
execute function public.notify_saved_post_edit();
