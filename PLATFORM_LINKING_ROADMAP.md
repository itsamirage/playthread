# PlayThread Platform Linking Roadmap

## Goal

Add platform-linked accomplishments to PlayThread profiles with the safest and most maintainable path first.

## Recommended rollout

1. Steam linking and achievement showcase
2. Generic accomplishments/profile model
3. Optional Xbox exploration
4. Defer PlayStation and Nintendo achievement import

## Why this order

- Steam is the most realistic first-party-friendly integration target.
- The app can ship real value with one platform if the profile data model is platform-agnostic.
- Xbox may be possible later, but should not block the first release.
- PlayStation and Nintendo should not be assumed available for public third-party profile import.

## Phase 1: Steam MVP

### User outcome

- User links Steam account from profile settings.
- PlayThread imports a small set of showcaseable stats.
- User chooses featured games and achievements for their profile.

### Scope

- Link Steam identity
- Import owned games for linked users
- Import per-game achievements for selected games
- Let user pin:
  - recent completions
  - rarest achievements
  - favorite games

### Data model

- `connected_accounts`
  - `id`
  - `user_id`
  - `provider` (`steam`)
  - `provider_user_id`
  - `display_name`
  - `avatar_url`
  - `access_token` or provider credential reference if needed
  - `created_at`
  - `updated_at`

- `external_games`
  - `id`
  - `provider` (`steam`)
  - `provider_game_id`
  - `title`
  - `cover_url`
  - `platform`
  - `metadata_json`

- `user_game_stats`
  - `id`
  - `user_id`
  - `provider`
  - `provider_game_id`
  - `completion_percent`
  - `completed_achievement_count`
  - `total_achievement_count`
  - `last_synced_at`
  - `metadata_json`

- `user_achievements`
  - `id`
  - `user_id`
  - `provider`
  - `provider_game_id`
  - `provider_achievement_id`
  - `title`
  - `description`
  - `icon_url`
  - `is_unlocked`
  - `unlocked_at`
  - `rarity_percent`
  - `last_synced_at`

- `profile_showcase_items`
  - `id`
  - `user_id`
  - `kind` (`game` or `achievement`)
  - `provider`
  - `provider_game_id`
  - `provider_achievement_id`
  - `position`

### App work

- Add `Linked Accounts` section to [app/(tabs)/profile.tsx](C:/Users/Alek/PlayThread/app/(tabs)/profile.tsx)
- Add profile showcase section under user stats
- Add account linking CTA and sync status
- Add a simple showcase editor modal or route

### Backend work

- Add new Supabase tables above
- Add RLS so users only manage their own linked accounts and showcase rows
- Add an Edge Function for Steam sync:
  - fetch linked account profile
  - fetch owned games
  - fetch achievements for selected games
  - normalize and upsert results

### Shipping cut

- Limit sync to top N selected games instead of entire library
- Run sync manually from profile first
- Add background refresh later

## Phase 2: Generic accomplishments layer

### Goal

Make the profile system provider-agnostic before adding more platforms.

### UI

- `Featured Achievements`
- `Completed Games`
- `Currently Playing`
- `Rarest Unlocks`

### Rules

- Profile UI should never assume Steam-specific naming
- Provider badges should be rendered from metadata
- Missing providers should degrade cleanly

## Phase 3: Xbox exploration

### Safe stance

- Do not promise official Xbox achievement import yet
- Treat Xbox as a research track until a stable sanctioned path is confirmed

### Two possible paths

#### Path A: Official/partner-only

- Investigate whether Xbox partner access provides a user-consented achievement read path suitable for PlayThread
- Only proceed if terms and technical docs clearly allow the product use case

#### Path B: Unofficial/public-profile scanning

- Scan public gamertag-visible profile data
- Require users to keep relevant privacy settings public
- Cache aggressively
- Mark all data as best-effort

### Recommendation

- Do not start Xbox implementation before Steam ships
- If Xbox is added, isolate it behind a provider adapter so it can be removed without touching profile UI

## Phase 4: PlayStation and Nintendo

### Recommendation

- Defer for now
- Support manual showcase entries before attempting official integrations

### Fallback

- Let users add self-reported accomplishments with optional verification later

## Suggested technical architecture

### Client

- `lib/platformAccounts.js`
  - provider status
  - linked accounts
  - sync actions

- `lib/profileShowcase.js`
  - load showcase items
  - save ordering

### Supabase Edge Functions

- `steam-link-start`
- `steam-link-complete`
- `steam-sync-profile`

### Provider adapter pattern

- `services/providers/steam.ts`
- `services/providers/xbox.ts`
- shared normalize methods:
  - `normalizeExternalGame`
  - `normalizeAchievement`
  - `normalizeProfile`

## Concrete next build

1. Create schema for linked accounts and showcase tables
2. Add `Linked Accounts` UI to profile
3. Implement Steam account link flow
4. Build manual `Sync Steam` action
5. Show top 3 showcased achievements on profile

## What not to do yet

- Do not build Xbox scraping first
- Do not design the profile around one provider
- Do not sync entire libraries by default
- Do not block the profile redesign on multi-platform support

## Decision

The best PlayThread path is:

- Ship Steam first
- Build a provider-agnostic accomplishments model
- Revisit Xbox only after Steam is live
