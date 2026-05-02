alter table public.posts
drop constraint if exists posts_reaction_mode_valid;

alter table public.posts
add constraint posts_reaction_mode_valid
check (reaction_mode in ('utility', 'sentiment', 'appreciation'));

update public.posts
set reaction_mode = 'appreciation'
where type = 'review';

alter table public.post_reactions
drop constraint if exists post_reactions_type_valid;

alter table public.post_reactions
add constraint post_reactions_type_valid
check (reaction_type in ('like', 'dislike', 'helpful', 'not_helpful', 'respect'));
