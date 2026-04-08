Resume PlayThread

Project path:
C:\Users\Alek\PlayThread

What changed last session:
- added follow statuses: Have not Played / Currently Playing / Taking a Break / Completed
- spoiler posts now stay visible in feeds and game threads, but completed games default to concealed spoilers
- added stronger spoiler blur treatment with expo-blur
- catalog page now supports score/date ascending and descending
- studio catalog query was fixed and `igdb-proxy` redeployed
- browse search was updated to favor newer releases
- Supabase migration added: `follows.play_status`
- platform roadmap added: `PLATFORM_LINKING_ROADMAP.md`

Important files:
- [lib/follows.js](C:/Users/Alek/PlayThread/lib/follows.js)
- [components/GameCard.jsx](C:/Users/Alek/PlayThread/components/GameCard.jsx)
- [components/PostCard.jsx](C:/Users/Alek/PlayThread/components/PostCard.jsx)
- [app/game/[id].jsx](C:/Users/Alek/PlayThread/app/game/[id].jsx)
- [app/catalog.jsx](C:/Users/Alek/PlayThread/app/catalog.jsx)
- [app/(tabs)/index.tsx](C:/Users/Alek/PlayThread/app/(tabs)/index.tsx)
- [supabase/functions/igdb-proxy/index.ts](C:/Users/Alek/PlayThread/supabase/functions/igdb-proxy/index.ts)
- [supabase/migrations/20260408_add_follow_play_status.sql](C:/Users/Alek/PlayThread/supabase/migrations/20260408_add_follow_play_status.sql)
- [PLATFORM_LINKING_ROADMAP.md](C:/Users/Alek/PlayThread/PLATFORM_LINKING_ROADMAP.md)

Current status:
- `npm.cmd exec expo export -- --platform web --output-dir .expo-export-check` passed
- `supabase db push` completed
- `igdb-proxy` deployed

Suggested next tasks:
- scaffold Steam-linked accounts schema and profile UI
- add typo-tolerant search so `Bonanza` can still surface `Bananza`
- device-verify spoiler blur and follow-status UX in Expo Go

Prompt to paste next time:

```text
Open C:\Users\Alek\PlayThread and continue from NEXT_SESSION_HANDOFF.md.
Start with: [write your next task here]
```
