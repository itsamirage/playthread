# Cloudflare Pages Setup

Use `playthread.app` as the primary web domain.

## Build settings

In Cloudflare Pages:

- Framework preset: `None`
- Build command:

```bash
npm ci && npx expo export --platform web --output-dir .cloudflare-pages && node scripts/prepare-cloudflare-pages.mjs
```

- Build output directory:

```text
.cloudflare-pages
```

## Environment variables

Set these in Cloudflare Pages:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Important:

- `EXPO_PUBLIC_SUPABASE_ANON_KEY` must use the project's JWT-based `anon` key, not the newer `sb_publishable_...` key.
- The authenticated trusted Edge functions (`trusted-profile`, `trusted-admin`, `trusted-coin`) were verified live against the JWT-based `anon` key path.

## Custom domain

After the first successful Pages deploy:

1. Attach `playthread.app` as the production custom domain.
2. Optionally attach `www.playthread.app`.
3. Redirect `www` to apex if you want one canonical host.

## Supabase Auth settings

In Supabase Authentication -> URL Configuration:

- Site URL:

```text
https://playthread.app
```

- Redirect URLs:

```text
https://playthread.app/login
https://www.playthread.app/login
playthread://*
exp://*
exps://*
```

## Why the extra files

- `_redirects` ensures direct route loads such as `/login` work on Pages.
- `_headers` gives long cache headers to static JS/assets.
