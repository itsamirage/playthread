create or replace function public.block_direct_admin_profile_field_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt', true), ''))::jsonb ->> 'role',
    nullif(current_setting('role', true), ''),
    current_user
  );
begin
  if request_role = 'service_role' then
    return new;
  end if;

  if
    new.account_role is distinct from old.account_role
    or new.moderation_scope is distinct from old.moderation_scope
    or new.moderation_game_ids is distinct from old.moderation_game_ids
    or new.is_banned is distinct from old.is_banned
    or new.banned_at is distinct from old.banned_at
    or new.banned_reason is distinct from old.banned_reason
    or new.integrity_exempt is distinct from old.integrity_exempt
  then
    raise exception 'Admin-only profile fields must be changed through trusted server functions.';
  end if;

  return new;
end;
$$;

create or replace function public.block_direct_profile_identity_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt', true), ''))::jsonb ->> 'role',
    nullif(current_setting('role', true), ''),
    current_user
  );
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

drop function if exists public.debug_request_context();
