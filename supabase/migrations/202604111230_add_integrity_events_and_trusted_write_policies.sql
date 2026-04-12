create table if not exists public.integrity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  post_id uuid references public.posts (id) on delete set null,
  comment_id uuid references public.post_comments (id) on delete set null,
  request_ip_hash text not null,
  is_positive boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint integrity_events_type_valid check (
    event_type in (
      'post_create',
      'comment_create',
      'post_reaction',
      'comment_reaction',
      'coin_gift',
      'coin_adjustment',
      'store_spend'
    )
  )
);

create index if not exists integrity_events_user_id_idx on public.integrity_events (user_id);
create index if not exists integrity_events_request_ip_hash_idx on public.integrity_events (request_ip_hash);
create index if not exists integrity_events_created_at_idx on public.integrity_events (created_at desc);
create index if not exists integrity_events_target_user_id_idx on public.integrity_events (target_user_id);
create index if not exists integrity_events_post_id_idx on public.integrity_events (post_id);
create index if not exists integrity_events_comment_id_idx on public.integrity_events (comment_id);

alter table public.integrity_events enable row level security;

drop policy if exists "Staff can view integrity events" on public.integrity_events;
create policy "Staff can view integrity events"
on public.integrity_events
for select
to authenticated
using (public.is_platform_staff(auth.uid()));

drop policy if exists "Service role manages integrity events" on public.integrity_events;
create policy "Service role manages integrity events"
on public.integrity_events
for all
to service_role
using (true)
with check (true);

drop policy if exists "Users can insert their own posts" on public.posts;
drop policy if exists "Users can update their own posts" on public.posts;
drop policy if exists "Users can delete their own posts" on public.posts;

drop policy if exists "Users can insert their own post reactions" on public.post_reactions;
drop policy if exists "Users can update their own post reactions" on public.post_reactions;
drop policy if exists "Users can delete their own post reactions" on public.post_reactions;

drop policy if exists "Users can insert their own post comments" on public.post_comments;
drop policy if exists "Users can delete their own post comments" on public.post_comments;

drop policy if exists "Users can insert their own comment reactions" on public.comment_reactions;
drop policy if exists "Users can delete their own comment reactions" on public.comment_reactions;

drop policy if exists "Users can insert allowed coin transactions" on public.coin_transactions;

drop policy if exists "Service role manages posts" on public.posts;
create policy "Service role manages posts"
on public.posts
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages post reactions" on public.post_reactions;
create policy "Service role manages post reactions"
on public.post_reactions
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages post comments" on public.post_comments;
create policy "Service role manages post comments"
on public.post_comments
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages comment reactions" on public.comment_reactions;
create policy "Service role manages comment reactions"
on public.comment_reactions
for all
to service_role
using (true)
with check (true);
