/**
 * lib/topshotUsername.ts
 * ---------------------------------------------------------------------------
 * Server-side resolver that verifies a Top Shot username actually belongs
 * to a given Flow address.
 *
 * Approach:
 *   1. Query Top Shot's public GraphQL `getUserProfileByUsername(username)`.
 *   2. Compare the returned `publicInfo.flowAddress` (16 hex chars, no `0x`)
 *      with the caller's session `flow_address` after normalizing both
 *      sides (lowercase, strip optional `0x`).
 *
 * This blocks impersonation: a user can claim only their own username.
 * If the username doesn't exist, doesn't have a flowAddress, or mismatches,
 * the verifier returns a typed error.
 *
 * No auth headers are needed — this query is publicly accessible.
 * ---------------------------------------------------------------------------
 */

const ENDPOINT = "https://public-api.nbatopshot.com/graphql";

const QUERY = /* GraphQL */ `
  query GetUserProfileByUsername($input: getUserProfileByUsernameInput!) {
    getUserProfileByUsername(input: $input) {
      publicInfo {
        dapperID
        flowAddress
        username
      }
    }
  }
`;

interface UserProfile {
  dapperID: string;
  flowAddress: string | null;
  username: string;
}

interface GraphQLResponse {
  data?: {
    getUserProfileByUsername?: {
      publicInfo?: UserProfile | null;
    } | null;
  } | null;
  errors?: Array<{ message: string }>;
}

export class TopShotUsernameError extends Error {
  constructor(
    message: string,
    public code:
      | "not_found"
      | "no_flow_address"
      | "mismatch"
      | "invalid_format"
      | "upstream_error",
  ) {
    super(message);
    this.name = "TopShotUsernameError";
  }
}

/** Strip optional `0x` prefix and lowercase. */
function normalizeFlowAddr(addr: string): string {
  const t = addr.trim().toLowerCase();
  return t.startsWith("0x") ? t.slice(2) : t;
}

/**
 * Username format check — mirrors what Top Shot allows on signup so we
 * don't waste a network call on garbage input. Permissive enough for
 * historical edge cases:
 *   - 1–30 chars
 *   - alphanumeric, underscore, dash, period
 */
const USERNAME_RE = /^[A-Za-z0-9_\-.]{1,30}$/;

export function isValidUsernameFormat(u: string): boolean {
  return USERNAME_RE.test(u);
}

/**
 * Verify that `username` belongs to `expectedAddress`.
 *
 * Returns the canonical username + Top Shot dapperID on success.
 * Throws a `TopShotUsernameError` with a stable `.code` on failure so
 * the API route can map it to a clean error response.
 */
export async function verifyTopShotUsername(
  username: string,
  expectedAddress: string,
): Promise<{ username: string; dapperID: string; flowAddress: string }> {
  const trimmed = username.trim();
  if (!isValidUsernameFormat(trimmed)) {
    throw new TopShotUsernameError(
      "Username contains invalid characters or is too long.",
      "invalid_format",
    );
  }

  let body: GraphQLResponse;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: { input: { username: trimmed } },
      }),
      // Short timeout so a slow upstream doesn't hang the route.
      signal: AbortSignal.timeout(8_000),
    });
    body = (await res.json()) as GraphQLResponse;
  } catch (e) {
    throw new TopShotUsernameError(
      `Could not reach Top Shot to verify username (${
        e instanceof Error ? e.message : "unknown error"
      }).`,
      "upstream_error",
    );
  }

  // Top Shot returns errors in `errors[]` for "user not found", with the
  // message "failed to get user by username from consumer search".
  const profile = body.data?.getUserProfileByUsername?.publicInfo;
  if (!profile) {
    throw new TopShotUsernameError(
      "No Top Shot user found with that exact username.",
      "not_found",
    );
  }
  if (!profile.flowAddress) {
    // Some old or banned profiles have no associated flow address.
    throw new TopShotUsernameError(
      "That Top Shot profile has no Flow address attached, so we can't verify ownership.",
      "no_flow_address",
    );
  }

  if (normalizeFlowAddr(profile.flowAddress) !== normalizeFlowAddr(expectedAddress)) {
    throw new TopShotUsernameError(
      "That username belongs to a different Flow wallet. Connect the wallet linked to your Top Shot account.",
      "mismatch",
    );
  }

  return {
    username: profile.username,
    dapperID: profile.dapperID,
    flowAddress: profile.flowAddress,
  };
}
