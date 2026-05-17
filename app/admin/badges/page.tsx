"use client";

/**
 * app/admin/badges/page.tsx
 */

import { BadgesAdmin, UserProfileAdmin } from "@/components/BadgesAdmin";

export default function BadgesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Badges</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage badge definitions, award badges to users, and edit user profiles.
        </p>
      </div>
      <BadgesAdmin />
      <UserProfileAdmin />
    </div>
  );
}
