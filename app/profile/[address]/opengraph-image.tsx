/**
 * app/profile/[address]/opengraph-image.tsx
 * ---------------------------------------------------------------------------
 * Dynamic OG share card for every public profile page.
 * Rendered by Next.js as a PNG at /profile/<address>/opengraph-image.
 *
 * Design tokens (all inline — ImageResponse JSX does not support Tailwind):
 *   Background : #0a0a0c
 *   Accent glow : rgba(251,113,38,0.35) — orange, top-right radial
 *   Gold text   : #f5a623
 *   Subtext     : #71717a  (zinc-500)
 *   Pill bg     : rgba(255,255,255,0.07)
 *   Pill border : rgba(255,255,255,0.12)
 * ---------------------------------------------------------------------------
 */

import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserTsr } from "@/lib/tsr";
import { getAllTsrBalances } from "@/lib/tsr";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Top Shot Verifier — collector profile";

function normalizeAddress(v: string): string | null {
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function tierLabel(rank: number | null): string {
  if (rank === null) return "Unranked";
  if (rank === 1) return "#1";
  return `#${rank.toLocaleString()}`;
}

export default async function Image({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: raw } = await params;
  const address = normalizeAddress(raw);

  // ── Fallback card ─────────────────────────────────────────────────────────
  if (!address) {
    return fallback("Invalid address");
  }

  const sb = supabaseAdmin();

  const [userRes, completionsRes, tsr, allBalances] = await Promise.all([
    sb
      .from("users")
      .select("topshot_username, avatar_url")
      .eq("flow_address", address)
      .maybeSingle(),
    sb
      .from("lifetime_completions")
      .select("rule_id", { count: "exact", head: true })
      .eq("flow_address", address),
    getUserTsr(address, sb),
    getAllTsrBalances(sb),
  ]);

  const username =
    (userRes.data as { topshot_username?: string | null } | null)
      ?.topshot_username ?? null;
  const avatarUrl =
    (userRes.data as { avatar_url?: string | null } | null)?.avatar_url ?? null;
  const challengesCompleted = completionsRes.count ?? 0;
  const tsrTotal = tsr.total;
  const tsrRank =
    tsrTotal > 0
      ? allBalances.filter((b) => b.total > tsrTotal).length + 1
      : null;

  const displayName = username ? `@${username}` : shortAddr(address);
  const subLine = username ? address : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0a0a0c",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          fontFamily: "sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Orange radial glow — top-right */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-120px",
            width: "560px",
            height: "560px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(251,113,38,0.35) 0%, transparent 70%)",
          }}
        />

        {/* Bottom-left subtle glow */}
        <div
          style={{
            position: "absolute",
            bottom: "-80px",
            left: "-80px",
            width: "360px",
            height: "360px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(251,113,38,0.12) 0%, transparent 70%)",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "64px",
            padding: "80px 80px 60px",
            flex: 1,
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: "200px",
              height: "200px",
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              border: "3px solid rgba(245,166,35,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(251,113,38,0.15)",
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                width={200}
                height={200}
                style={{ objectFit: "cover" }}
                alt=""
              />
            ) : (
              <span
                style={{
                  fontSize: "80px",
                  color: "#f5a623",
                }}
              >
                🏀
              </span>
            )}
          </div>

          {/* Text block */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              flex: 1,
              minWidth: 0,
            }}
          >
            {/* Display name */}
            <div
              style={{
                fontSize: "64px",
                fontWeight: 700,
                color: "#f1f1f1",
                lineHeight: 1.1,
                letterSpacing: "-1px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </div>

            {/* Address sub-line (only if username shown above) */}
            {subLine ? (
              <div
                style={{
                  fontSize: "22px",
                  fontFamily: "monospace",
                  color: "#71717a",
                  letterSpacing: "0.5px",
                }}
              >
                {subLine}
              </div>
            ) : null}

            {/* Stat pills */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: "16px",
                marginTop: "20px",
              }}
            >
              {/* Challenges */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "16px",
                  padding: "14px 28px",
                }}
              >
                <span style={{ fontSize: "34px", fontWeight: 700, color: "#f5a623" }}>
                  {challengesCompleted.toLocaleString()}
                </span>
                <span style={{ fontSize: "13px", color: "#71717a", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                  Challenges
                </span>
              </div>

              {/* TSR */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "16px",
                  padding: "14px 28px",
                }}
              >
                <span style={{ fontSize: "34px", fontWeight: 700, color: "#f5a623" }}>
                  {tsrTotal.toLocaleString()}
                </span>
                <span style={{ fontSize: "13px", color: "#71717a", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                  TSR Points
                </span>
              </div>

              {/* Rank */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "16px",
                  padding: "14px 28px",
                }}
              >
                <span style={{ fontSize: "34px", fontWeight: 700, color: "#f5a623" }}>
                  {tierLabel(tsrRank)}
                </span>
                <span style={{ fontSize: "13px", color: "#71717a", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                  TSR Rank
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 80px 40px",
          }}
        >
          {/* Flame + wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #fb923c, #ef4444)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
              }}
            >
              🔥
            </div>
            <span
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#52525b",
                letterSpacing: "0.5px",
              }}
            >
              topshotverifier.xyz
            </span>
          </div>

          <span style={{ fontSize: "13px", color: "#3f3f46", letterSpacing: "1px" }}>
            NBA TOP SHOT · FLOW MAINNET
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}

// ── Fallback for invalid/missing addresses ────────────────────────────────

function fallback(reason: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0a0a0c",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          gap: "24px",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-100px",
            right: "-100px",
            width: "480px",
            height: "480px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(251,113,38,0.25) 0%, transparent 70%)",
          }}
        />
        <span style={{ fontSize: "80px" }}>🏀</span>
        <div style={{ fontSize: "52px", fontWeight: 700, color: "#f1f1f1" }}>
          Top Shot Verifier
        </div>
        <div style={{ fontSize: "22px", color: "#71717a" }}>{reason}</div>
        <div style={{ fontSize: "16px", color: "#3f3f46", marginTop: "8px" }}>
          topshotverifier.xyz
        </div>
      </div>
    ),
    { ...size },
  );
}
