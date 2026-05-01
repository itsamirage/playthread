alter table public.posts
add column if not exists is_nsfw boolean not null default false;

create index if not exists posts_is_nsfw_idx on public.posts (is_nsfw);
