alter table public.posts
add column if not exists reaction_mode text not null default 'sentiment';

update public.posts
set reaction_mode = case
  when type in ('guide', 'tip') then 'utility'
  else 'sentiment'
end
where reaction_mode is distinct from case
  when type in ('guide', 'tip') then 'utility'
  else 'sentiment'
end;

alter table public.posts
drop constraint if exists posts_type_valid;

alter table public.posts
add constraint posts_type_valid
check (type in ('review', 'discussion', 'screenshot', 'clip', 'guide', 'tip', 'image'));

alter table public.posts
drop constraint if exists posts_reaction_mode_valid;

alter table public.posts
add constraint posts_reaction_mode_valid
check (reaction_mode in ('utility', 'sentiment', 'appreciation'));

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

create index if not exists post_reactions_user_id_idx on public.post_reactions (user_id);
create index if not exists post_reactions_post_id_idx on public.post_reactions (post_id);

alter table public.post_reactions enable row level security;

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
