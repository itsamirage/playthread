alter table profiles
  add column if not exists now_playing_game_ids int4[] not null default '{}';
