create table if not exists public.saved_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  collection text not null default 'General',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, comment_id)
);

create index if not exists saved_comments_user_created_idx on public.saved_comments (user_id, created_at desc);
create index if not exists saved_comments_comment_idx on public.saved_comments (comment_id);

alter table public.saved_comments enable row level security;

drop policy if exists "Users can view own saved comments" on public.saved_comments;
create policy "Users can view own saved comments"
on public.saved_comments
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can manage own saved comments" on public.saved_comments;
create policy "Users can manage own saved comments"
on public.saved_comments
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Service role manages saved comments" on public.saved_comments;
create policy "Service role manages saved comments"
on public.saved_comments
for all
to service_role
using (true)
with check (true);
