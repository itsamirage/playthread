alter table public.integrity_events
drop constraint if exists integrity_events_type_valid;

alter table public.integrity_events
add constraint integrity_events_type_valid check (
  event_type in (
    'post_create',
    'comment_create',
    'post_reaction',
    'comment_reaction',
    'coin_gift',
    'coin_adjustment',
    'store_spend',
    'clip_upload'
  )
);
