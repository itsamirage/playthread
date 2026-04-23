# Playthread — Codex Handover Document

**Last updated:** 2026-04-19 (latest session)  
**Repo:** https://github.com/itsamirage/playthread  
**Branch model:** single `main` branch, push directly, no PRs  
**App Store ID:** 6762104334

---

## 1. What This App Is

Playthread is a social gaming app for iOS (React Native / Expo). Users follow games, post reviews / screenshots / clips / discussion threads inside each game's community, react to posts, gift coins, and maintain a friends list. It is backed entirely by Supabase (Postgres + Edge Functions + Storage + Realtime).

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | React Native 0.81.5 via Expo SDK 54 |
| Router | expo-router v6 (file-based, Stack navigator) |
| Backend | Supabase (Postgres, Edge Functions on Deno, Storage, Realtime) |
| Game data | IGDB API, proxied through a Supabase Edge Function |
| Video | Mux (upload → transcode → playback) |
| Push notifications | expo-notifications + Supabase `user_push_tokens` table |
| CI / TestFlight | Codemagic (`codemagic.yaml`) |
| Language | JSX/JS for app code, TypeScript for Edge Functions and some tab screens |

---

## 3. Directory Structure

```
/
├── app/                        # expo-router screens
│   ├── (auth)/                 # Login, signup, password reset
│   ├── (tabs)/                 # Tab bar screens
│   │   ├── index.tsx           # Home feed (followed games)
│   │   ├── popular.tsx         # All feed (cross-game ranked)
│   │   ├── browse.tsx          # Game / studio / genre / player / post search
│   │   ├── profile.tsx         # Own profile, settings, friends
│   │   ├── admin.tsx           # Admin panel (role-gated)
│   │   └── game/               # (unused shell, real screen is appScreens/)
│   ├── game/[id].jsx           # Shell that renders GameDetailScreen
│   ├── post/[id].jsx           # Post thread + comments
│   ├── user/[id].jsx           # Public user profile
│   ├── notifications.jsx       # Notification inbox + preferences
│   ├── create-post.jsx         # New / edit post modal
│   ├── catalog.jsx             # Genre / studio / year facet catalog
│   ├── onboarding.jsx          # First-run onboarding
│   ├── friends.jsx             # Friends list management
│   ├── admin.jsx               # Admin actions
│   └── _layout.tsx             # Root layout (AuthProvider, FollowsProvider,
│                               #   NotificationRuntimeBridge, PushNotificationSync)
│
├── appScreens/
│   └── GameDetailScreen.jsx    # Full game detail page (imported by app/game/[id].jsx)
│
├── components/
│   ├── BottomNavBar.jsx        # Absolute-positioned tab bar (Home/All/Browse/Profile)
│   ├── PostCard.jsx            # Reusable post renderer with spoiler blur/reveal
│   ├── PostCommentsSheet.jsx   # Bottom sheet for inline comments
│   ├── PostCommentsThread.jsx  # Comment thread renderer
│   ├── GameCard.jsx            # Game tile with follow status controls
│   ├── CoinGiftSheet.jsx       # Coin gifting bottom sheet
│   ├── SectionCard.jsx         # Titled card wrapper used everywhere
│   ├── PlatformBadge.jsx       # Platform icon chip
│   ├── NotificationInboxButton.jsx  # Bell icon with unread dot
│   └── NotificationRuntimeBridge.jsx  # Wires expo-notifications tap events to router
│
├── lib/                        # All client-side logic
│   ├── auth.js                 # AuthProvider, useAuth, session management
│   ├── follows.js              # FollowsProvider, useFollows (followed games, spoilers)
│   ├── posts.js                # useFeedPosts, useGamePosts, usePopularPosts,
│   │                           #   usePostSearch, togglePostReaction, createPost, etc.
│   ├── games.js                # useGameDetail, useBrowseGames
│   ├── gameRatings.js          # saveGameRating, useGameRating, GAME_RATING_OPTIONS
│   │                           #   IMPORTANT: ratings stored halved (÷2) in DB,
│   │                           #   always multiply ×2 to display; snap to nearest 0.5
│   ├── userSocial.js           # usePublicProfile, useUserFollows, useUserActivity,
│   │                           #   useMyReviewCount, useMyReviewsByGame,
│   │                           #   usePublicReviewCount, useCreatorSearch,
│   │                           #   requestFriend, acceptFriendRequest, etc.
│   ├── notifications.js        # useNotifications, useNotificationPreferences,
│   │                           #   markNotificationRead, groupNotifications
│   ├── notificationRouting.js  # buildRouteFromNotification (deep-link routing)
│   ├── pushNotifications.js    # usePushNotifications — syncs Expo push token to DB
│   ├── nowPlaying.js           # useNowPlaying, toggleNowPlaying
│   ├── theme.js                # Design tokens (colors, spacing, radii, font sizes)
│   ├── navigation.js           # goBackOrFallback helper
│   ├── integrity.js            # describeIntegrityError
│   ├── contentPreferences.js   # useContentPreferences, saveContentPreferences
│   │                           #   (hideMatureGames / NSFW filter)
│   ├── supabase.js             # Supabase client singleton
│   ├── functions.js            # invokeEdgeFunction wrapper
│   ├── admin.js                # sendCoinGift, useMyAdminProfile, updatePostMetadata
│   ├── titles.js               # getProfileTitleOption (cosmetic titles)
│   ├── profileAppearance.js    # getProfileNameColor (cosmetic name colors)
│   └── tabReselect.js          # useTabReselectScroll (tap tab → scroll to top / refresh)
│
├── supabase/
│   ├── functions/              # Deno Edge Functions
│   │   ├── _shared/trusted.ts  # Shared auth, integrity, moderation helpers
│   │   ├── igdb-proxy/         # IGDB game search + detail proxy
│   │   ├── trusted-post/       # Create / update posts, coin rewards
│   │   ├── trusted-comment/    # Create / update comments, coin rewards
│   │   ├── trusted-post-reaction/   # Post reaction toggle
│   │   ├── trusted-comment-reaction/ # Comment reaction toggle
│   │   ├── trusted-follow/     # Friend request / accept / decline / remove
│   │   ├── trusted-coin/       # Gift coins, admin adjust, store item redemption
│   │   ├── trusted-profile/    # Update profile identity / settings
│   │   ├── trusted-admin/      # Admin moderation actions
│   │   ├── trusted-react-post/ # (legacy reaction helper)
│   │   ├── steam-account/      # Steam account linking
│   │   ├── mux-video/          # Mux upload URL creation
│   │   └── mux-webhook/        # Mux playback-ready webhook handler
│   └── migrations/             # Sequential SQL migrations (applied via Supabase CLI)
│
├── codemagic.yaml              # CI/CD — builds IPA and submits to TestFlight
├── eas.json                    # EAS build profiles (development / preview / production)
└── package.json
```

---

## 4. Supabase Project

- **URL:** `https://zippqumynxivnhhmvblc.supabase.co`
- **Anon key:** in `eas.json` and `codemagic.yaml` (public, safe to commit)
- **EAS Project ID:** `abdbb665-1d8f-4924-9174-863608ab17b5`

### Key tables

| Table | Purpose |
|---|---|
| `profiles` | User profile data, cosmetic settings, role, coins, ban status |
| `posts` | All posts (discussion, review, screenshot, guide, tip, clip) |
| `post_reactions` | One row per user-post-reaction |
| `post_comments` | Comments on posts |
| `comment_reactions` | One row per user-comment-reaction |
| `game_follows` | Which games each user follows + follow status |
| `game_ratings` | Per-user game ratings; **stored halved (÷2)**, display ×2 |
| `user_friendships` | Friend requests and accepted friendships |
| `notifications` | In-app notification inbox |
| `notification_preferences` | Per-user notification toggle settings |
| `user_push_tokens` | Expo push tokens per device |
| `coin_transactions` | Full ledger of coin earn/spend/gift events |
| `integrity_events` | IP-based rate-limit tracking for anti-abuse |
| `now_playing_game_ids` | Array of game IDs a user is actively playing |

### Migrations
All migrations live in `supabase/migrations/`. Apply with:
```bash
npx supabase db push
```
The most recent migration is `202604162200_add_now_playing_game_ids.sql`.

`Core memory:` do not treat `db push` or manual Supabase deploys as part of the normal release flow. The only approved deployment path for shipped app releases is Codemagic.

### Edge Functions
Deploy all functions with:
```bash
npx supabase functions deploy
```
Or deploy a single function:
```bash
npx supabase functions deploy trusted-coin
```

---

## 5. Build & TestFlight Pipeline (Codemagic)

`Core memory:` Codemagic is the only deployment path to use for PlayThread releases. Do not switch the release flow to EAS submit/upload or any other deployment system unless the user explicitly changes that decision.

Pushes to `main` do **not** auto-trigger a build. Builds are triggered manually in the Codemagic dashboard.

### How a TestFlight build works

1. Push code to `main` on GitHub
2. Go to [codemagic.io](https://codemagic.io) → Playthread → **Start new build** → select `ios-testflight` workflow
3. Codemagic runs `codemagic.yaml`:
   - `npm ci` — installs deps
   - `npx expo prebuild --clean --platform ios` — generates native iOS project
   - Fetches latest TestFlight build number via App Store Connect API and increments it
   - Imports distribution certificate + provisioning profile from Codemagic environment group `playthread`
   - Builds IPA with Xcode
   - Publishes directly to TestFlight via App Store Connect API
4. Build appears in TestFlight within ~5 minutes of the Codemagic build finishing

### Codemagic environment group `playthread` contains
- `CERTIFICATE_P12` — base64-encoded Apple distribution certificate
- `CERTIFICATE_PASSWORD` — certificate password
- `PROVISIONING_PROFILE` — base64-encoded provisioning profile
- `APP_STORE_CONNECT_PRIVATE_KEY` — App Store Connect API private key
- `APP_STORE_CONNECT_KEY_IDENTIFIER` — key ID
- `APP_STORE_CONNECT_ISSUER_ID` — issuer ID
- `EXPO_TOKEN` - Expo personal access token for EAS Update OTA hotfix workflows
- `SUPABASE_ACCESS_TOKEN` - Supabase personal access token for Edge Function hotfix deploys

### Important `codemagic.yaml` notes
- The workflow is `ios-testflight`
- OTA workflows are `ota-preview` and `ota-production`; they run tests, web export, then `npx eas update --channel ...`
- Server hotfix workflow is `supabase-functions-hotfix`; it runs tests, then deploys Edge Functions
- Build number auto-increments from the last TestFlight build
- `expo prebuild --clean --platform ios` regenerates the native iOS folder from scratch each build — **never manually edit files inside `/ios/`**
- Codemagic now runs `cd ios && pod install` after prebuild, then builds from the generated Xcode workspace
- `expo-image-picker` is pinned to the Expo SDK 54-compatible line so CocoaPods resolves `ExpoImageManipulator` correctly

### EAS Update / hotfix flow

EAS Update is configured with:
- `expo-updates`
- `updates.url` in `app.json`
- `runtimeVersion: { "policy": "appVersion" }`
- EAS channels in `eas.json`: `development`, `preview`, `production`

Use Codemagic as the operational entry point:
- JS/UI hotfix to preview: run `ota-preview`
- JS/UI hotfix to production: run `ota-production`
- Supabase/server exploit or logic hotfix: run `supabase-functions-hotfix`
- Native dependency/config change: run `ios-testflight`; OTA cannot change native code

Important: because OTA support was added after earlier builds, ship one new native build through Codemagic `ios-testflight` before relying on OTA for users. Only users on an app binary built with `expo-updates` and the matching channel/runtime can receive OTA updates.
---

## 6. Key Architectural Decisions & Rules

### Ratings are stored halved
`game_ratings.rating` stores values divided by 2 (e.g. a "9.5" rating is stored as `4.75`). Always multiply by 2 to display. Always round to nearest 0.5 (`Math.round(raw * 2) / 2`) — never use `toFixed(1)` which causes float drift (9.5 → 9.6).

### All writes go through Edge Functions
Direct Supabase client writes are only used for reads. All mutations (posts, comments, reactions, follows, coins, profile updates) go through `supabase/functions/trusted-*` Edge Functions which enforce auth, integrity checks, and coin rewards server-side.

### BottomNavBar is absolute-positioned
`components/BottomNavBar.jsx` sits at `position: absolute, bottom: 0`. Any screen that uses it must:
1. Wrap the `ScrollView`/`FlatList` in a `<View style={{ flex: 1 }}>` 
2. Add `paddingBottom: 80` to the scroll content container
3. Render `<BottomNavBar />` as a sibling after the scroll view

### Spoiler system
`PostCard` manages its own `spoilerRevealed` state. The blur overlay is a `Pressable` that fades out (150ms, `useNativeDriver: true`) then sets `spoilerRevealed = true`. The outer card `Pressable` is `disabled` while the spoiler is concealed — this prevents accidental Edit/Delete taps on blurred posts.

### Optimistic reactions (home/all feeds)
`index.tsx` and `popular.tsx` use an `optimisticReactions` map (`Record<postId, {viewerReaction, reactionCounts}>`). On tap: update the map immediately, call the Edge Function, on error delete the key to roll back. No `useRef` guard needed here because the map pattern handles concurrent taps safely.

### Stale-closure guard (game detail)
`GameDetailScreen` uses `useRef(false)` as a guard on `handleReact` because it holds a direct reference to `post.viewerReaction` rather than reading from a map. Without the ref, rapid taps on an already-reacted post would decrement the count multiple times.

### Push notifications
`usePushNotifications()` is called in `_layout.tsx` via `<PushNotificationSync />` inside `AuthProvider`. It requests permission and syncs the Expo push token to `user_push_tokens` on login and whenever the app becomes active.

### NSFW / mature content filter
`contentPreferences.hideMatureGames` hides AO-rated and adult-themed games from Browse and Catalog. Mature 17+ games always show — this filter is for AO/NSFW only. The setting lives in `AsyncStorage` via `lib/contentPreferences.js`.

### Friend system
Friends use a `user_friendships` table with `status: "pending" | "accepted"`. The four states are `none / outgoing / incoming / friends`. All mutations go through `trusted-follow` Edge Function.

### Coins
Users earn coins by posting (`coins_from_posts`), commenting (`coins_from_comments`), and receiving gifts (`coins_from_gifts`). The ledger is `coin_transactions`. Available balance = sum of all transaction `amount` values. Daily gift cap: 200 coins sent per UTC day (enforced in `trusted-coin`).

### `useMyReviewsByGame` map keys
The map uses `String(row.igdb_game_id)` as keys (not numeric) so lookups with `game.id` (always a string from IGDB API responses) match correctly.

---

## 7. Design System

All styling uses `lib/theme.js` — never hardcode colors, spacing, or font sizes. Key values:

- **Accent (cyan):** `#00e5ff`
- **Background:** `#0b0e14`
- **Card:** `#121620`
- **Border:** `rgba(255,255,255,0.06)`
- **Text primary:** `#e4e8f1`
- Screen padding: `16px`, always via `theme.layout.screenPadding`
- Border radius: `theme.radius.md` (12) for cards/buttons, `theme.radius.pill` (999) for chips

---

## 8. Post Types

`discussion` | `review` | `screenshot` | `guide` | `tip` | `clip`

---

## 9. Latest Session Notes (2026-04-21)

### Engineering priorities completed

- Client-side write audit was completed for the remaining high-risk viewer-owned write paths.
- Added `trusted-user` Edge Function for:
  - game follow / unfollow / play-status updates
  - followed-game cover backfills
  - game ratings
  - notification preferences
  - notification read / mark-all-read
- Updated app helpers to use `trusted-user`:
  - `lib/follows.js`
  - `lib/gameRatings.js`
  - `lib/notifications.js`
- Disabled the old client-side `moderation_flags` insert fallback in `lib/moderation.js`; moderation flag creation should stay on trusted server paths.
- Added `integrity-retention` Edge Function for scheduled retention/reporting operations.
- Added retention operations docs:
  - `docs/retention-operations.md`
- Added scheduled-retention migration:
  - `supabase/migrations/202604210900_schedule_integrity_retention.sql`

### Live deployment state

- `trusted-user` deployed to Supabase project `zippqumynxivnhhmvblc`.
- `integrity-retention` deployed to Supabase project `zippqumynxivnhhmvblc`.
- Retention secrets set in Supabase Edge Function secrets:
  - `RETENTION_CRON_SECRET`
  - `INTEGRITY_RETENTION_DAYS=90`
  - `MODERATION_ACTION_RETENTION_DAYS=365`
  - `INTEGRITY_REPORT_DAYS=14`
- Matching cron secret stored in Supabase Vault as `retention_cron_secret`.
- Daily DB cron job is live:
  - job name: `playthread-integrity-retention-daily`
  - schedule: `17 8 * * *` UTC
  - target: `https://zippqumynxivnhhmvblc.supabase.co/functions/v1/integrity-retention`
- Live `pg_net` smoke invocation returned HTTP `200` and confirmed:
  - retention ran successfully
  - zero rows deleted at the time of the smoke test
  - recent `integrity_daily_summary` rows returned

### Verification status

- `npm.cmd test` passed
- `npm.cmd run build:web` passed after the trusted-user and retention changes
- Final local test rerun after scheduler setup passed: 83 tests
- Broad client mutation scan now only reports trusted server-side helper writes in `lib/trustedAdminService.*`

### Operational notes

- The known legacy Supabase migration ledger issue still applies. If `db push` reports remote shorthand migrations, use:

```powershell
npm.cmd exec supabase -- migration repair --status reverted 20260408 20260410 20260411
npm.cmd exec supabase -- db push --include-all
```

- This repair was used successfully before applying `202604210900_schedule_integrity_retention.sql`.
- Do not commit or document the actual retention secret value.
- `trusted-user` is now required for production app builds that include the updated client helpers.

### Previous Session Notes (2026-04-19)

### Latest pushed commit

- `a97ef50` - `Improve composer, discovery, verification, and profiles`

### New work pushed in `a97ef50`

- Composer:
  - Added local draft autosave / restore via `lib/postComposerDrafts.js`
  - `app/create-post.jsx` now shows a recovered-draft banner, discard action, and publish-readiness checklist
  - Clip posts now require a clip before publish; screenshot posts now require at least one image
- Trusted profile writes:
  - `trusted-profile` now supports `select_title`, `repair_username`, and `update_showcase`
  - `saveProfileTitle` and username repair moved off direct client table updates
  - `saveProfileShowcase` now uses `trusted-profile` instead of direct delete/insert to `profile_showcase_items`
  - Added tests for profile title selection, username repair, and trusted profile service paths
- Community discovery:
  - Browse now includes a `Jump in fast` community entry section
  - Platform search now supports platform-family filtering through `PLATFORM_FAMILIES`
  - `lib/communityHubs.js` now exposes `getFeaturedCommunities`
- Developer verification:
  - Admin screen can search games and add/remove developer verification game IDs without manually typing every ID
  - Verified profiles now have a dedicated profile section showing followed verified games when available
- Profile depth:
  - Showcase cards now render artwork when available
  - Currently-playing cards show the viewer's own rating when available

### Verification status

- `npm.cmd test` passed
- `npm.cmd run build:web` passed

### Deployment state

- User is using Codemagic as the only approved release/deployment path
- Do not start or rely on EAS production uploads for release flow
- Do not treat manual Supabase deploy steps as routine release instructions; only mention them when the user explicitly asks for backend rollout work
- New `trusted-profile` behavior is in the repo and pushed; production availability depends on the user's Codemagic/backend release process

### Important operational notes

- Before next TestFlight validation, build a fresh Codemagic iOS build from the updated `main` branch after pushing
- External TestFlight submission previously failed because App Store Connect was missing:
  - `Beta App Description`
- The release checklist in `docs/release-smoke-checklist.md` should be used before external submission

### Developer verification state

- There is already a real developer-post permission path
  - admin can assign `developer_game_ids`
  - posts in those assigned game communities render the developer badge
- Current admin UX:
  - admin can search games while editing a member and add/remove developer-game IDs
  - assignment remains admin-driven and game-ID based
- Current limitation:
  - there is not yet self-serve developer verification or external proof review

### Previous Session Notes (2026-04-18)

### Already pushed earlier in this cycle

- `5209b30` — `Improve tab persistence, profile history, and search UX`
- `b60b264` — `Fix search results for platforms, remakes, and multi-image posts`

### New local changes made this session

- Added `app/settings.jsx`
  - Dedicated settings screen for:
    - email change
    - password reset trigger
    - NSFW toggle
    - logout
- Updated `app/(tabs)/profile.tsx`
  - Added a Settings button in the profile hero
  - Shows `Verified developer` chip when `developer_game_ids` exist
- Reworked `app/user/[id].jsx`
  - Public profiles now include:
    - searchable recent activity / posts
    - searchable review list
    - searchable comment history
    - verified developer label
  - Removed the extra `Browse` button from the public-profile header so the flow relies on back navigation
- Added shared normalization helpers:
  - `lib/postNormalization.js`
  - `lib/postNormalization.mjs`
  - test: `lib/__tests__/postNormalization.test.mjs`
  - shared parsing now handles:
    - serialized `image_urls`
    - Postgres array strings
    - string/array `developer_game_ids`
- Updated `lib/posts.js`
  - now uses shared post normalization helpers
- Updated `components/PostCard.jsx`
  - developer badge label now reads `Verified developer`
- Updated `lib/userSocial.js`
  - public profile fetch now includes `developer_game_ids`
- Updated `lib/profile.js`
  - current profile fetch now includes `developer_game_ids`
- Updated search logic:
  - `lib/gameSearch.js`
    - alias-aware matching for shorthand queries like `re2`, `ff7r`
  - `lib/__tests__/gamesSearch.test.mjs`
    - regression coverage added for shorthand queries
- Updated `lib/games.js`
  - removed client-side live search result caching so new announcements surface faster
- Updated `supabase/functions/igdb-proxy/index.ts`
  - `discover`, `search`, and `catalog` are no longer cached
  - `starter`, `detail`, and `covers` still use TTL caching
- Added release QA doc:
  - `docs/release-smoke-checklist.md`

### Verification status

- `npm.cmd test` passed
- `npm.cmd run build:web` passed

### Deployment state

- `igdb-proxy` was deployed manually after these cache/freshness changes
- User is using Codemagic as the only approved release/deployment path
- Do not start or rely on EAS production uploads for release flow
- Do not treat manual Supabase deploy steps as routine release instructions; only mention them when the user explicitly asks for backend rollout work

### Important operational notes

- The new app-side changes from this session are intended to be committed and pushed together with this note update
- Before next TestFlight validation, build a fresh Codemagic iOS build from the updated `main` branch after pushing
- External TestFlight submission previously failed because App Store Connect was missing:
  - `Beta App Description`
- The new release checklist in `docs/release-smoke-checklist.md` should be used before external submission

### Answer to the developer-tag question

- There is already a real developer-post permission path
  - admin can assign `developer_game_ids`
  - posts in those assigned game communities render the developer badge
- Current limitation:
  - assignment is still admin-driven and game-ID based
  - there is not yet a polished self-serve or search-based admin UX for assigning developer verification

- `review` posts have a `rating` field (1–10, stored halved in DB)
- `clip` posts use Mux for video (fields: `video_provider`, `video_upload_id`, `video_asset_id`, `video_playback_id`, `video_status`, `video_thumbnail_url`, `video_duration_seconds`)
- `screenshot` posts use Supabase Storage (`image_url`)
- `spoiler: boolean` + `spoiler_tag: string` for spoiler posts

---

## 9. Reaction Modes

Post reaction mode is determined by post type:

| Type | Mode | Reactions |
|---|---|---|
| discussion | social | like, haha, mind_blown |
| review | appreciation | respect, disagree |
| guide / tip | utility | helpful, not_helpful |
| screenshot | social | like, haha, mind_blown |
| clip | social | like, haha, mind_blown |

---

## 10. Profile Cosmetics (Coin Store)

Users spend coins to unlock:
- `selected_name_color` — display name color in the app
- `selected_banner_style` — profile banner style
- `selected_title_key` — title badge shown under their name

Redemption goes through `trusted-coin` with `action: "redeem_store_item"`.

---

## 11. Recent Work (as of 2026-04-17)

All of this is committed and live on `main` (latest commit in this session: `3be3857`):

- **Rating rounding fix** — `normalizeStoredRating` now snaps to nearest 0.5 instead of `toFixed(1)`
- **Spoiler reveal animation** — 150ms opacity fade, blur overlay is a `Pressable` (prevents accidental edit/delete)
- **BottomNavBar** — added to game detail, post detail, user profile screens
- **Stale-closure reaction guard** — `useRef(false)` in GameDetailScreen prevents multi-decrement on rapid taps
- **onAuthorPress in PostCommentsSheet** — home and all feeds can now navigate to user profiles from comments
- **Daily coin gift cap** — 200 coins/day enforced in `trusted-coin` Edge Function
- **Reviewed stat on user profiles** — counts `game_ratings` rows (not post type), shows avg rating
- **Highest Rated sort in Browse** — sorts by `game.metacritic` descending
- **Currently Playing / Active button** — renamed from "Now Playing", `flexShrink: 1` prevents overflow
- **Signup screen copy** — removed "SupaBase" references, uses "Playthread" throughout
- **Post search in Browse** — new "Posts" mode uses existing `usePostSearch` hook
- **NSFW toggle** — replaced ambiguous chip with Show/Hide segmented toggle; clarifies Mature 17+ is unaffected
- **Push notifications wired** — `usePushNotifications` now called in root layout
- **Review prompt on rating** — first-time rating shows Alert offering to write a review post
- **create-post `type` param** — deep-links can pre-select post type (e.g. `type: "review"`)
- **Empty state CTA above filters** — game page shows "Write the first post" button before filter UI when no posts exist
- **`useMyReviewsByGame` type fix** — map keys are now `String(igdb_game_id)` to match string `game.id` lookups
- **Coin gift cap is live** — `trusted-coin` deployed to production with the 200-coin daily sender cap
- **Scroll-to-comments** — post detail can open already aimed at the comments section
- **Keyboard-safe Browse search** — results stay usable while the keyboard is open
- **Game page status cleanup** — redundant separate "active" toggle removed; primary play status remains the source of truth
- **Multi-image posts** — posts now support up to 6 images and render as galleries
- **Image limits + optimization** — 10 MB per image, 24 MB total selection cap, non-GIF images resized/compressed client-side before upload
- **Clip limits** — clips capped at 3 minutes, with server-side upload safeguards for Mux
- **Community hubs** — home now links to generic `Gaming Discussion` and `Platforms` hubs
- **Platform communities** — platform search routes to `Platforms` and then into user-only platform discussion/review pages
- **Comment game-linking** — comments can link a mentioned game and open that game page
- **Browse platform tags fixed** — tapping tags like `iOS` immediately shows matching game results
- **Endless Browse** — game discovery and search now page forward as the user scrolls
- **Create-post game search fix** — composer now uses raw search results, and the picker is a scrollable result list with cover art and platform labels
- **Supabase write guardrails** — `trusted-post` / `trusted-comment` now enforce light server-side cooldowns and quotas
- **Mux spend guardrails** — `mux-video` now enforces cooldowns, per-user upload caps, and a global kill switch
- **Codemagic iOS pipeline repaired** — prebuild + CocoaPods install + generated workspace build path fixed for current Expo SDK 54 setup

---

## 12. Known Gaps / Next Priorities

- **No Android build pipeline** — Codemagic is iOS only; Android not yet configured
- **No automated tests for UI** — only unit tests in `lib/__tests__/` via `npm test`
- **UI/device smoke coverage still needed** — trusted-user write flows and composer/media flows should be validated on a real iPhone/TestFlight build
- **Platform/community system still needs product refinement** — the generic discussion/platform spaces are in, but taxonomy and follow/discovery UX will likely need another pass
- **Composer/device smoke testing** — latest create-post search fix is verified by tests/export build, but still needs manual device validation across discussion/review/image/clip flows

---

## 13. Running Locally

```bash
npm install
npx expo start          # starts Metro bundler
# scan QR with Expo Go app, or press i for iOS simulator
```

Environment variables are embedded in `eas.json` build profiles. For local dev, create `.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=https://zippqumynxivnhhmvblc.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from eas.json>
EXPO_PUBLIC_EAS_PROJECT_ID=abdbb665-1d8f-4924-9174-863608ab17b5
```

