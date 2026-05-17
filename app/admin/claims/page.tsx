"use client";

/**
 * app/admin/claims/page.tsx
 */

import { AdminClaimsTable } from "@/components/AdminClaimsTable";

export default function ClaimsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Claims</h1>
        <p className="mt-1 text-sm text-zinc-500">
          All reward claims across every user and rule. Search, filter, bulk-action, or export.
        </p>
      </div>
      <AdminClaimsTable />
    </div>
  );
}
