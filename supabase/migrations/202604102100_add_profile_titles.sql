alter table public.profiles
add column if not exists selected_title_key text not null default 'none';
