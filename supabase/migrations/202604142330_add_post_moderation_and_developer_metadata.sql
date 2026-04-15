alter table public.posts
add column if not exists pinned_until timestamptz;

alter table public.profiles
add column if not exists developer_game_ids integer[] not null default '{}'::integer[];

alter table public.moderation_actions
drop constraint if exists moderation_actions_type_valid;

alter table public.moderation_actions
add constraint moderation_actions_type_valid
check (
  action_type in (
    'ban',
    'restore',
    'promote_moderator',
    'demote_moderator',
    'promote_admin',
    'set_scope',
    'set_developer_games',
    'warning',
    'review_flag',
    'retag_post',
    'pin_post',
    'update_integrity_settings',
    'hide_content',
    'restore_content',
    'run_retention_prune'
  )
);
