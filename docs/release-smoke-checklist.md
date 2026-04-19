# Release Smoke Checklist

Use this checklist before sending a Codemagic iOS build to testers.

## App Store Connect

- Fill in TestFlight app-level metadata before enabling external testing.
- Confirm `Beta App Description` is set.
- Confirm `What to Test`, feedback email, and beta review contact info are set.

## Search and Discovery

- Search for a newly announced game and confirm it appears without waiting for stale cached results.
- Check shorthand and alias searches like `re2`, `ff7r`, and platform abbreviations.
- Verify NSFW filtering hides adult-only games when `Hide NSFW` is enabled.

## Posting and Media

- Create a text post, a single-image post, and a multi-image post.
- Confirm multi-image posts render on feed cards, post detail, and profile history.
- Leave a comment and verify the composer stays above the keyboard.
- If testing a verified developer account, confirm posts on their assigned games show the developer badge.

## Profile and Settings

- Confirm private profile stats open searchable lists.
- Confirm public profiles show posts, comments, and reviews with working search inputs.
- Open `Settings` and verify email update, password reset, NSFW preference, and logout flows.

## Navigation

- From `Hot`, enter a post or game, switch tabs, then return and confirm the prior position is restored.
- Check pages reached from tabs use a real back path instead of dumping the user onto the wrong tab root.

## Build Notes

- Codemagic should be the only iOS upload path for production builds.
- If `supabase/functions/igdb-proxy/index.ts` changed, deploy that function before validating search behavior against production.
