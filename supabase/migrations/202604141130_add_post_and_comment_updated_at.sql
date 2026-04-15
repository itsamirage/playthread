alter table public.posts
add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.post_comments
add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.posts
set updated_at = created_at
where updated_at is null;

update public.post_comments
set updated_at = created_at
where updated_at is null;

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
before update on public.posts
for each row
execute function public.set_updated_at();

drop trigger if exists set_post_comments_updated_at on public.post_comments;
create trigger set_post_comments_updated_at
before update on public.post_comments
for each row
execute function public.set_updated_at();
