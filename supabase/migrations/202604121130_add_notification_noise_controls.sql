alter table public.notification_preferences
add column if not exists activity_noise_control_enabled boolean not null default true,
add column if not exists activity_push_cooldown_minutes integer not null default 30;

alter table public.notification_preferences
drop constraint if exists notification_preferences_activity_push_cooldown_minutes_valid;

alter table public.notification_preferences
add constraint notification_preferences_activity_push_cooldown_minutes_valid
check (activity_push_cooldown_minutes between 0 and 240);
