"use client";

/**
 * app/admin/announcements/page.tsx
 */

import { AnnouncementAdmin } from "@/components/AnnouncementAdmin";

export default function AnnouncementsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Announcements</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Publish and manage site-wide announcements shown to all users.
        </p>
      </div>
      <AnnouncementAdmin />
    </div>
  );
}
