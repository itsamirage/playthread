# TestFlight Readiness

Current repo status:
- EAS project ID is configured in `app.json`
- iOS bundle identifier is `app.playthread.mobile`
- iOS build number starts at `1`
- iOS permission copy is configured for notifications and photo library access
- `eas.json` now includes `development`, `preview`, and `production` build profiles

## Before first TestFlight build

1. Confirm Apple account access
- You need an Apple Developer account with access to App Store Connect.

2. Create the app record in App Store Connect
- App name: `PlayThread`
- Bundle ID: `app.playthread.mobile`
- Primary language: `English (U.S.)`

3. Prepare store metadata
- App subtitle
- Privacy policy URL
- Support URL
- Screenshots for iPhone
- App icon if you want to replace the current Expo placeholder-style asset

4. Review permission copy
- Notifications: configured in `app.json`
- Photo library: configured in `app.json`

## Recommended native QA checklist

Run this on a real iPhone before broader testing:

1. Auth
- Sign up
- Confirm email
- Log in
- Log out

2. Posting
- Create text post
- Create image post
- Create clip post
- Edit clip caption
- Delete clip post

3. Social
- Comment on a post
- Like a comment
- Follow a user
- Follow a game
- Add a game to backlog
- Rate a game without posting

4. Notifications
- Receive reply notification
- Receive follower notification
- Receive followed-game notification
- Confirm push tap opens the right screen
- Disable a notification type and confirm it stops arriving

5. Profile
- Edit display name and bio
- Trigger avatar/profile moderation review path
- Open public profile

6. Admin
- Open `/admin` as staff
- Review media flag drill-down
- Test hide/restore flow

## Build commands

Internal install build:

```powershell
npx eas build --platform ios --profile preview
```

Production/TestFlight build:

```powershell
npx eas build --platform ios --profile production
```

Submit to TestFlight after the production build:

```powershell
npx eas submit --platform ios --profile production
```

## Likely next fixes after first iOS build

- icon/splash polish
- production-only push issues
- route edge cases from push deep links
- permission wording tweaks
- App Store Connect metadata cleanup
