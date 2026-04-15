-- Migrate posts.rating from 0-5 scale (numeric(2,1)) to 0-10 scale (numeric(3,1)).
-- The /2 divide on write and *2 multiply on read is removed after this migration.

-- 1. Drop existing constraint if any
alter table public.posts
drop constraint if exists posts_rating_valid;

-- 2. Widen the column type to hold values up to 10.0 with one decimal place
alter table public.posts
alter column rating type numeric(3,1);

-- 3. Multiply all existing stored values by 2 (they were on 0-5 scale)
update public.posts
set rating = rating * 2
where rating is not null;

-- 4. Add new constraint for 0-10 scale
alter table public.posts
add constraint posts_rating_valid check (rating between 0.5 and 10.0);
