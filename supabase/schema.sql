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

-- Idempotent migration for shipping address fields on reward_claims.
alter table public.reward_claims add column if not exists ship_full_name text;
alter table public.reward_claims add column if not exists ship_address_line1 text;
alter table public.reward_claims add column if not exists ship_address_line2 text;
alter table public.reward_claims add column if not exists ship_city text;
alter table public.reward_claims add column if not exists ship_state text;
alter table public.reward_claims add column if not exists ship_postal_code text;
alter table public.reward_claims add column if not exists ship_country text;
alter table public.reward_claims add column if not exists ship_phone text;
alter table public.reward_claims add column if not exists ship_email text;
alter table public.reward_claims add column if not exists ship_notes text;

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
  expires_at  timestamptz,       -- optional hard deadline; null = never expires
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Idempotent migration for existing deployments that pre-date the column.
alter table public.reward_rules add column if not exists expires_at timestamptz;

-- Idempotent migration for physical reward fields.
alter table public.reward_rules add column if not exists is_physical boolean not null default false;
alter table public.reward_rules add column if not exists physical_title text;
alter table public.reward_rules add column if not exists physical_description text;
alter table public.reward_rules add column if not exists physical_image_url text;

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

-- ----------------------------------------------------------------------------
-- rank_history
-- ---------------------------------------------------------------------------
-- One row per (address, UTC day). Populated by POST /api/admin/snapshot-ranks
-- which is called by a daily cron job (e.g. Vercel Cron at midnight UTC or a
-- cURL call from a GitHub Actions schedule). The route upserts so running it
-- multiple times in the same day is safe — the last write wins.
--
-- tsr_rank is null for users with 0 TSR (not yet on the board).
-- ----------------------------------------------------------------------------
create table if not exists public.rank_history (
  flow_address          text    not null,
  day                   date    not null,
  tsr_total             integer not null,
  tsr_rank              integer,
  challenges_completed  integer not null default 0,
  primary key (flow_address, day)
);

create index if not exists rank_history_addr_day_idx
  on public.rank_history (flow_address, day desc);

alter table public.rank_history enable row level security;

-- Public read: profile pages use this data. No auth required.
drop policy if exists "rank_history_select_public" on public.rank_history;
create policy "rank_history_select_public"
  on public.rank_history
  for select
  using (true);

-- ----------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
-- Per-user inbox. Written server-side by badge grants, challenge completions,
-- and admin messages. Read and marked-read by the owner only.
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id           bigserial primary key,
  flow_address text not null,
  kind         text not null check (kind in ('badge','challenge','rank','admin','follow')),
  title        text not null,
  body         text,
  href         text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);

create index if not exists notifications_addr_created_idx
  on public.notifications (flow_address, created_at desc);

alter table public.notifications enable row level security;

-- Owner can read their own notifications.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications
  for select
  using (flow_address = auth.jwt() ->> 'sub');

-- Owner can update (mark read) their own notifications.
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications
  for update
  using (flow_address = auth.jwt() ->> 'sub')
  with check (flow_address = auth.jwt() ->> 'sub');

-- ----------------------------------------------------------------------------
-- tsr_milestones: admin-defined TSR point thresholds that unlock airdrops
-- ----------------------------------------------------------------------------
create table if not exists public.tsr_milestones (
  id                uuid primary key default gen_random_uuid(),
  threshold         integer not null,
  reward_label      text not null,
  bonus_tsr         integer not null default 0,
  moment_description text,
  enabled           boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- tsr_milestone_claims: one row per (user, milestone) when claimed
-- ----------------------------------------------------------------------------
create table if not exists public.tsr_milestone_claims (
  id                uuid primary key default gen_random_uuid(),
  flow_address      text not null
                    check (flow_address ~ '^0x[0-9a-f]{16}$'),
  milestone_id      uuid not null references public.tsr_milestones(id) on delete cascade,
  topshot_username  text not null,
  status            text not null default 'pending'
                    check (status in ('pending', 'fulfilled')),
  claimed_at        timestamptz not null default now(),
  unique (flow_address, milestone_id)
);

create index if not exists tsr_milestone_claims_address_idx
  on public.tsr_milestone_claims (flow_address);

-- RLS
alter table public.tsr_milestones        enable row level security;
alter table public.tsr_milestone_claims  enable row level security;

-- Everyone can read enabled milestones (to display on the milestones page).
drop policy if exists "tsr_milestones_select_enabled" on public.tsr_milestones;
create policy "tsr_milestones_select_enabled"
  on public.tsr_milestones
  for select
  using (enabled = true);

-- Users can read only their own claims.
drop policy if exists "tsr_milestone_claims_select_own" on public.tsr_milestone_claims;
create policy "tsr_milestone_claims_select_own"
  on public.tsr_milestone_claims
  for select
  using (flow_address = auth.jwt() ->> 'sub');

-- Users can insert their own claims.
drop policy if exists "tsr_milestone_claims_insert_own" on public.tsr_milestone_claims;
create policy "tsr_milestone_claims_insert_own"
  on public.tsr_milestone_claims
  for insert
  with check (flow_address = auth.jwt() ->> 'sub');

-- ----------------------------------------------------------------------------
-- leaderboard views
-- ----------------------------------------------------------------------------
-- Pre-aggregated views so /api/leaderboard doesn't page thousands of rows
-- and tally them in JS on every cache miss. Postgres does the GROUP BY once
-- per query; the function just forwards the result. Cuts active CPU on the
-- hot leaderboard route by an order of magnitude.
--
-- These are regular (non-materialized) views, so they always reflect live
-- data — no refresh job needed.
-- ----------------------------------------------------------------------------

-- Per-address completion counts + most-recent earn time, ready to sort.
create or replace view public.leaderboard_completions as
  select
    flow_address,
    count(*)::int               as completed,
    max(first_earned_at)        as last_earned_at
  from public.lifetime_completions
  group by flow_address;

-- "X / N" denominator: union of currently-enabled rules and any rule_id
-- ever completed (so deleted-but-historically-completed rules still count).
create or replace view public.leaderboard_total_rules as
  select count(*)::int as total
  from (
    select id as rule_id from public.reward_rules where enabled = true
    union
    select rule_id from public.lifetime_completions
  ) u;

-- ----------------------------------------------------------------------------
-- follows
--   Social graph. One row per (follower, followee). Composite PK enforces
--   "you can't follow the same user twice" and "no self-follow" via CHECK.
-- ----------------------------------------------------------------------------
create table if not exists public.follows (
  follower_address  text not null
                    check (follower_address ~ '^0x[0-9a-f]{16}$'),
  followee_address  text not null
                    check (followee_address ~ '^0x[0-9a-f]{16}$'),
  created_at        timestamptz not null default now(),
  primary key (follower_address, followee_address),
  check (follower_address <> followee_address)
);

create index if not exists follows_follower_idx
  on public.follows (follower_address, created_at desc);
create index if not exists follows_followee_idx
  on public.follows (followee_address, created_at desc);

alter table public.follows enable row level security;

-- Anyone can read the social graph (needed for follower counts on profiles).
drop policy if exists "follows_select_all" on public.follows;
create policy "follows_select_all"
  on public.follows
  for select
  using (true);

-- Users may only insert/delete rows where they are the follower.
drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
  on public.follows
  for insert
  with check (follower_address = auth.jwt() ->> 'sub');

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
  on public.follows
  for delete
  using (follower_address = auth.jwt() ->> 'sub');

-- ----------------------------------------------------------------------------
-- Direct Messages (DM) feature
--   dm_threads: one row per (user_a, user_b) pair, normalized so user_a < user_b.
--   dm_messages: the actual message content, FK to thread.
-- ----------------------------------------------------------------------------
create table if not exists public.dm_threads (
  id               uuid primary key default gen_random_uuid(),
  user_a           text not null check (user_a ~ '^0x[0-9a-f]{16}$'),
  user_b           text not null check (user_b ~ '^0x[0-9a-f]{16}$'),
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

create table if not exists public.dm_messages (
  id               bigserial primary key,
  thread_id        uuid not null references public.dm_threads(id) on delete cascade,
  sender_address   text not null check (sender_address ~ '^0x[0-9a-f]{16}$'),
  body             text not null check (char_length(body) between 1 and 4000),
  created_at       timestamptz not null default now(),
  read_at          timestamptz
);

create index if not exists dm_messages_thread_created_idx
  on public.dm_messages (thread_id, created_at desc);
create index if not exists dm_messages_sender_idx
  on public.dm_messages (sender_address);

alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;

-- SELECT policies: user must be part of the thread.
drop policy if exists "dm_threads_select_own" on public.dm_threads;
create policy "dm_threads_select_own"
  on public.dm_threads
  for select
  using (user_a = auth.jwt() ->> 'sub' or user_b = auth.jwt() ->> 'sub');

drop policy if exists "dm_messages_select_own" on public.dm_messages;
create policy "dm_messages_select_own"
  on public.dm_messages
  for select
  using (
    exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id
        and (t.user_a = auth.jwt() ->> 'sub' or t.user_b = auth.jwt() ->> 'sub')
    )
  );

-- Owner can update (mark read) their own messages (i.e., mark as read when recipient).
drop policy if exists "dm_messages_update_own" on public.dm_messages;
create policy "dm_messages_update_own"
  on public.dm_messages
  for update
  using (
    exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id
        and (t.user_a = auth.jwt() ->> 'sub' or t.user_b = auth.jwt() ->> 'sub')
    )
  )
  with check (
    exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id
        and (t.user_a = auth.jwt() ->> 'sub' or t.user_b = auth.jwt() ->> 'sub')
    )
  );

-- UPDATE notifications kind to include 'message' (idempotent).
alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('badge','challenge','rank','admin','follow','message'));

-- ----------------------------------------------------------------------------
-- push_subscriptions: Web Push API endpoint registrations per user.
-- ----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint     text        primary key,
  flow_address text        not null,
  p256dh       text        not null,
  auth         text        not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_addr_idx
  on public.push_subscriptions (flow_address);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions
  for select
  using (flow_address = auth.jwt() ->> 'sub');

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions
  for insert
  with check (flow_address = auth.jwt() ->> 'sub');

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions
  for update
  using (flow_address = auth.jwt() ->> 'sub')
  with check (flow_address = auth.jwt() ->> 'sub');

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions
  for delete
  using (flow_address = auth.jwt() ->> 'sub');

-- Idempotent: onboarding completion tracking.
alter table public.users
  add column if not exists onboarding_completed_at timestamptz;

-- ----------------------------------------------------------------------------
-- Gamification: idempotent TSR awards
--   Adds a `reason_key` to tsr_adjustments. A partial unique index on
--   (flow_address, reason_key) guarantees one-time / daily-capped awards
--   cannot be double-credited. Existing NULL reason_key rows (manual admin
--   grants) are unaffected.
-- ----------------------------------------------------------------------------
alter table public.tsr_adjustments
  add column if not exists reason_key text;

create unique index if not exists tsr_adjustments_addr_key_uidx
  on public.tsr_adjustments (flow_address, reason_key)
  where reason_key is not null;

-- ----------------------------------------------------------------------------
-- login_streaks: one row per user tracking current + longest consecutive-day
-- streak. Updated whenever the client calls POST /api/me/heartbeat (once per
-- page load). Streak milestone rewards are granted via tsr_adjustments with
-- reason_key = 'streak.day.<N>' (idempotent — awarded at most once per user).
-- ----------------------------------------------------------------------------
create table if not exists public.login_streaks (
  flow_address    text primary key
                  check (flow_address ~ '^0x[0-9a-f]{16}$'),
  current_streak  integer not null default 0,
  longest_streak  integer not null default 0,
  last_seen_date  date    not null,
  updated_at      timestamptz not null default now()
);

alter table public.login_streaks enable row level security;

drop policy if exists "login_streaks_select_own" on public.login_streaks;
create policy "login_streaks_select_own"
  on public.login_streaks
  for select
  using (flow_address = auth.jwt() ->> 'sub');

-- ----------------------------------------------------------------------------
-- Backfill: award 50 TSR to every user who already has a non-empty avatar_url
-- and 20 TSR to every user who already has a non-empty bio. Idempotent via
-- unique (flow_address, reason_key).
-- ----------------------------------------------------------------------------
insert into public.tsr_adjustments (flow_address, points, reason, reason_key)
select flow_address, 50, 'Gamification: profile avatar (backfill)', 'profile.avatar.first'
from public.users
where avatar_url is not null and btrim(avatar_url) <> ''
on conflict (flow_address, reason_key) where reason_key is not null do nothing;

insert into public.tsr_adjustments (flow_address, points, reason, reason_key)
select flow_address, 20, 'Gamification: profile bio (backfill)', 'profile.bio.first'
from public.users
where bio is not null and btrim(bio) <> ''
on conflict (flow_address, reason_key) where reason_key is not null do nothing;

-- ----------------------------------------------------------------------------
-- Referral system
--   - referral_code   : 8-char [A-F0-9] unique code shown on the user's
--                       /rewards page. Used in share links like
--                       https://site/r/AB12CD34
--   - referred_by     : flow_address of the user who referred them. Set
--                       exactly once (on first sign-in if a tsr_ref cookie is
--                       present and points to a valid code). Never reassigned.
--   - referred_at     : timestamp of attribution.
--
-- The +200 TSR award to the referrer (and optional welcome bonus to the
-- referred user) is recorded as a tsr_adjustments row with
-- reason_key = 'referral.signup.<new_user_address>' so the same referee can
-- only ever credit the referrer once.
-- ----------------------------------------------------------------------------
alter table public.users
  add column if not exists referral_code text
    check (referral_code is null or referral_code ~ '^[A-F0-9]{8}$');

alter table public.users
  add column if not exists referred_by text
    check (referred_by is null or referred_by ~ '^0x[0-9a-f]{16}$');

alter table public.users
  add column if not exists referred_at timestamptz;

create unique index if not exists users_referral_code_uidx
  on public.users (referral_code)
  where referral_code is not null;

create index if not exists users_referred_by_idx
  on public.users (referred_by)
  where referred_by is not null;

-- Backfill: deterministic codes for existing users so old links keep working.
-- Uses md5(flow_address)[0..8] uppercased — stable, unique with high
-- probability across the user base. Re-running is a no-op (only fills nulls).
update public.users
set referral_code = upper(substr(md5(flow_address), 1, 8))
where referral_code is null;

-- ----------------------------------------------------------------------------
-- Profile customization tiers
--   Tier is derived at request time from the user's TSR balance, so it is
--   NOT stored on the row. These columns hold the customization values
--   themselves; whether a user is allowed to set them is enforced at the
--   API layer (lib/tiers.ts) based on current TSR.
--
--   - accent_color : 7-char hex like '#fb7126'. Silver+ unlocks the picker.
--   - banner_url   : whitelisted https image URL. Gold+ unlocks setting.
-- ----------------------------------------------------------------------------
alter table public.users
  add column if not exists accent_color text
    check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$');

alter table public.users
  add column if not exists banner_url text;

-- ----------------------------------------------------------------------------
-- Email notifications
--   Double opt-in flow: user submits email → row goes into
--   email_verifications with a one-time token → user clicks the link in
--   the verification email → users.email + users.email_verified_at are
--   set. Until verified, the user does NOT receive challenge notifications.
--
--   - email                          : verified deliverable address (lowercased)
--   - email_verified_at              : timestamp of confirmation click
--   - email_notifications_enabled    : per-user opt-out toggle (default true)
--   - unsubscribe_token              : random token for one-click unsubscribe;
--                                      auto-generated on first subscribe
-- ----------------------------------------------------------------------------
alter table public.users
  add column if not exists email text
    check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

alter table public.users
  add column if not exists email_verified_at timestamptz;

alter table public.users
  add column if not exists email_notifications_enabled boolean not null default true;

alter table public.users
  add column if not exists unsubscribe_token text;

create unique index if not exists users_email_lower_uidx
  on public.users (lower(email)) where email is not null;

create unique index if not exists users_unsubscribe_token_uidx
  on public.users (unsubscribe_token) where unsubscribe_token is not null;

-- ----------------------------------------------------------------------------
-- email_verifications
--   Pending double-opt-in tokens. Single-use, expire in 1 hour. The DB
--   doesn't auto-purge; rows are harmless once consumed_at is set or
--   expires_at has passed.
-- ----------------------------------------------------------------------------
create table if not exists public.email_verifications (
  token         text primary key,
  flow_address  text not null references public.users(flow_address) on delete cascade,
  email         text not null,
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists email_verifications_addr_idx
  on public.email_verifications (flow_address);

-- ----------------------------------------------------------------------------
-- reward_rules.notify_sent_at
--   Timestamp of when the admin clicked "Notify subscribers" for a rule.
--   The button is greyed out client-side once this is set, and the API
--   refuses to fire a second broadcast for the same rule. Manual nulling
--   in SQL is the only way to re-enable (intentional safety valve).
-- ----------------------------------------------------------------------------
alter table public.reward_rules
  add column if not exists notify_sent_at timestamptz;

alter table public.reward_rules
  add column if not exists notify_sent_count integer;

-- ----------------------------------------------------------------------------
-- Physical fulfillment tracking on reward_claims
--   Orthogonal to the existing 'status' (pending|sent|rejected) which is the
--   decision state. shipping_status tracks the operational pipeline.
-- ----------------------------------------------------------------------------
alter table public.reward_claims
  add column if not exists shipping_status text
    check (shipping_status is null or shipping_status in (
      'not_required', 'queued', 'packed', 'shipped', 'delivered', 'returned'
    ));

alter table public.reward_claims
  add column if not exists carrier text;

alter table public.reward_claims
  add column if not exists tracking_number text;

alter table public.reward_claims
  add column if not exists tracking_url text;

alter table public.reward_claims
  add column if not exists shipped_at timestamptz;

alter table public.reward_claims
  add column if not exists delivered_at timestamptz;

alter table public.reward_claims
  add column if not exists admin_note_internal text;

create index if not exists reward_claims_shipping_status_idx
  on public.reward_claims (shipping_status)
  where shipping_status is not null;

-- Backfill: physical rewards default to 'queued', digital to 'not_required'
-- This runs safely on every migration because shipping_status is already set
-- for rows where it was previously backfilled or manually edited.
update public.reward_claims rc
set shipping_status = 'queued'
from public.reward_rules rr
where rc.rule_id = rr.id
  and rr.is_physical = true
  and rc.shipping_status is null;

update public.reward_claims rc
set shipping_status = 'not_required'
from public.reward_rules rr
where rc.rule_id = rr.id
  and rr.is_physical = false
  and rc.shipping_status is null;

-- ---------------------------------------------------------------------------
-- Admin audit log
-- ---------------------------------------------------------------------------

create table if not exists public.admin_actions (
  id            bigserial primary key,
  actor_address text not null,
  action        text not null,
  target_type   text,
  target_id     text,
  before_data   jsonb,
  after_data    jsonb,
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists admin_actions_created_idx
  on public.admin_actions (created_at desc);

create index if not exists admin_actions_actor_idx
  on public.admin_actions (actor_address, created_at desc);

