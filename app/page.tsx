import Link from "next/link";
import { ConnectWallet } from "@/components/ConnectWallet";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * app/page.tsx
 * ---------------------------------------------------------------------------
 * Marketing / landing view. Cinematic dark hero, flame-gradient headline,
 * glass "how it works" rail, and a single prominent CTA into the dashboard.
 * Purely visual — no app logic lives here.
 * ---------------------------------------------------------------------------
 */
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Mainnet · Read-only" />

      {/* -------------------- HERO -------------------- */}
      <main className="flex-1">
        <section className="relative overflow-hidden">
          {/* Decorative flame spotlight behind the hero copy. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
          >
            <div className="absolute left-1/2 top-[-20%] h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,theme(colors.orange.500/35%),transparent_70%)] blur-3xl" />
            <div className="absolute bottom-[-30%] right-[-10%] h-[500px] w-[800px] rounded-full bg-[radial-gradient(closest-side,theme(colors.amber.400/20%),transparent_70%)] blur-3xl" />
          </div>

          <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 pb-20 pt-20 text-center sm:pt-28">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-300 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.9)]" />
              Account Linking · Hybrid Custody
            </span>

            <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
              Prove your collection. <br className="hidden sm:block" />
              <span className="text-flame">Unlock the hardwood.</span>
            </h1>

            <p className="max-w-2xl text-pretty text-base text-zinc-300/90 sm:text-lg">
              The premium ownership verifier for NBA Top Shot. Connect your
              Flow wallet, surface every Moment across your linked Dapper
              accounts, and redeem collector rewards. Read-only — you never
              sign a transaction.
            </p>

            <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 via-orange-500 to-red-500 px-7 text-sm font-semibold text-black shadow-[0_8px_40px_-8px_rgba(251,113,38,0.65)] transition hover:brightness-110"
              >
                Open the Dashboard
                <svg
                  className="h-4 w-4 transition group-hover:translate-x-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M5 12h14" />
                  <path d="m13 5 7 7-7 7" />
                </svg>
              </Link>
              <div className="hidden sm:block">
                <ConnectWallet />
              </div>
            </div>
            <div className="sm:hidden">
              <ConnectWallet />
            </div>
          </div>
        </section>

        {/* -------------------- HOW IT WORKS -------------------- */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Connect",
                body:
                  "Sign in with Dapper or any Flow wallet through FCL Discovery. We never request signing keys.",
              },
              {
                step: "02",
                title: "Discover",
                body:
                  "Every linked child Dapper account surfaces automatically through Hybrid Custody.",
              },
              {
                step: "03",
                title: "Earn",
                body:
                  "Match your Moments against live challenges. Earned rewards get an on-chain claim flow.",
              },
            ].map((f) => (
              <article
                key={f.step}
                className="group glass relative overflow-hidden rounded-2xl p-6 transition duration-300 hover:-translate-y-0.5 hover:ring-flame"
              >
                <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-orange-500/10 blur-2xl transition-opacity group-hover:opacity-70" />
                <span className="font-mono text-xs tracking-widest text-orange-400/80">
                  {f.step}
                </span>
                <h3 className="mt-1 text-2xl font-semibold tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300/80">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* -------------------- STATS RIBBON -------------------- */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-24">
          <div className="glass flex flex-col items-stretch divide-y divide-white/5 overflow-hidden rounded-2xl sm:flex-row sm:divide-x sm:divide-y-0">
            {[
              { k: "Flow Mainnet", v: "Read-only access" },
              { k: "Hybrid Custody", v: "All child accounts" },
              { k: "TopShotLocking", v: "Lock-aware rewards" },
              { k: "No signatures", v: "Zero-risk scans" },
            ].map((s) => (
              <div key={s.k} className="flex-1 px-6 py-5">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                  {s.k}
                </p>
                <p className="mt-1 text-base font-semibold text-zinc-100">
                  {s.v}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 px-6 py-5 text-center text-[11px] tracking-wide text-zinc-500">
        Top Shot · <span className="font-mono">0x0b2a3299cc857e29</span>
        {" · "}Hybrid Custody ·{" "}
        <span className="font-mono">0xd8a7e05a7ac670c0</span>
      </footer>
    </div>
  );
}
