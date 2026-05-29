/**
 * /api/battles
 * ---------------------------------------------------------------------------
 *   GET  → list battles for the current user (all statuses)
 *   POST → create a new battle challenge, or accept/decline an existing one
 *
 * Auth required.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import {
  createBattle,
  acceptBattle,
  declineBattle,
  getUserBattles,
  getUserRating,
} from "@/lib/battles";

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const sb = supabaseAdmin();
    const [battles, rating] = await Promise.all([
      getUserBattles(sb, address),
      getUserRating(sb, address),
    ]);

    // Decorate battles with usernames
    const allAddresses = new Set<string>();
    for (const b of battles) {
      allAddresses.add(b.challengerAddress);
      allAddresses.add(b.opponentAddress);
    }

    const { data: users } = await sb
      .from("users")
      .select("flow_address, topshot_username, avatar_url")
      .in("flow_address", [...allAddresses]);

    const userMap = new Map(
      ((users ?? []) as Array<{ flow_address: string; topshot_username: string | null; avatar_url: string | null }>)
        .map((u) => [u.flow_address, u]),
    );

    const decorated = battles.map((b) => ({
      ...b,
      challengerUsername:  userMap.get(b.challengerAddress)?.topshot_username ?? null,
      opponentUsername:    userMap.get(b.opponentAddress)?.topshot_username ?? null,
      challengerAvatarUrl: userMap.get(b.challengerAddress)?.avatar_url ?? null,
      opponentAvatarUrl:  userMap.get(b.opponentAddress)?.avatar_url ?? null,
    }));

    return NextResponse.json({ battles: decorated, rating });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      action: "create" | "accept" | "decline";
      battleId?: string;
      opponentAddress?: string;
      setId?: number;
      playId?: number;
    };

    const sb = supabaseAdmin();

    if (body.action === "create") {
      if (!body.opponentAddress || body.setId == null || body.playId == null) {
        return NextResponse.json(
          { error: "Missing opponentAddress, setId, or playId" },
          { status: 400 },
        );
      }
      if (body.opponentAddress === address) {
        return NextResponse.json(
          { error: "Cannot challenge yourself" },
          { status: 400 },
        );
      }
      const battle = await createBattle(
        sb,
        address,
        body.opponentAddress,
        body.setId,
        body.playId,
      );
      return NextResponse.json({ battle }, { status: 201 });
    }

    if (body.action === "accept") {
      if (!body.battleId) {
        return NextResponse.json({ error: "Missing battleId" }, { status: 400 });
      }
      const battle = await acceptBattle(sb, body.battleId, address);
      return NextResponse.json({ battle });
    }

    if (body.action === "decline") {
      if (!body.battleId) {
        return NextResponse.json({ error: "Missing battleId" }, { status: 400 });
      }
      await declineBattle(sb, body.battleId, address);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
