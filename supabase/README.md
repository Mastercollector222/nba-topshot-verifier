# Supabase setup

Step-by-step to wire a fresh Supabase project to this app.

## 1. Create the project

1. Go to https://supabase.com → **New project**.
2. Region: anything near you. Name: `nba-topshot-verifier` (or whatever).
3. Save the **database password** somewhere — you won't need it for this
   app, but losing it is painful.
4. Wait ~60s for the project to provision.

## 2. Apply the schema

1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the contents of [`schema.sql`](./schema.sql).
3. Run. You should see `Success. No rows returned.`
4. Confirm under **Table Editor** that these tables exist:
   - `users`
   - `auth_nonces`
   - `owned_moments`
   - `reward_rules`
   - `earned_rewards`

## 3. Copy credentials into `.env.local`

Create a `.env.local` at the project root (never commit it). Values come
from **Settings → API** in the Supabase dashboard:

| Env var                           | Source                                      |
| --------------------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Settings → API → **Project URL**            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Settings → API → **Project API keys → anon** |
| `SUPABASE_SERVICE_ROLE_KEY`       | Settings → API → **Project API keys → service_role** (⚠ reveal once) |
| `SUPABASE_JWT_SECRET`             | Settings → API → **JWT Settings → JWT Secret** |

Also keep the Flow-related `NEXT_PUBLIC_*` entries from `.env.example` (they
have sane mainnet defaults, so leaving them unset also works).

> 🔒 `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` must **never** be
> exposed to the client. Only server code (`app/api/**`, Server Components)
> should read them. Next.js only inlines `NEXT_PUBLIC_*` variables into the
> browser bundle, so keeping the `NEXT_PUBLIC_` prefix off is the guardrail.

## 4. Restart the dev server

```bash
npm run dev
```

## 5. Verify end-to-end

1. Open http://localhost:3000.
2. Click **Connect Wallet** → pick Dapper (or any Flow wallet).
3. On the dashboard (once Step 7 is built) click **Sign in with Flow**.
4. Wallet prompts you to sign the nonce message.
5. You should land back signed in: `sb-access` cookie is set, and a row
   appears in `public.users` with your Flow address.

## How auth works (quick mental model)

```
browser                           server                          Supabase DB
-------                           ------                          -----------
connect wallet via FCL
click "Sign in with Flow"
  └─▶ POST /api/auth/nonce ─────▶ insert into auth_nonces  ─────▶ (stored)
                          ◀────── { nonce, messageHex }
wallet signs messageHex
  └─▶ POST /api/auth/verify ────▶ fcl.AppUtils.verifyUserSignatures
                                   update auth_nonces consumed
                                   upsert users
                                   mint JWT(sub=addr, role=authenticated)
                          ◀────── Set-Cookie: sb-access=<jwt>
subsequent RSC fetches
  cookie goes along ───────────▶ Supabase sees JWT, RLS matches
                                   `auth.jwt()->>'sub' = flow_address`
```

The JWT is signed with your project's `SUPABASE_JWT_SECRET`, so Supabase
treats it as a first-class auth token — RLS policies (`*_select_own`) just
work, no extra configuration on the Supabase side.

## Troubleshooting

- **`Missing required env var: SUPABASE_JWT_SECRET`** — you forgot to paste
  it, or didn't restart `next dev` after editing `.env.local`.
- **`Invalid signature` on /api/auth/verify** — the wallet signed a
  different message than the server reconstructed. Ensure you didn't edit
  the message template in `/api/auth/nonce` without also editing
  `/api/auth/verify` — both must produce byte-identical strings.
- **RLS returns no rows even for your own data** — your session cookie
  isn't reaching Supabase. Check `document.cookie` in DevTools for
  `sb-access`, and confirm the `Authorization: Bearer ...` header is
  attached in the Network tab.
