alter table public.profiles
drop constraint if exists profiles_username_format;

alter table public.profiles
drop constraint if exists profiles_username_trimmed;

alter table public.profiles
add constraint profiles_username_trimmed
check (username = btrim(username));

alter table public.profiles
add constraint profiles_username_format
check (username ~ '^[ -~]+$');
