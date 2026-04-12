create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fallback_username text;
begin
  fallback_username := 'user_' || substring(replace(new.id::text, '-', '') from 1 for 12);

  insert into public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    bio,
    genres,
    linked_platforms,
    created_at
  )
  values (
    new.id,
    fallback_username,
    fallback_username,
    null,
    null,
    '{}',
    '{}',
    timezone('utc', now())
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
