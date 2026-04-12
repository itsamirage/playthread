Resume PlayThread

Project path:
C:\Users\Alek\PlayThread

Current product decisions:
- Keep the product name as PlayThread
- Stay on free Supabase for now
- Steam linking stays on verified Steam OpenID
- Reviews keep the single `Respect` reaction only
- `@player1` is the real owner account in the linked project

Linked Supabase project:
- Project ref: `zippqumynxivnhhmvblc`

Current live state:
- Steam OpenID linking is implemented and deployed
- `steam-account` is deployed on project `zippqumynxivnhhmvblc`
- `STEAM_WEB_API_KEY` is set in Supabase secrets
- Steam unlink removes the linked account plus synced Steam data
- Steam owned-games sync works
- Initial achievement sync is intentionally limited; per-game on-demand sync exists in the showcase editor
- Showcase editor is implemented on the profile screen
- Showcase editor supports sorting, typo-tolerant search, manual selection, manual reorder, and saved order
- Manual showcase picks persist across future Steam syncs
- Steam privacy/settings explanation page is implemented
- Post reactions are implemented:
  - `Helpful / Not Helpful` for `guide` and `tip`
  - `Like / Dislike` for `discussion`, `clip`, and image-style posts
  - `Respect` for `review`
- Post creation supports `Guide` and `Tip`
- Popular/All feed uses real ranked posts instead of placeholders
- Comments MVP is implemented:
  - `post_comments` table
  - create/list/delete comments
  - comment count updates in feed, game thread, and all/popular cards
- New posts auto-seed the author’s positive reaction
- IGDB live browse/search is fixed again
- Browse typo tolerance is improved for game search
- Expo web export passed after the latest local changes
- `@player1` is `owner` with `integrity_exempt = true`

What is now live beyond the old handoff:
- Cross-game `All` feed on the Popular tab with filters:
  - today
  - week
  - month
  - year
  - all time
- Ranking boosts strong posts from games with smaller follow counts
- Admin/moderation foundation is live:
  - `/admin` route
  - roles: `member`, `moderator`, `admin`, `owner`
  - moderator scope: `all` or specific IGDB game IDs
  - ban / restore user flow
  - moderation queue for flagged text content
- Text moderation warnings/logging are live:
  - posts/comments can be auto-flagged for hateful / abusive / sexual text patterns
  - flagged content gets a warning banner
  - flagged content is written to `moderation_flags`
- Rewards/coins use a ledger model:
  - post coins come from non-self positive post reactions only
  - comment coins come from non-self comment likes only
  - self-reactions do not count
  - coin gifting exists with anonymous vs named toggle
  - admin coin add/remove exists
  - admin can see available, lifetime, gifts, adjustments, and spent totals
- Comment likes are implemented via `comment_reactions`
- Username availability check blocks taken usernames cleanly on signup
- Profile title system is implemented:
  - selectable title on profile
  - title renders on profile, posts, and comments
  - title catalog is easy to extend in `lib/titles.js`

Trusted backend work now live:
- High-risk writes are behind trusted Supabase Edge functions:
  - `trusted-post`
  - `trusted-comment`
  - `trusted-post-reaction`
  - `trusted-comment-reaction`
  - `trusted-coin`
  - `trusted-admin`
  - `trusted-profile`
- Direct client writes for core content/reaction/coin/admin paths are no longer the authority
- Request IPs are hashed server-side and stored as integrity evidence
- Same-network heuristics are enforced server-side for:
  - too many accounts creating activity from one network
  - too many accounts boosting the same post
  - too many accounts boosting the same comment
  - too many accounts boosting the same author
- Integrity flags are created automatically when those checks block actions
- Owner/admin exemption model is live via `integrity_exempt`

Admin tooling now live:
- Admin queue supports filtering and pagination
- Integrity queue supports filtering and pagination
- Integrity signal summaries/clustering are shown
- Direct ban / restore actions are available from integrity entries
- Audit log is shown in admin UI
- Drill-down panel exists for:
  - selected moderation flag
  - selected integrity event
  - selected moderation action
- Drill-down now has quick context buttons for:
  - matching author context
  - matching target context
  - matching network history
- Integrity thresholds are configurable in-app by the owner

Retention / reporting now live:
- `public.integrity_daily_summary` view exists
- `public.integrity_blocked_daily_summary` view exists
- `public.prune_old_integrity_data(...)` exists for retention cleanup
- owner-triggered retention prune ran once with `(90, 365)` and returned zero deletions

Profile moderation / identity work now live:
- `trusted-profile` is deployed on project `zippqumynxivnhhmvblc`
- profile identity edits for `display_name`, `bio`, and `avatar_url` now go through `trusted-profile`
- profile text updates can be auto-flagged into `moderation_flags`
- avatar URL submissions now support a practical review scaffold:
  - trusted Steam avatar hosts stay clean
  - other HTTPS image hosts are allowed but flagged for review
- profile now stores:
  - `profile_moderation_state`
  - `profile_moderation_labels`
  - `avatar_moderation_state`
  - `avatar_moderation_labels`
- direct non-service updates to profile identity moderation fields are now blocked by DB trigger
- the profile screen now includes:
  - editable display name
  - editable short bio
  - editable avatar URL
  - Steam avatar autofill button
  - inline moderation/review messaging

Automated verification now present:
- `npm test` passes
- Tests currently cover:
  - admin queue filtering/pagination helpers
  - integrity signal aggregation helpers
  - integrity error-to-UX copy mapping
  - admin moderation policy helpers
  - profile identity/avatar moderation helpers
- Expo web export passes after the profile moderation pass

Important local migrations already pushed:
- `supabase/migrations/202604101900_add_admin_moderation_rewards.sql`
- `supabase/migrations/202604102015_rework_coins_comment_reactions.sql`
- `supabase/migrations/202604102100_add_profile_titles.sql`
- `supabase/migrations/202604111230_add_integrity_events_and_trusted_write_policies.sql`
- `supabase/migrations/202604111430_add_integrity_settings_and_trusted_admin.sql`
- `supabase/migrations/202604111700_extend_moderation_action_audit_types.sql`
- `supabase/migrations/202604111915_extend_moderation_actions_for_retention_and_content_visibility.sql`
- `supabase/migrations/202604112000_add_integrity_retention_and_summary_views.sql`
- `supabase/migrations/202604112130_add_trusted_profile_moderation.sql`

Legacy migration note:
- The old shorthand remote migration versions still exist as a Supabase CLI ledger artifact:
  - `20260408`
  - `20260410`
  - `20260411`
- Local compatibility files currently used:
  - `supabase/migrations/20260408_legacy.sql`
  - `supabase/migrations/20260410_legacy.sql`
  - `supabase/migrations/20260411_legacy.sql`
- Pushes work, but usually require:

```powershell
$env:SUPABASE_ACCESS_TOKEN='...'
npm.cmd exec supabase -- migration repair --status reverted 20260408 20260410 20260411
npm.cmd exec supabase -- db push --include-all
```

- See `SUPABASE_MIGRATION_MAINTENANCE.md` for the exact maintenance note

Important files:
- `app/(tabs)/popular.tsx`
- `app/(tabs)/profile.tsx`
- `app/admin.jsx`
- `app/create-post.jsx`
- `app/game/[id].jsx`
- `components/PostCard.jsx`
- `components/PostCommentsSheet.jsx`
- `components/CoinGiftSheet.jsx`
- `lib/posts.js`
- `lib/admin.js`
- `lib/adminInsights.js`
- `lib/integrity.js`
- `lib/auth.js`
- `lib/profile.js`
- `lib/profileModerationLogic.js`
- `lib/adminModerationLogic.js`
- `lib/moderation.js`
- `lib/titles.js`
- `supabase/functions/_shared/trusted.ts`
- `supabase/functions/trusted-post/index.ts`
- `supabase/functions/trusted-comment/index.ts`
- `supabase/functions/trusted-post-reaction/index.ts`
- `supabase/functions/trusted-comment-reaction/index.ts`
- `supabase/functions/trusted-coin/index.ts`
- `supabase/functions/trusted-admin/index.ts`
- `supabase/functions/trusted-profile/index.ts`
- `supabase/migrations/202604111230_add_integrity_events_and_trusted_write_policies.sql`
- `supabase/migrations/202604111430_add_integrity_settings_and_trusted_admin.sql`
- `supabase/migrations/202604111700_extend_moderation_action_audit_types.sql`
- `supabase/migrations/202604111915_extend_moderation_actions_for_retention_and_content_visibility.sql`
- `supabase/migrations/202604112000_add_integrity_retention_and_summary_views.sql`
- `supabase/migrations/202604112130_add_trusted_profile_moderation.sql`
- `SUPABASE_MIGRATION_MAINTENANCE.md`

What still needs to happen next:
1. Add scheduled operations around retention/reporting
   - decide how `prune_old_integrity_data(...)` should actually run
   - either use a scheduled function / cron job / manual admin op
   - decide retention windows for production usage

2. Improve moderation breadth
   - profile avatar moderation is now URL/review based, but there is still no real first-party upload pipeline
   - broader image moderation still needs a real upload/moderation pipeline for post images and future profile uploads
   - current text moderation is still intentionally heuristic/basic

3. Improve admin drill-down UX
   - current inspect panels are more useful now, but still raw
   - add direct links to the target profile, related flags, related audit actions, and related network history
   - consider richer profile-specific review context for flagged identity/avatar submissions

4. Expand automated testing
   - trusted Edge functions still need deeper integration-style coverage
   - especially `trusted-admin` and `trusted-profile` request/DB paths
   - especially role enforcement, integrity threshold enforcement, content visibility writes, and audit logging paths

5. Optional feature ideas after the security/admin pass:
   - admin-created custom titles in-app
   - public user profile page so others can see coins/account age/titles
   - earned rare titles from milestones
   - stronger moderation review tools with content action buttons
   - appeals / user-facing integrity cooldown explanation flow

Recommended next-session prompt:

```text
Open C:\Users\Alek\PlayThread and continue from NEXT_SESSION_HANDOFF.md.
Start by reviewing the new trusted-profile flow and live admin moderation paths, then decide how to operationalize scheduled retention/reporting beyond the manual owner prune, and continue with deeper integration-style tests plus a real upload/moderation pipeline for images.
```
