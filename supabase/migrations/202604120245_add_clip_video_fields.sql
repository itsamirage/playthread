alter table public.posts
add column if not exists video_provider text,
add column if not exists video_upload_id text,
add column if not exists video_upload_token text,
add column if not exists video_asset_id text,
add column if not exists video_playback_id text,
add column if not exists video_status text not null default 'none',
add column if not exists video_thumbnail_url text,
add column if not exists video_duration_seconds integer;

alter table public.posts
drop constraint if exists posts_video_provider_valid;

alter table public.posts
add constraint posts_video_provider_valid
check (video_provider is null or video_provider in ('mux'));

alter table public.posts
drop constraint if exists posts_video_status_valid;

alter table public.posts
add constraint posts_video_status_valid
check (video_status in ('none', 'uploading', 'processing', 'ready', 'errored'));

create index if not exists posts_video_upload_token_idx on public.posts (video_upload_token);
create index if not exists posts_video_playback_id_idx on public.posts (video_playback_id);
