/**
 * GET /api/admin/me
 * Reports whether the signed-in user is an admin.
 * Used by `/admin` page to decide what to render — never a security boundary.
 * (The real gate is `requireAdmin()` on every mutating route.)
 */

import { NextResponse } from "next/server";
import { getSessionAddress, isAdminAddress } from "@/lib/admin";

export async function GET() {
  const address = await getSessionAddress();
  return NextResponse.json({
    address,
    isAdmin: isAdminAddress(address),
  });
}
