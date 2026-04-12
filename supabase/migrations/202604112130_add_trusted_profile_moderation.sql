alter table public.profiles
add column if not exists profile_moderation_state text not null default 'clean',
add column if not exists profile_moderation_labels text[] not null default '{}',
add column if not exists avatar_moderation_state text not null default 'clean',
add column if not exists avatar_moderation_labels text[] not null default '{}';

alter table public.profiles
drop constraint if exists profiles_profile_moderation_state_valid;

alter table public.profiles
add constraint profiles_profile_moderation_state_valid
check (profile_moderation_state in ('clean', 'warning'));

alter table public.profiles
drop constraint if exists profiles_avatar_moderation_state_valid;

alter table public.profiles
add constraint profiles_avatar_moderation_state_valid
check (avatar_moderation_state in ('clean', 'warning'));

create or replace function public.block_direct_profile_identity_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  request_role text := current_setting('request.jwt.claim.role', true);
  allows_username_sync boolean := false;
begin
  if request_role = 'service_role' then
    return new;
  end if;

  allows_username_sync :=
    new.bio is not distinct from old.bio
    and new.avatar_url is not distinct from old.avatar_url
    and new.profile_moderation_state is not distinct from old.profile_moderation_state
    and new.profile_moderation_labels is not distinct from old.profile_moderation_labels
    and new.avatar_moderation_state is not distinct from old.avatar_moderation_state
    and new.avatar_moderation_labels is not distinct from old.avatar_moderation_labels
    and new.username is distinct from old.username
    and new.display_name is not distinct from new.username
    and (old.display_name is null or old.display_name is not distinct from old.username);

  if allows_username_sync then
    return new;
  end if;

  if
    new.display_name is distinct from old.display_name
    or new.bio is distinct from old.bio
    or new.avatar_url is distinct from old.avatar_url
    or new.profile_moderation_state is distinct from old.profile_moderation_state
    or new.profile_moderation_labels is distinct from old.profile_moderation_labels
    or new.avatar_moderation_state is distinct from old.avatar_moderation_state
    or new.avatar_moderation_labels is distinct from old.avatar_moderation_labels
  then
    raise exception 'Profile identity fields must be changed through trusted server functions.';
  end if;

  return new;
end;
$$;

drop trigger if exists block_direct_profile_identity_changes on public.profiles;
create trigger block_direct_profile_identity_changes
before update on public.profiles
for each row
execute function public.block_direct_profile_identity_changes();
