alter table public.profiles
add column if not exists account_role text not null default 'member',
add column if not exists moderation_scope text not null default 'all',
add column if not exists moderation_game_ids integer[] not null default '{}',
add column if not exists is_banned boolean not null default false,
add column if not exists banned_at timestamptz,
add column if not exists banned_reason text,
add column if not exists integrity_exempt boolean not null default false,
add column if not exists coins_from_posts integer not null default 0,
add column if not exists coins_from_comments integer not null default 0,
add column if not exists coins_spent integer not null default 0,
add column if not exists selected_name_color text not null default 'default',
add column if not exists selected_banner_style text not null default 'ember';

alter table public.profiles
drop constraint if exists profiles_account_role_valid;

alter table public.profiles
add constraint profiles_account_role_valid
check (account_role in ('member', 'moderator', 'admin', 'owner'));

alter table public.profiles
drop constraint if exists profiles_moderation_scope_valid;

alter table public.profiles
add constraint profiles_moderation_scope_valid
check (moderation_scope in ('all', 'games'));

alter table public.profiles
drop constraint if exists profiles_coin_totals_valid;

alter table public.profiles
add constraint profiles_coin_totals_valid
check (
  coins_from_posts >= 0
  and coins_from_comments >= 0
  and coins_spent >= 0
  and coins_spent <= (coins_from_posts + coins_from_comments)
);

update public.profiles
set
  account_role = 'owner',
  integrity_exempt = true
where lower(username) = 'alektester';

alter table public.posts
add column if not exists moderation_state text not null default 'clean',
add column if not exists moderation_labels text[] not null default '{}';

alter table public.posts
drop constraint if exists posts_moderation_state_valid;

alter table public.posts
add constraint posts_moderation_state_valid
check (moderation_state in ('clean', 'warning', 'hidden'));

alter table public.post_comments
add column if not exists moderation_state text not null default 'clean',
add column if not exists moderation_labels text[] not null default '{}';

alter table public.post_comments
drop constraint if exists post_comments_moderation_state_valid;

alter table public.post_comments
add constraint post_comments_moderation_state_valid
check (moderation_state in ('clean', 'warning', 'hidden'));

create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  content_id uuid,
  igdb_game_id integer,
  game_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  flagged_by uuid references public.profiles (id) on delete set null,
  origin text not null default 'automatic',
  category text not null,
  labels text[] not null default '{}',
  reason text not null,
  content_excerpt text,
  evidence_json jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint moderation_flags_content_type_valid
    check (content_type in ('post', 'comment', 'profile')),
  constraint moderation_flags_origin_valid
    check (origin in ('automatic', 'manual', 'integrity')),
  constraint moderation_flags_category_valid
    check (category in ('hate', 'abuse', 'nudity', 'spam', 'integrity')),
  constraint moderation_flags_status_valid
    check (status in ('open', 'reviewed', 'dismissed', 'actioned'))
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  actor_user_id uuid not null references public.profiles (id) on delete cascade,
  action_type text not null,
  reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint moderation_actions_type_valid
    check (
      action_type in (
        'ban',
        'restore',
        'promote_moderator',
        'demote_moderator',
        'promote_admin',
        'set_scope',
        'warning'
      )
    )
);

create index if not exists profiles_account_role_idx on public.profiles (account_role);
create index if not exists posts_moderation_state_idx on public.posts (moderation_state);
create index if not exists post_comments_moderation_state_idx on public.post_comments (moderation_state);
create index if not exists moderation_flags_status_idx on public.moderation_flags (status);
create index if not exists moderation_flags_user_id_idx on public.moderation_flags (user_id);
create index if not exists moderation_flags_game_id_idx on public.moderation_flags (igdb_game_id);
create index if not exists moderation_actions_target_user_id_idx on public.moderation_actions (target_user_id);

create or replace function public.is_platform_staff(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and account_role in ('moderator', 'admin', 'owner')
  );
$$;

create or replace function public.is_platform_admin(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and account_role in ('admin', 'owner')
  );
$$;

create or replace function public.is_profile_active(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and is_banned = false
  );
$$;

create or replace function public.can_administer_profile(target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_role text;
  target_role text;
begin
  select account_role
  into current_role
  from public.profiles
  where id = auth.uid();

  if current_role is null then
    return false;
  end if;

  if current_role = 'owner' then
    return true;
  end if;

  if current_role <> 'admin' then
    return false;
  end if;

  select account_role
  into target_role
  from public.profiles
  where id = target_user_id;

  return coalesce(target_role, 'member') not in ('admin', 'owner');
end;
$$;

create or replace function public.refresh_profile_reward_totals(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    coins_from_posts = (
      select count(*) * 100
      from public.posts
      where user_id = target_user_id
    ),
    coins_from_comments = (
      select count(*) * 25
      from public.post_comments
      where user_id = target_user_id
    )
  where id = target_user_id;
end;
$$;

create or replace function public.sync_profile_reward_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_profile_reward_totals(new.user_id);
  end if;

  if tg_op in ('DELETE', 'UPDATE') then
    perform public.refresh_profile_reward_totals(old.user_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_profile_reward_totals_on_posts on public.posts;
create trigger sync_profile_reward_totals_on_posts
after insert or update or delete on public.posts
for each row
execute function public.sync_profile_reward_totals();

drop trigger if exists sync_profile_reward_totals_on_comments on public.post_comments;
create trigger sync_profile_reward_totals_on_comments
after insert or update or delete on public.post_comments
for each row
execute function public.sync_profile_reward_totals();

update public.profiles
set
  coins_from_posts = (
    select count(*) * 100
    from public.posts
    where user_id = public.profiles.id
  ),
  coins_from_comments = (
    select count(*) * 25
    from public.post_comments
    where user_id = public.profiles.id
  );

alter table public.moderation_flags enable row level security;
alter table public.moderation_actions enable row level security;

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.can_administer_profile(id))
with check (auth.uid() = id or public.can_administer_profile(id));

drop policy if exists "Users can insert their own follows" on public.follows;
create policy "Users can insert their own follows"
on public.follows
for insert
to authenticated
with check (auth.uid() = user_id and public.is_profile_active(auth.uid()));

drop policy if exists "Users can update their own follows" on public.follows;
create policy "Users can update their own follows"
on public.follows
for update
to authenticated
using (auth.uid() = user_id and public.is_profile_active(auth.uid()))
with check (auth.uid() = user_id and public.is_profile_active(auth.uid()));

drop policy if exists "Users can insert their own posts" on public.posts;
create policy "Users can insert their own posts"
on public.posts
for insert
to authenticated
with check (auth.uid() = user_id and public.is_profile_active(auth.uid()));

drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts"
on public.posts
for update
to authenticated
using (auth.uid() = user_id and public.is_profile_active(auth.uid()))
with check (auth.uid() = user_id and public.is_profile_active(auth.uid()));

drop policy if exists "Staff can update moderated posts" on public.posts;
create policy "Staff can update moderated posts"
on public.posts
for update
to authenticated
using (public.is_platform_staff(auth.uid()))
with check (public.is_platform_staff(auth.uid()));

drop policy if exists "Users can insert their own post reactions" on public.post_reactions;
create policy "Users can insert their own post reactions"
on public.post_reactions
for insert
to authenticated
with check (auth.uid() = user_id and public.is_profile_active(auth.uid()));

drop policy if exists "Users can update their own post reactions" on public.post_reactions;
create policy "Users can update their own post reactions"
on public.post_reactions
for update
to authenticated
using (auth.uid() = user_id and public.is_profile_active(auth.uid()))
with check (auth.uid() = user_id and public.is_profile_active(auth.uid()));

drop policy if exists "Users can insert their own post comments" on public.post_comments;
create policy "Users can insert their own post comments"
on public.post_comments
for insert
to authenticated
with check (auth.uid() = user_id and public.is_profile_active(auth.uid()));

drop policy if exists "Staff can update moderated comments" on public.post_comments;
create policy "Staff can update moderated comments"
on public.post_comments
for update
to authenticated
using (public.is_platform_staff(auth.uid()))
with check (public.is_platform_staff(auth.uid()));

drop policy if exists "Users can insert moderation flags" on public.moderation_flags;
create policy "Users can insert moderation flags"
on public.moderation_flags
for insert
to authenticated
with check (auth.uid() = coalesce(flagged_by, auth.uid()));

drop policy if exists "Staff can view moderation flags" on public.moderation_flags;
create policy "Staff can view moderation flags"
on public.moderation_flags
for select
to authenticated
using (public.is_platform_staff(auth.uid()));

drop policy if exists "Staff can update moderation flags" on public.moderation_flags;
create policy "Staff can update moderation flags"
on public.moderation_flags
for update
to authenticated
using (public.is_platform_staff(auth.uid()))
with check (public.is_platform_staff(auth.uid()));

drop policy if exists "Staff can view moderation actions" on public.moderation_actions;
create policy "Staff can view moderation actions"
on public.moderation_actions
for select
to authenticated
using (public.is_platform_staff(auth.uid()));

drop policy if exists "Admins can insert moderation actions" on public.moderation_actions;
create policy "Admins can insert moderation actions"
on public.moderation_actions
for insert
to authenticated
with check (public.is_platform_admin(auth.uid()));
