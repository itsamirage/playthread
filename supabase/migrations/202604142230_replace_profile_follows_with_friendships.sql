create table if not exists public.user_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles (id) on delete cascade,
  addressee_user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_friendships_status_valid check (status in ('pending', 'accepted')),
  constraint user_friendships_no_self_request check (requester_user_id <> addressee_user_id)
);

create unique index if not exists user_friendships_unique_pair_idx
on public.user_friendships (
  least(requester_user_id, addressee_user_id),
  greatest(requester_user_id, addressee_user_id)
);

create index if not exists user_friendships_requester_idx
on public.user_friendships (requester_user_id, status, created_at desc);

create index if not exists user_friendships_addressee_idx
on public.user_friendships (addressee_user_id, status, created_at desc);

create index if not exists user_friendships_status_idx
on public.user_friendships (status, updated_at desc);

drop trigger if exists set_user_friendships_updated_at on public.user_friendships;
create trigger set_user_friendships_updated_at
before update on public.user_friendships
for each row
execute function public.set_updated_at();

alter table public.user_friendships enable row level security;

drop policy if exists "Users can view all friendships" on public.user_friendships;
create policy "Users can view all friendships"
on public.user_friendships
for select
to authenticated
using (true);

drop policy if exists "Users can create own friendship requests" on public.user_friendships;
create policy "Users can create own friendship requests"
on public.user_friendships
for insert
to authenticated
with check (auth.uid() = requester_user_id);

drop policy if exists "Users can update their friendship requests" on public.user_friendships;
create policy "Users can update their friendship requests"
on public.user_friendships
for update
to authenticated
using (auth.uid() = requester_user_id or auth.uid() = addressee_user_id)
with check (auth.uid() = requester_user_id or auth.uid() = addressee_user_id);

drop policy if exists "Users can delete their friendship requests" on public.user_friendships;
create policy "Users can delete their friendship requests"
on public.user_friendships
for delete
to authenticated
using (auth.uid() = requester_user_id or auth.uid() = addressee_user_id);

alter table public.notifications
drop constraint if exists notifications_kind_valid;

alter table public.notifications
add constraint notifications_kind_valid check (
  kind in (
    'post_comment',
    'coin_gift_received',
    'moderation_warning',
    'followed_game_post',
    'new_follower',
    'friend_request',
    'friend_accept'
  )
);
