create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint post_comments_body_length check (char_length(btrim(body)) between 1 and 600)
);

create index if not exists post_comments_user_id_idx on public.post_comments (user_id);
create index if not exists post_comments_post_id_idx on public.post_comments (post_id);
create index if not exists post_comments_created_at_idx on public.post_comments (created_at desc);

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

alter table public.post_comments enable row level security;

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

update public.posts
set comments_count = (
  select count(*)
  from public.post_comments
  where post_id = public.posts.id
);
