alter table public.profiles
add column if not exists coins_from_gifts integer not null default 0,
add column if not exists coins_from_adjustments integer not null default 0;

alter table public.profiles
drop constraint if exists profiles_coin_totals_valid;

alter table public.profiles
add constraint profiles_coin_totals_valid
check (
  coins_from_posts >= 0
  and coins_from_comments >= 0
  and coins_from_gifts >= 0
  and coins_spent >= 0
);

create table if not exists public.comment_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.post_comments (id) on delete cascade,
  reaction_type text not null default 'like',
  created_at timestamptz not null default timezone('utc', now()),
  constraint comment_reactions_unique_user_comment unique (user_id, comment_id),
  constraint comment_reactions_type_valid check (reaction_type in ('like'))
);

create index if not exists comment_reactions_user_id_idx on public.comment_reactions (user_id);
create index if not exists comment_reactions_comment_id_idx on public.comment_reactions (comment_id);

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_user_id uuid references public.profiles (id) on delete set null,
  counterparty_user_id uuid references public.profiles (id) on delete set null,
  entry_type text not null,
  amount integer not null,
  source_key text not null,
  is_anonymous boolean not null default false,
  note text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint coin_transactions_entry_type_valid check (
    entry_type in (
      'post_reward',
      'comment_reward',
      'gift_sent',
      'gift_received',
      'admin_adjustment',
      'store_spend'
    )
  ),
  constraint coin_transactions_non_zero_amount check (amount <> 0),
  constraint coin_transactions_unique_source unique (user_id, source_key)
);

create index if not exists coin_transactions_user_id_idx on public.coin_transactions (user_id);
create index if not exists coin_transactions_actor_user_id_idx on public.coin_transactions (actor_user_id);
create index if not exists coin_transactions_entry_type_idx on public.coin_transactions (entry_type);

create or replace function public.get_available_coins(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::integer
  from public.coin_transactions
  where user_id = target_user_id
$$;

create or replace function public.refresh_profile_coin_totals(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    coins_from_posts = coalesce((
      select sum(amount)
      from public.coin_transactions
      where user_id = target_user_id
        and entry_type = 'post_reward'
        and amount > 0
    ), 0),
    coins_from_comments = coalesce((
      select sum(amount)
      from public.coin_transactions
      where user_id = target_user_id
        and entry_type = 'comment_reward'
        and amount > 0
    ), 0),
    coins_from_gifts = coalesce((
      select sum(amount)
      from public.coin_transactions
      where user_id = target_user_id
        and entry_type = 'gift_received'
        and amount > 0
    ), 0),
    coins_from_adjustments = coalesce((
      select sum(amount)
      from public.coin_transactions
      where user_id = target_user_id
        and entry_type = 'admin_adjustment'
    ), 0),
    coins_spent = coalesce((
      select sum(abs(amount))
      from public.coin_transactions
      where user_id = target_user_id
        and entry_type in ('gift_sent', 'store_spend')
    ), 0)
  where id = target_user_id;
end;
$$;

create or replace function public.sync_profile_coin_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_profile_coin_totals(new.user_id);
  end if;

  if tg_op in ('DELETE', 'UPDATE') then
    perform public.refresh_profile_coin_totals(old.user_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_profile_coin_totals_on_coin_transactions on public.coin_transactions;
create trigger sync_profile_coin_totals_on_coin_transactions
after insert or update or delete on public.coin_transactions
for each row
execute function public.sync_profile_coin_totals();

create or replace function public.sync_post_reaction_coin_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reward_source_key text;
  reward_user_id uuid;
  reward_actor_id uuid;
  reward_type text;
  reward_amount integer := 12;
begin
  reward_source_key := 'post_reaction:' || coalesce(new.id, old.id)::text;
  reward_actor_id := coalesce(new.user_id, old.user_id);
  reward_type := coalesce(new.reaction_type, old.reaction_type);

  if tg_op = 'DELETE' then
    delete from public.coin_transactions
    where source_key = reward_source_key;
    return old;
  end if;

  select user_id
  into reward_user_id
  from public.posts
  where id = new.post_id;

  if reward_user_id is null or reward_user_id = reward_actor_id then
    delete from public.coin_transactions
    where source_key = reward_source_key;
    return new;
  end if;

  if reward_type not in ('like', 'helpful', 'respect') then
    delete from public.coin_transactions
    where source_key = reward_source_key;
    return new;
  end if;

  insert into public.coin_transactions (
    user_id,
    actor_user_id,
    counterparty_user_id,
    entry_type,
    amount,
    source_key,
    metadata_json
  )
  values (
    reward_user_id,
    reward_actor_id,
    reward_actor_id,
    'post_reward',
    reward_amount,
    reward_source_key,
    jsonb_build_object(
      'post_id', new.post_id,
      'reaction_type', reward_type
    )
  )
  on conflict (user_id, source_key)
  do update set
    amount = excluded.amount,
    actor_user_id = excluded.actor_user_id,
    counterparty_user_id = excluded.counterparty_user_id,
    metadata_json = excluded.metadata_json;

  return new;
end;
$$;

drop trigger if exists sync_post_reaction_coin_reward_on_change on public.post_reactions;
create trigger sync_post_reaction_coin_reward_on_change
after insert or update or delete on public.post_reactions
for each row
execute function public.sync_post_reaction_coin_reward();

create or replace function public.sync_comment_reaction_coin_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reward_source_key text;
  reward_user_id uuid;
  reward_actor_id uuid;
  reward_amount integer := 4;
begin
  reward_source_key := 'comment_reaction:' || coalesce(new.id, old.id)::text;
  reward_actor_id := coalesce(new.user_id, old.user_id);

  if tg_op = 'DELETE' then
    delete from public.coin_transactions
    where source_key = reward_source_key;
    return old;
  end if;

  select user_id
  into reward_user_id
  from public.post_comments
  where id = new.comment_id;

  if reward_user_id is null or reward_user_id = reward_actor_id then
    delete from public.coin_transactions
    where source_key = reward_source_key;
    return new;
  end if;

  insert into public.coin_transactions (
    user_id,
    actor_user_id,
    counterparty_user_id,
    entry_type,
    amount,
    source_key,
    metadata_json
  )
  values (
    reward_user_id,
    reward_actor_id,
    reward_actor_id,
    'comment_reward',
    reward_amount,
    reward_source_key,
    jsonb_build_object(
      'comment_id', new.comment_id,
      'reaction_type', new.reaction_type
    )
  )
  on conflict (user_id, source_key)
  do update set
    amount = excluded.amount,
    actor_user_id = excluded.actor_user_id,
    counterparty_user_id = excluded.counterparty_user_id,
    metadata_json = excluded.metadata_json;

  return new;
end;
$$;

drop trigger if exists sync_comment_reaction_coin_reward_on_change on public.comment_reactions;
create trigger sync_comment_reaction_coin_reward_on_change
after insert or update or delete on public.comment_reactions
for each row
execute function public.sync_comment_reaction_coin_reward();

drop trigger if exists sync_profile_reward_totals_on_posts on public.posts;
drop trigger if exists sync_profile_reward_totals_on_comments on public.post_comments;

delete from public.coin_transactions;

insert into public.coin_transactions (
  user_id,
  actor_user_id,
  counterparty_user_id,
  entry_type,
  amount,
  source_key,
  metadata_json
)
select
  p.user_id,
  pr.user_id,
  pr.user_id,
  'post_reward',
  12,
  'post_reaction:' || pr.id::text,
  jsonb_build_object(
    'post_id', pr.post_id,
    'reaction_type', pr.reaction_type
  )
from public.post_reactions pr
join public.posts p on p.id = pr.post_id
where pr.user_id <> p.user_id
  and pr.reaction_type in ('like', 'helpful', 'respect')
on conflict (user_id, source_key) do nothing;

update public.profiles
set
  coins_from_posts = 0,
  coins_from_comments = 0,
  coins_from_gifts = 0,
  coins_from_adjustments = 0,
  coins_spent = 0;

do $$
declare
  profile_row record;
begin
  for profile_row in select id from public.profiles loop
    perform public.refresh_profile_coin_totals(profile_row.id);
  end loop;
end $$;

alter table public.comment_reactions enable row level security;
alter table public.coin_transactions enable row level security;

drop policy if exists "Users can view all comment reactions" on public.comment_reactions;
create policy "Users can view all comment reactions"
on public.comment_reactions
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own comment reactions" on public.comment_reactions;
create policy "Users can insert their own comment reactions"
on public.comment_reactions
for insert
to authenticated
with check (auth.uid() = user_id and public.is_profile_active(auth.uid()));

drop policy if exists "Users can delete their own comment reactions" on public.comment_reactions;
create policy "Users can delete their own comment reactions"
on public.comment_reactions
for delete
to authenticated
using (auth.uid() = user_id and public.is_profile_active(auth.uid()));

drop policy if exists "Users can view their own coin transactions" on public.coin_transactions;
create policy "Users can view their own coin transactions"
on public.coin_transactions
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_platform_staff(auth.uid())
);

drop policy if exists "Users can insert allowed coin transactions" on public.coin_transactions;
create policy "Users can insert allowed coin transactions"
on public.coin_transactions
for insert
to authenticated
with check (
  (
    entry_type = 'store_spend'
    and user_id = auth.uid()
    and actor_user_id = auth.uid()
    and amount < 0
  )
  or (
    entry_type = 'gift_sent'
    and user_id = auth.uid()
    and actor_user_id = auth.uid()
    and amount < 0
  )
  or (
    entry_type = 'gift_received'
    and counterparty_user_id = auth.uid()
    and actor_user_id = auth.uid()
    and amount > 0
  )
  or (
    entry_type = 'admin_adjustment'
    and public.is_platform_admin(auth.uid())
    and actor_user_id = auth.uid()
  )
);

drop policy if exists "Service role manages coin transactions" on public.coin_transactions;
create policy "Service role manages coin transactions"
on public.coin_transactions
for all
to service_role
using (true)
with check (true);
