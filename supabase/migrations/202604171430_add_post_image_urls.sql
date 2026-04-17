alter table public.posts
  add column if not exists image_urls text[] not null default '{}';

update public.posts
set image_urls = case
  when image_url is not null and array_length(image_urls, 1) is null then array[image_url]
  else image_urls
end
where image_url is not null;
