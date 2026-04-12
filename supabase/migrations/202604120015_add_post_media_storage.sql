insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'post-media',
  'post-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view post media" on storage.objects;
create policy "Public can view post media"
on storage.objects
for select
to public
using (bucket_id = 'post-media');

drop policy if exists "Authenticated users can upload post media" on storage.objects;
create policy "Authenticated users can upload post media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Authenticated users can update own post media" on storage.objects;
create policy "Authenticated users can update own post media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Authenticated users can delete own post media" on storage.objects;
create policy "Authenticated users can delete own post media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);
