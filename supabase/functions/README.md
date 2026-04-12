Deploy the IGDB proxy with the Supabase CLI:

1. Set function secrets:
   `supabase secrets set IGDB_CLIENT_ID=your-client-id IGDB_ACCESS_TOKEN=your-access-token`
2. Deploy the function:
   `supabase functions deploy igdb-proxy`

The mobile app calls `igdb-proxy` through `supabase.functions.invoke(...)`, so IGDB credentials stay in Supabase and do not ship in the Expo bundle.

Deploy the Steam account function with the Supabase CLI:

1. Ensure the project already has `SUPABASE_SERVICE_ROLE_KEY` available to functions.
2. Set the Steam Web API key used for owned-games and achievement sync:
   `supabase secrets set STEAM_WEB_API_KEY=your-steam-web-api-key`
3. Recommended: allowlist the app/browser redirect targets used after Steam sign-in:
   `supabase secrets set STEAM_OPENID_ALLOWED_REDIRECTS="playthread://*,https://playthread.app/steam-link,https://www.playthread.app/steam-link"`
4. Optional: use a branded callback + realm instead of the raw Supabase domain in the Steam prompt:
   `supabase secrets set STEAM_OPENID_CALLBACK_URL=https://auth.playthread.app/functions/v1/steam-account STEAM_OPENID_REALM_URL=https://auth.playthread.app`
   The callback URL must route to this same `steam-account` function.
5. Deploy the function:
   `supabase functions deploy steam-account`

The mobile app calls `steam-account` over an authenticated HTTPS request. Steam linking now uses Steam OpenID for verified ownership, then syncs owned games, a limited achievement set, and profile showcase items for public Steam profiles.

Notes:
- Redirect allowlisting supports exact URLs and `*` wildcards.
- Default development-safe redirects remain allowed for `playthread://*`, `exp://*`, `exps://*`, and localhost loopback URLs.
- In production, prefer explicit hosted redirect URLs instead of relying only on wildcard defaults.

Deploy the Mux clip-upload functions with the Supabase CLI:

1. Create a Mux account and generate a token ID + token secret with video write access.
2. Set function secrets:
   `supabase secrets set MUX_TOKEN_ID=your-token-id MUX_TOKEN_SECRET=your-token-secret MUX_WEBHOOK_TOKEN=your-random-webhook-token`
3. Deploy the functions:
   `supabase functions deploy mux-video`
   `supabase functions deploy mux-webhook`
4. In Mux webhooks, add this endpoint:
   `https://zippqumynxivnhhmvblc.supabase.co/functions/v1/mux-webhook?token=your-random-webhook-token`
5. Subscribe the webhook to:
   - `video.asset.created`
   - `video.asset.ready`
   - `video.asset.errored`

The app calls `mux-video` through an authenticated edge-function request, uploads the raw clip directly to Mux using the returned upload URL, and waits for the webhook to attach playback metadata to the related `clip` post.
