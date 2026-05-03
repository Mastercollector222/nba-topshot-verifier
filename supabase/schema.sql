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

-- Idempotent backfill for profile bio + avatar.
alter table public.users
  add column if not exists bio text
    check (bio is null or char_length(bio) <= 500);
alter table public.users
  add column if not exists avatar_url text;

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

-- users: can update only their own bio and avatar_url.
drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update
  using (flow_address = auth.jwt() ->> 'sub')
  with check (flow_address = auth.jwt() ->> 'sub');

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

-- ----------------------------------------------------------------------------
-- market_data_cache (Feature #7 — Portfolio Valuation)
--   Shared cross-user cache of NBA Top Shot market data, keyed by the
--   on-chain (set_id, play_id) edition pair. Anyone who fetches "Lebron
--   Base Set #1" warms the cache for everyone else, so a 13k-moment
--   portfolio that took ~2min to price the first time should resolve in
--   under a second on subsequent visits.
--
--   Row staleness:
--     - cached_at >= now() - interval '5 minutes'  → fresh, return as-is
--     - older                                      → background-refresh
--
--   The set_uuid / play_uuid columns memoize Top Shot's GraphQL UUID
--   mapping (which is otherwise expensive to look up). Once written they
--   never change because on-chain editions are immutable.
-- ----------------------------------------------------------------------------
create table if not exists public.market_data_cache (
  -- On-chain Cadence UInt32 ids stored as bigint for indexability.
  chain_set_id      bigint not null,
  chain_play_id     bigint not null,
  -- Top Shot GraphQL UUIDs that map to the chain pair above. Cached
  -- forever because they're a stable property of the edition.
  set_uuid          text,
  play_uuid         text,
  -- Market signals.
  floor_price       double precision,
  last_sale         double precision,
  average_price     double precision,
  seven_day_change  double precision,
  listing_count     integer,
  tier              text,
  -- Updated on every successful upstream refresh.
  cached_at         timestamptz not null default now(),
  primary key (chain_set_id, chain_play_id)
);

-- Lookup by staleness for a future cron-warmer that pre-refreshes
-- popular editions before users hit them.
create index if not exists market_data_cache_cached_at_idx
  on public.market_data_cache (cached_at);

alter table public.market_data_cache enable row level security;

-- Any authenticated user may read the cache — this data is public on
-- nbatopshot.com anyway, and sharing reads is the whole point of having
-- a server-side table here.
drop policy if exists "market_data_cache_select_authn"
  on public.market_data_cache;
create policy "market_data_cache_select_authn"
  on public.market_data_cache
  for select
  using (auth.role() = 'authenticated');
-- All writes go through the service role (server route), bypassing RLS.

-- ----------------------------------------------------------------------------
-- Treasure Hunt feature (Apr 2026)
--   A Treasure Hunt is a time-limited, multi-task challenge with a real
--   physical prize (e.g. silver round). Each "task" is a stored RewardRule
--   so the existing verifier evaluates it natively — no engine changes.
--
--   Three tables:
--     1. treasure_hunt_settings — singleton; stores the GLOBAL gate that
--        protects access to the entire /treasure-hunt section. Admin can
--        edit this without re-deploying. Default: own 5 of play 4732 with
--        all 5 locked.
--     2. treasure_hunts — one row per hunt: title, theme, prize, time
--        window, optional per-hunt extra gate, ordered task list.
--     3. treasure_hunt_entries — append-only ledger of users who
--        completed every task during a hunt's active window. Admin
--        manually selects winners from this list.
--
--   All writes go through service role; clients only read what RLS allows.
-- ----------------------------------------------------------------------------

create table if not exists public.treasure_hunt_settings (
  -- Single-row pattern. We pin the id so upserts always target the same row.
  id              text primary key default 'default',
  -- A RewardRule (jsonb) the user must satisfy to enter the hub at all.
  -- Nullable so admins can disable the global gate (open to everyone).
  global_gate     jsonb,
  updated_at      timestamptz not null default now()
);

-- Seed the default global gate: own 5 of play 4732 AND all 5 locked.
-- The `requireLocked: true` field is honored by the existing lock gate
-- in lib/verify.ts.
insert into public.treasure_hunt_settings (id, global_gate)
values (
  'default',
  jsonb_build_object(
    'id', 'global-gate',
    'type', 'quantity',
    'minCount', 5,
    'playId', 4732,
    'requireLocked', true,
    'reward', 'Treasure Hunt access'
  )
)
on conflict (id) do nothing;

alter table public.treasure_hunt_settings enable row level security;

-- Settings is publicly readable by any authenticated user — the gate
-- rule itself is not sensitive (it tells the user what they need to do).
drop policy if exists "treasure_hunt_settings_select_authn"
  on public.treasure_hunt_settings;
create policy "treasure_hunt_settings_select_authn"
  on public.treasure_hunt_settings
  for select
  using (auth.role() = 'authenticated');

create table if not exists public.treasure_hunts (
  id                text primary key,            -- slug, e.g. "spring-2026"
  title             text not null,
  theme             text,                        -- cosmetic accent name
  description       text,
  -- Prize metadata. Description is freeform Markdown-friendly text.
  prize_title       text not null,
  prize_description text,
  prize_image_url   text,
  -- Active window. Inclusive on starts_at, exclusive on ends_at.
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  -- Optional ADDITIONAL gate beyond the global one. Same RewardRule
  -- shape; nullable for hunts with no per-hunt extra gate.
  gate_rule         jsonb,
  -- Required tasks: an array of RewardRule objects. Order is preserved
  -- and used as display order in the UI.
  task_rules        jsonb not null default '[]'::jsonb,
  enabled           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Hunts can't end before they start.
  constraint treasure_hunts_window_chk check (ends_at > starts_at)
);

create index if not exists treasure_hunts_active_idx
  on public.treasure_hunts (enabled, ends_at);

alter table public.treasure_hunts enable row level security;

-- Anyone authenticated can read enabled hunts. Disabled hunts stay
-- hidden until admin re-enables.
drop policy if exists "treasure_hunts_select_enabled"
  on public.treasure_hunts;
create policy "treasure_hunts_select_enabled"
  on public.treasure_hunts
  for select
  using (enabled = true);

create table if not exists public.treasure_hunt_entries (
  hunt_id        text not null
                   references public.treasure_hunts(id) on delete cascade,
  flow_address   text not null,
  entered_at     timestamptz not null default now(),
  -- Snapshot of which task IDs were satisfied at entry time. Useful for
  -- audit / dispute resolution if rules change after the fact.
  matched_tasks  jsonb,
  primary key (hunt_id, flow_address)
);

create index if not exists treasure_hunt_entries_addr_idx
  on public.treasure_hunt_entries (flow_address);

alter table public.treasure_hunt_entries enable row level security;

-- Users can see only their own entries. Admins read via service role.
drop policy if exists "treasure_hunt_entries_select_own"
  on public.treasure_hunt_entries;
create policy "treasure_hunt_entries_select_own"
  on public.treasure_hunt_entries
  for select
  using (flow_address = auth.jwt() ->> 'sub');

-- ----------------------------------------------------------------------------
-- Badges (Apr 2026)
--   Achievement badges shown on a user's profile. Two tables:
--     1. `badges` — catalog of badges the admin has created. Each badge
--        optionally lists rule_ids / hunt_ids that auto-award it when the
--        user completes them. Admins can also award any badge manually.
--     2. `user_badges` — append-only ledger of which user owns which
--        badge, when, and how (auto vs manual).
-- ----------------------------------------------------------------------------
create table if not exists public.badges (
  id                  text primary key,             -- slug, e.g. "triple-threat"
  name                text not null,
  description         text,
  image_url           text,
  -- When set, earning ANY of these rule_ids / hunt_ids auto-awards the badge
  -- to the user. Empty arrays mean "manual-only".
  auto_rule_ids       text[] not null default '{}',
  auto_hunt_ids       text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.user_badges (
  flow_address  text not null
                check (flow_address ~ '^0x[0-9a-f]{16}$'),
  badge_id      text not null references public.badges(id) on delete cascade,
  awarded_at    timestamptz not null default now(),
  -- "auto" when earned through a rule/hunt trigger; "manual" when the
  -- admin granted it directly. Purely informational.
  source        text not null default 'auto'
                check (source in ('auto','manual')),
  primary key (flow_address, badge_id)
);

create index if not exists user_badges_addr_idx
  on public.user_badges (flow_address);

alter table public.badges       enable row level security;
alter table public.user_badges  enable row level security;

-- Badges catalog is publicly readable (it's basically decorative metadata).
drop policy if exists "badges_select_all" on public.badges;
create policy "badges_select_all"
  on public.badges
  for select
  using (true);

-- user_badges: anyone can read (public profile pages list them).
drop policy if exists "user_badges_select_all" on public.user_badges;
create policy "user_badges_select_all"
  on public.user_badges
  for select
  using (true);

-- ----------------------------------------------------------------------------
-- verify_jobs (May 2026)
--   Background-job ledger for /api/verify scans. The POST handler inserts
--   a 'queued' row, returns its id immediately, and uses Next.js `after()`
--   to run the actual chain scan. The dashboard polls
--   GET /api/verify/jobs/<id> for progress updates.
--
--   Phases:
--     'queued'      → row exists, worker hasn't started yet
--     'enumerating' → cheap GET_MOMENT_IDS pass per account
--     'metadata'    → full metadata fetch for NEW Moment ids
--     'lockstate'   → cheap lock-state refresh for EXISTING Moment ids
--     'persisting'  → writing snapshot diff + earned_rewards + badges
--     'succeeded' / 'failed' (terminal)
--
--   `fetched`/`total` are the *current phase's* counters and reset between
--   phases so the dashboard progress bar is meaningful per phase.
-- ----------------------------------------------------------------------------
create table if not exists public.verify_jobs (
  id              uuid primary key default gen_random_uuid(),
  flow_address    text not null
                  check (flow_address ~ '^0x[0-9a-f]{16}$'),
  status          text not null default 'queued'
                  check (status in ('queued','running','succeeded','failed')),
  phase           text,
  fetched         integer not null default 0,
  total           integer not null default 0,
  -- Per-phase counts (informational; computed once enumeration finishes).
  new_count       integer not null default 0,
  existing_count  integer not null default 0,
  removed_count   integer not null default 0,
  -- True when the user explicitly requested ?full=1 (skip delta path).
  full_rescan     boolean not null default false,
  error           text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists verify_jobs_addr_idx
  on public.verify_jobs (flow_address, created_at desc);

alter table public.verify_jobs enable row level security;

-- Users can read only their own jobs (server-side service role bypasses RLS
-- for writes). Dashboard polling uses a server route so this policy is
-- mostly belt-and-braces; keep it tight anyway.
drop policy if exists "verify_jobs_select_own" on public.verify_jobs;
create policy "verify_jobs_select_own"
  on public.verify_jobs
  for select
  using (flow_address = auth.jwt() ->> 'sub');
