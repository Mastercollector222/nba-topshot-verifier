/**
 * /r/[code]
 * ---------------------------------------------------------------------------
 * Short-link entry point for referral codes. Redirects to /?ref=CODE so the
 * client-side <ReferralCapture /> component can pick it up and set the
 * HttpOnly cookie. We do not set the cookie here directly because we want
 * to keep the redirect cacheable and the cookie write strictly
 * client-driven (avoids accidentally caching a Set-Cookie header in CDN).
 * ---------------------------------------------------------------------------
 */

import { redirect } from "next/navigation";

interface Params {
  params: Promise<{ code: string }>;
}

export default async function ReferralShortLink({ params }: Params) {
  const { code } = await params;
  const safe = (code ?? "").trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(safe)) {
    redirect("/");
  }
  redirect(`/?ref=${safe}`);
}
