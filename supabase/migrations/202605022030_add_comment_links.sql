alter table public.post_comments
add column if not exists link_url text,
add column if not exists link_label text;

alter table public.post_comments
drop constraint if exists post_comments_link_url_length,
add constraint post_comments_link_url_length
check (link_url is null or char_length(link_url) <= 500);

alter table public.post_comments
drop constraint if exists post_comments_link_label_length,
add constraint post_comments_link_label_length
check (link_label is null or char_length(btrim(link_label)) between 1 and 80);

alter table public.post_comments
drop constraint if exists post_comments_link_pair_valid,
add constraint post_comments_link_pair_valid
check ((link_url is null and link_label is null) or (link_url is not null and link_label is not null));
