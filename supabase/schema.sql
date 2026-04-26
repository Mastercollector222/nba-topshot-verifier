-- ============================================================================
-- Supabase schema for the NBA Top Shot Ownership Verifier.
--
-- Design:
--   - Identity is a Flow address (lowercase 0x + 16 hex). We don't use
--     Supabase's built-in email/password auth; instead we mint a custom JWT
--     after verifying a Flow-signed nonce (see `app/api/auth/verify`).
--   - Tables are written so Supabase RLS can key off `auth.jwt() ->> 'sub'`
--     which equals the user's Flow address (populated by our JWT).
--   - Writes go through the service role key (server-only). Reads are
--     restricted by RLS to the authenticated row owner.
--
-- How to apply:
--   1. Create a new Supabase project.
--   2. SQL Editor → paste this file → Run.
--   3. Copy the project URL, anon key, service role key, and JWT secret
--      into `.env.local`. See `supabase/README.md`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Helper: lowercase + validate a flow address string.
-- ----------------------------------------------------------------------------
create or replace function public.normalize_flow_address(addr text)
returns text
language sql
immutable
as $$
  select case
    when addr is null then null
    when addr ~ '^0x[0-9a-fA-F]{16}$' then lower(addr)
    else null
  end
$$;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  flow_address               text primary key
                             check (flow_address ~ '^0x[0-9a-f]{16}$'),
  created_at                 timestamptz not null default now(),
  last_verified_at           timestamptz,
  -- User's Top Shot username, self-attested and server-verified by calling
  -- `getUserProfileByUsername` on Top Shot's public GraphQL API and confirming
  -- the returned `flowAddress` matches `flow_address` here. Source of truth
  -- for display names across leaderboards and the admin console.
  topshot_username           text,
  topshot_username_set_at    timestamptz
);

-- Idempotent backfill for pre-username deployments.
alter table public.users
  add column if not exists topshot_username text;
alter table public.users
  add column if not exists topshot_username_set_at timestamptz;

-- Case-insensitive lookups by username (used by admin search, future
-- public profile pages). Top Shot usernames are case-sensitive on their
-- end but for our own lookups we want forgiving matches.
create index if not exists users_topshot_username_lower_idx
  on public.users (lower(topshot_username));

-- ----------------------------------------------------------------------------
-- auth_nonces
--   Short-lived server-issued nonces that the client must sign with its
--   Flow wallet to prove ownership of the address.
-- ----------------------------------------------------------------------------
create table if not exists public.auth_nonces (
  nonce         text primary key,
  flow_address  text not null
                check (flow_address ~ '^0x[0-9a-f]{16}$'),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  consumed_at   timestamptz
);

create index if not exists auth_nonces_flow_address_idx
  on public.auth_nonces (flow_address);

-- ----------------------------------------------------------------------------
-- owned_moments
--   Snapshot of the user's NBA Top Shot ownership at a given verification
--   time. Refreshed on every /verify run.
-- ----------------------------------------------------------------------------
create table if not exists public.owned_moments (
  flow_address    text not null
                  check (flow_address ~ '^0x[0-9a-f]{16}$'),
  moment_id       text not null,          -- UInt64 from chain; store as text
  set_id          integer not null,
  play_id         integer not null,
  series          integer,
  serial_number   integer not null,
  source_address  text not null,          -- parent or child Dapper account
  set_name        text,
  play_metadata   jsonb,
  thumbnail       text,
  is_locked       boolean not null default false,
  lock_expiry     double precision,         -- UFix64 seconds; null = not locked
  snapshot_at     timestamptz not null default now(),
  primary key (flow_address, moment_id)
);

-- Idempotent backfill for pre-locking deployments.
alter table public.owned_moments
  add column if not exists is_locked   boolean not null default false,
  add column if not exists lock_expiry double precision;

create index if not exists owned_moments_flow_address_idx
  on public.owned_moments (flow_address);
create index if not exists owned_moments_set_id_idx
  on public.owned_moments (set_id);
create index if not exists owned_moments_is_locked_idx
  on public.owned_moments (flow_address, is_locked);

-- ----------------------------------------------------------------------------
-- reward_claims: one row per (flow_address, rule_id). Users who earn a reward
-- submit their NBA Top Shot username here so the admin can airdrop the prize.
-- ----------------------------------------------------------------------------
create table if not exists public.reward_claims (
  flow_address      text not null
                    check (flow_address ~ '^0x[0-9a-f]{16}$'),
  rule_id           text not null,
  topshot_username  text not null,
  reward_label      text,
  reward_set_id     integer,
  reward_play_id    integer,
  status            text not null default 'pending'
                    check (status in ('pending','sent','rejected')),
  admin_note        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (flow_address, rule_id)
);

create index if not exists reward_claims_status_idx
  on public.reward_claims (status);

-- ----------------------------------------------------------------------------
-- reward_rules
--   Mirror of `config/rewards.json`. Optional — the JSON file remains the
--   canonical source for now, but the table lets admins manage rules in
--   the UI (Step 8).
-- ----------------------------------------------------------------------------
create table if not exists public.reward_rules (
  id          text primary key,
  type        text not null
              check (type in ('specific_moments', 'set_completion', 'quantity')),
  reward      text not null,
  payload     jsonb not null,    -- full typed rule body (momentIds / setId / ...)
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- earned_rewards
--   One row per (user, rule) the user currently qualifies for.
--   Re-upserted on every verification run.
-- ----------------------------------------------------------------------------
create table if not exists public.earned_rewards (
  flow_address  text not null
                check (flow_address ~ '^0x[0-9a-f]{16}$'),
  rule_id       text not null references public.reward_rules (id) on delete cascade,
  reward        text not null,
  earned_at     timestamptz not null default now(),
  primary key (flow_address, rule_id)
);

create index if not exists earned_rewards_flow_address_idx
  on public.earned_rewards (flow_address);

-- ----------------------------------------------------------------------------
-- lifetime_completions
--   Append-only "Hall of Fame" log used by the public leaderboard. Unlike
--   `earned_rewards` (which is rebuilt on every /verify scan and cascades
--   when a rule is deleted), this table:
--     * has NO foreign key to `reward_rules`, so deleting / disabling a
--       rule never wipes past completions;
--     * snapshots the human-readable `reward` label so the leaderboard
--       can still render the name even after the rule is removed;
--     * is only ever upserted with `ignoreDuplicates`, so re-running a
--       verification or re-earning the same rule never overwrites the
--       original `first_earned_at`.
--   Time-limited challenges, seasonal events, removed rules — nothing
--   touches a row here once it's written.
-- ----------------------------------------------------------------------------
create table if not exists public.lifetime_completions (
  flow_address     text not null
                   check (flow_address ~ '^0x[0-9a-f]{16}$'),
  rule_id          text not null,
  reward           text not null,
  -- TSR points awarded for this completion. Snapshotted at earn time so
  -- changing the rule later (or deleting it) doesn't retroactively alter
  -- a user's leaderboard standing.
  tsr_points       integer not null default 0,
  first_earned_at  timestamptz not null default now(),
  primary key (flow_address, rule_id)
);

create index if not exists lifetime_completions_flow_address_idx
  on public.lifetime_completions (flow_address);

-- Idempotent backfill for pre-TSR deployments that already have rows.
alter table public.lifetime_completions
  add column if not exists tsr_points integer not null default 0;

alter table public.lifetime_completions enable row level security;

-- Users can read only their own completions through the anon client. The
-- leaderboard endpoint uses the service role and bypasses this policy
-- to aggregate across all users.
drop policy if exists "lifetime_completions_select_own"
  on public.lifetime_completions;
create policy "lifetime_completions_select_own"
  on public.lifetime_completions
  for select
  using (flow_address = auth.jwt() ->> 'sub');

-- ----------------------------------------------------------------------------
-- tsr_adjustments
--   Admin-controlled ledger of TSR point adjustments per user. Positive
--   `points` add to a user's balance; negative subtract. Reasons are
--   free-form (e.g. "manual grant", "event prize", "correction").
--
--   The user's total TSR balance is computed at read time as:
--     SUM(lifetime_completions.tsr_points) + SUM(tsr_adjustments.points)
--
--   Append-only by convention; we never delete rows so the audit trail
--   stays intact. To "undo" an adjustment, insert an equal-and-opposite
--   row with a corrective reason.
-- ----------------------------------------------------------------------------
create table if not exists public.tsr_adjustments (
  id           bigserial primary key,
  flow_address text not null
               check (flow_address ~ '^0x[0-9a-f]{16}$'),
  points       integer not null,
  reason       text,
  -- Flow address of the admin who made the change, captured for audit.
  created_by   text,
  created_at   timestamptz not null default now()
);

create index if not exists tsr_adjustments_flow_address_idx
  on public.tsr_adjustments (flow_address);

alter table public.tsr_adjustments enable row level security;

drop policy if exists "tsr_adjustments_select_own"
  on public.tsr_adjustments;
create policy "tsr_adjustments_select_own"
  on public.tsr_adjustments
  for select
  using (flow_address = auth.jwt() ->> 'sub');

-- ----------------------------------------------------------------------------
-- Row-Level Security
--   Our custom JWT contains `sub = <flow_address>` and `role = 'authenticated'`
--   (Supabase requires `role` for RLS evaluation). Policies let a user see
--   ONLY their own rows. All mutations go through the service role on the
--   server and bypass RLS.
-- ----------------------------------------------------------------------------
alter table public.users           enable row level security;
alter table public.owned_moments   enable row level security;
alter table public.earned_rewards  enable row level security;
alter table public.reward_rules    enable row level security;
alter table public.auth_nonces     enable row level security;

-- users: can read own profile.
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select
  using (flow_address = auth.jwt() ->> 'sub');

-- owned_moments: user can read only their own snapshots.
drop policy if exists "owned_moments_select_own" on public.owned_moments;
create policy "owned_moments_select_own" on public.owned_moments
  for select
  using (flow_address = auth.jwt() ->> 'sub');

-- earned_rewards: user can read only their own.
drop policy if exists "earned_rewards_select_own" on public.earned_rewards;
create policy "earned_rewards_select_own" on public.earned_rewards
  for select
  using (flow_address = auth.jwt() ->> 'sub');

-- reward_rules: enabled rules are readable to any authenticated user.
drop policy if exists "reward_rules_select_enabled" on public.reward_rules;
create policy "reward_rules_select_enabled" on public.reward_rules
  for select
  using (enabled = true);

-- auth_nonces: never readable by clients. Service role only.
-- (No policies created; RLS enabled means all client reads are blocked.)
