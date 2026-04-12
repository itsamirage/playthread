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
    'warning',
    'review_flag',
    'update_integrity_settings',
    'hide_content',
    'restore_content',
    'run_retention_prune'
  )
);
