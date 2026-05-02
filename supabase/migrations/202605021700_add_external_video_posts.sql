alter table public.posts
add column if not exists external_video_provider text,
add column if not exists external_video_id text,
add column if not exists external_video_url text,
add column if not exists external_video_title text,
add column if not exists external_video_thumbnail_url text;

alter table public.posts
drop constraint if exists posts_external_video_provider_valid;

alter table public.posts
add constraint posts_external_video_provider_valid
check (external_video_provider is null or external_video_provider in ('youtube'));

alter table public.posts
drop constraint if exists posts_external_video_id_valid;

alter table public.posts
add constraint posts_external_video_id_valid
check (
  external_video_id is null
  or (
    external_video_provider = 'youtube'
    and external_video_id ~ '^[A-Za-z0-9_-]{11}$'
  )
);

alter table public.posts
drop constraint if exists posts_single_video_attachment;

alter table public.posts
add constraint posts_single_video_attachment
check (
  not (
    external_video_provider is not null
    and (
      video_upload_id is not null
      or video_upload_token is not null
      or video_asset_id is not null
      or video_playback_id is not null
    )
  )
);

create index if not exists posts_external_video_idx
on public.posts (external_video_provider, external_video_id);
