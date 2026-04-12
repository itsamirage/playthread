create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_enabled boolean not null default true,
  post_comment_enabled boolean not null default true,
  coin_gift_received_enabled boolean not null default true,
  moderation_warning_enabled boolean not null default true,
  followed_game_post_enabled boolean not null default true,
  new_follower_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
before update on public.notification_preferences
for each row
execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists "Users can view their own notification preferences" on public.notification_preferences;
create policy "Users can view their own notification preferences"
on public.notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own notification preferences" on public.notification_preferences;
create policy "Users can insert their own notification preferences"
on public.notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own notification preferences" on public.notification_preferences;
create policy "Users can update their own notification preferences"
on public.notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Service role manages notification preferences" on public.notification_preferences;
create policy "Service role manages notification preferences"
on public.notification_preferences
for all
to service_role
using (true)
with check (true);
