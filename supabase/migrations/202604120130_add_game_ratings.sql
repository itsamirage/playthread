create table if not exists public.game_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  igdb_game_id integer not null,
  rating numeric(2,1) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint game_ratings_unique_user_game unique (user_id, igdb_game_id),
  constraint game_ratings_rating_valid check (rating between 0.5 and 5.0)
);

create index if not exists game_ratings_igdb_game_id_idx on public.game_ratings (igdb_game_id);
create index if not exists game_ratings_user_id_idx on public.game_ratings (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_game_ratings_updated_at on public.game_ratings;
create trigger set_game_ratings_updated_at
before update on public.game_ratings
for each row
execute function public.set_updated_at();

alter table public.game_ratings enable row level security;

drop policy if exists "Anyone can view game ratings" on public.game_ratings;
create policy "Anyone can view game ratings"
on public.game_ratings
for select
to authenticated
using (true);

drop policy if exists "Users can insert own game ratings" on public.game_ratings;
create policy "Users can insert own game ratings"
on public.game_ratings
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own game ratings" on public.game_ratings;
create policy "Users can update own game ratings"
on public.game_ratings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own game ratings" on public.game_ratings;
create policy "Users can delete own game ratings"
on public.game_ratings
for delete
to authenticated
using (auth.uid() = user_id);

create or replace view public.game_rating_summary as
select
  igdb_game_id,
  round(avg(rating)::numeric, 2) as average_rating,
  count(*)::integer as ratings_count
from public.game_ratings
group by igdb_game_id;
