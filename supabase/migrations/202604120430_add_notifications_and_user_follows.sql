create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_follows_unique_pair unique (follower_user_id, target_user_id),
  constraint user_follows_no_self_follow check (follower_user_id <> target_user_id)
);

create index if not exists user_follows_follower_idx on public.user_follows (follower_user_id);
create index if not exists user_follows_target_idx on public.user_follows (target_user_id);

alter table public.user_follows enable row level security;

drop policy if exists "Users can view all user follows" on public.user_follows;
create policy "Users can view all user follows"
on public.user_follows
for select
to authenticated
using (true);

drop policy if exists "Users can insert own user follows" on public.user_follows;
create policy "Users can insert own user follows"
on public.user_follows
for insert
to authenticated
with check (auth.uid() = follower_user_id);

drop policy if exists "Users can delete own user follows" on public.user_follows;
create policy "Users can delete own user follows"
on public.user_follows
for delete
to authenticated
using (auth.uid() = follower_user_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_user_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz,
  constraint notifications_kind_valid check (
    kind in (
      'post_comment',
      'coin_gift_received',
      'moderation_warning',
      'followed_game_post',
      'new_follower'
    )
  )
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_read_idx on public.notifications (user_id, is_read);

alter table public.notifications enable row level security;

drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Service role manages notifications" on public.notifications;
create policy "Service role manages notifications"
on public.notifications
for all
to service_role
using (true)
with check (true);

create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  follower_name text;
begin
  select coalesce(display_name, username, 'player')
  into follower_name
  from public.profiles
  where id = new.follower_user_id;

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
  values (
    new.target_user_id,
    new.follower_user_id,
    'new_follower',
    'You have a new follower',
    coalesce(follower_name, 'A player') || ' followed your profile.',
    'profile',
    new.follower_user_id::text,
    jsonb_build_object('follower_user_id', new.follower_user_id)
  );

  return new;
end;
$$;

drop trigger if exists notify_new_follower on public.user_follows;
create trigger notify_new_follower
after insert on public.user_follows
for each row
execute function public.notify_new_follower();
