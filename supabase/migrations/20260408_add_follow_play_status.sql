alter table public.follows
add column if not exists play_status text not null default 'currently_playing';

alter table public.follows
drop constraint if exists follows_play_status_valid;

alter table public.follows
add constraint follows_play_status_valid check (
  play_status in ('have_not_played', 'currently_playing', 'taking_a_break', 'completed')
);

update public.follows
set play_status = 'currently_playing'
where play_status is null;
