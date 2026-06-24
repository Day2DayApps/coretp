# Quant Tracker Monorepo

This repository is split into:

- `bot/` Discord bot runtime
- `website/` Express dashboard/API
- `shared/` reusable Supabase client, types, and database helpers
- `migrations/` Supabase SQL migrations
- `scripts/` one-off migration tools

## Quick start

1. Copy `.env.example` to `.env` and fill in values.
2. Run the Supabase SQL in order:
   - `migrations/001_init_supabase.sql`
   - `migrations/002_views.sql`
   - `migrations/003_rls_policies.sql`
3. Install dependencies at the root:
   - `npm install`
4. Start the website:
   - `npm run dev:website`
5. Start the bot:
   - `npm run dev:bot`

## Migration

Run:

```bash
npm run migrate:legacy
```

This expects the legacy MongoDB database to be reachable through `MONGODB_URI` and writes into Supabase using the service role key.
