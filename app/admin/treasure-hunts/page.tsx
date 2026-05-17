"use client";

/**
 * app/admin/treasure-hunts/page.tsx
 */

import { TreasureHuntsAdmin } from "@/components/TreasureHuntsAdmin";

export default function TreasureHuntsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Treasure Hunts</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create and manage active treasure hunt challenges.
        </p>
      </div>
      <TreasureHuntsAdmin />
    </div>
  );
}
