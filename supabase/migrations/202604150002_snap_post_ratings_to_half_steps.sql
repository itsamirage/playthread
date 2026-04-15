-- Snap all post ratings to the nearest 0.5 increment.
-- The previous migration multiplied old 0-5 scale values by 2, but some
-- values like 4.8 (should have been 4.75) became 9.6 instead of 9.5
-- due to numeric(2,1) truncation. This corrects the rounding artifacts.
update public.posts
set rating = round(rating / 0.5) * 0.5
where rating is not null;
