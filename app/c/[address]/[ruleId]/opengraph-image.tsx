/**
 * app/c/[address]/[ruleId]/opengraph-image.tsx
 * ---------------------------------------------------------------------------
 * Per-completion OG image. Rendered as 1200×630 PNG by Next.js whenever
 * /c/<addr>/<ruleId>/opengraph-image is requested (e.g. by the X/Discord
 * link unfurler). Inline styles only — ImageResponse JSX has no Tailwind.
 * ---------------------------------------------------------------------------
 */

import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Top Shot challenge completion";

function normalizeAddress(v: string): string | null {
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default async function Image({
  params,
}: {
  params: Promise<{ address: string; ruleId: string }>;
}) {
  const { address: rawAddr, ruleId: rawRuleId } = await params;
  const address = normalizeAddress(rawAddr);
  const ruleId = decodeURIComponent(rawRuleId);

  if (!address || !ruleId) return fallback("Invalid completion");

  const sb = supabaseAdmin();
  const [completionRes, userRes] = await Promise.all([
    sb
      .from("lifetime_completions")
      .select("reward, tsr_points, first_earned_at")
      .eq("flow_address", address)
      .eq("rule_id", ruleId)
      .maybeSingle(),
    sb
      .from("users")
      .select("topshot_username, avatar_url")
      .eq("flow_address", address)
      .maybeSingle(),
  ]);

  const completion = completionRes.data as
    | { reward: string; tsr_points: number; first_earned_at: string }
    | null;
  if (!completion) return fallback("Completion not found");

  const user = userRes.data as
    | { topshot_username: string | null; avatar_url: string | null }
    | null;
  const display = user?.topshot_username
    ? `@${user.topshot_username}`
    : shortAddr(address);

  const reward = completion.reward;
  const tsr = completion.tsr_points;

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
        {/* Trophy glow — top right */}
        <div
          style={{
            position: "absolute",
            top: "-160px",
            right: "-160px",
            width: "640px",
            height: "640px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(245,166,35,0.45) 0%, transparent 70%)",
          }}
        />
        {/* Flame glow — bottom left */}
        <div
          style={{
            position: "absolute",
            bottom: "-140px",
            left: "-140px",
            width: "520px",
            height: "520px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(251,113,38,0.30) 0%, transparent 70%)",
          }}
        />

        {/* Top kicker */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "60px 80px 0",
          }}
        >
          <span style={{ fontSize: "44px" }}>🏆</span>
          <span
            style={{
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "4px",
              color: "#f5a623",
              textTransform: "uppercase",
            }}
          >
            Challenge Earned
          </span>
        </div>

        {/* Reward title */}
        <div
          style={{
            display: "flex",
            padding: "24px 80px 0",
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: reward.length > 60 ? "60px" : "76px",
              fontWeight: 800,
              color: "#f1f1f1",
              lineHeight: 1.05,
              letterSpacing: "-1.5px",
              maxWidth: "1040px",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {reward}
          </div>
        </div>

        {/* User row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            padding: "0 80px 36px",
          }}
        >
          <div
            style={{
              width: "84px",
              height: "84px",
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              border: "3px solid rgba(245,166,35,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(251,113,38,0.15)",
            }}
          >
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                width={84}
                height={84}
                style={{ objectFit: "cover" }}
                alt=""
              />
            ) : (
              <span style={{ fontSize: "36px", color: "#f5a623" }}>🏀</span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: "32px",
                fontWeight: 700,
                color: "#f1f1f1",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {display}
            </div>
            <div
              style={{
                fontSize: "18px",
                color: "#71717a",
                fontFamily: "monospace",
              }}
            >
              {address}
            </div>
          </div>

          {tsr > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                background: "rgba(245,166,35,0.12)",
                border: "1.5px solid rgba(245,166,35,0.35)",
                borderRadius: "18px",
                padding: "12px 26px",
              }}
            >
              <span
                style={{ fontSize: "32px", fontWeight: 800, color: "#f5a623" }}
              >
                +{tsr.toLocaleString()}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: "#a1a1aa",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                }}
              >
                TSR Points
              </span>
            </div>
          ) : null}
        </div>

        {/* Footer wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 80px 32px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            paddingTop: "24px",
          }}
        >
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
                color: "#71717a",
                letterSpacing: "0.5px",
              }}
            >
              topshotcommunityrewards.com
            </span>
          </div>
          <span
            style={{ fontSize: "13px", color: "#3f3f46", letterSpacing: "1px" }}
          >
            NBA TOP SHOT · FLOW MAINNET
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}

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
        <span style={{ fontSize: "80px" }}>🏀</span>
        <div style={{ fontSize: "52px", fontWeight: 700, color: "#f1f1f1" }}>
          Top Shot Verifier
        </div>
        <div style={{ fontSize: "22px", color: "#71717a" }}>{reason}</div>
      </div>
    ),
    { ...size },
  );
}
