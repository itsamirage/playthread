# Playthread — Codex Handover Document

**Last updated:** 2026-04-17 (later session)  
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

### Important `codemagic.yaml` notes
- The workflow is `ios-testflight`
- Build number auto-increments from the last TestFlight build
- `expo prebuild --clean --platform ios` regenerates the native iOS folder from scratch each build — **never manually edit files inside `/ios/`**
- Codemagic now runs `cd ios && pod install` after prebuild, then builds from the generated Xcode workspace
- `expo-image-picker` is pinned to the Expo SDK 54-compatible line so CocoaPods resolves `ExpoImageManipulator` correctly

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
- **Client-side write audit still incomplete** — some write paths remain outside `trusted-*` functions and should be migrated to fully match the architecture rule
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
