"use client";

/**
 * components/AdminClaimsTable.tsx
 * ---------------------------------------------------------------------------
 * Admin-only view of user reward claims. Lets the admin mark a claim as
 * `sent` or `rejected` after airdropping (or declining) the prize.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Claim {
  flow_address: string;
  rule_id: string;
  topshot_username: string;
  reward_label: string | null;
  reward_set_id: number | null;
  reward_play_id: number | null;
  status: "pending" | "sent" | "rejected";
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export function AdminClaimsTable() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/claims", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { claims: Claim[] };
        setClaims(body.claims);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (c: Claim, status: Claim["status"]) => {
    setBusy(true);
    try {
      await fetch("/api/admin/claims", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flowAddress: c.flow_address,
          ruleId: c.rule_id,
          status,
        }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reward claims</CardTitle>
        <CardDescription>
          Users who earned a reward and submitted their NBA Top Shot username.
          Mark <strong>sent</strong> once you&apos;ve airdropped the prize.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : claims.length === 0 ? (
          <p className="text-sm text-zinc-500">No claims yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="py-2 pr-3">Flow address</th>
                  <th className="py-2 pr-3">Rule</th>
                  <th className="py-2 pr-3">Reward</th>
                  <th className="py-2 pr-3">Prize (set/play)</th>
                  <th className="py-2 pr-3">Top Shot user</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr
                    key={`${c.flow_address}_${c.rule_id}`}
                    className="border-b border-zinc-100 dark:border-zinc-900"
                  >
                    <td className="py-2 pr-3 font-mono">{c.flow_address}</td>
                    <td className="py-2 pr-3 font-mono">{c.rule_id}</td>
                    <td className="py-2 pr-3">{c.reward_label ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono">
                      {c.reward_set_id != null || c.reward_play_id != null
                        ? `${c.reward_set_id ?? "?"} / ${c.reward_play_id ?? "?"}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 font-medium">
                      {c.topshot_username}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant="outline"
                        className={
                          c.status === "sent"
                            ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                            : c.status === "rejected"
                              ? "border-red-500/40 text-red-600 dark:text-red-300"
                              : "border-amber-500/40 text-amber-700 dark:text-amber-300"
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || c.status === "sent"}
                          onClick={() => updateStatus(c, "sent")}
                        >
                          Mark sent
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || c.status === "rejected"}
                          onClick={() => updateStatus(c, "rejected")}
                          className="text-red-600"
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AdminClaimsTable;
