"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallState =
  | "hidden"
  | "android-prompt"
  | "ios-instructions";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    ("standalone" in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function InstallPrompt() {
  const [state, setState] = useState<InstallState>("hidden");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) return;

    if (isIos()) {
      setState("ios-instructions");
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setState("android-prompt");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setState("hidden");
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setState("hidden");
    }
    setDeferredPrompt(null);
    localStorage.setItem(STORAGE_KEY, "1");
  }

  if (state === "hidden") return null;

  return (
    <div
      role="banner"
      className="fixed bottom-[4.5rem] inset-x-3 z-40 sm:bottom-4 sm:left-auto sm:right-4 sm:inset-x-auto sm:max-w-sm animate-in fade-in slide-in-from-bottom-3 duration-300"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[oklch(0.11_0.012_265)] p-4 shadow-2xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-red-600 text-lg shadow-[0_4px_12px_-2px_rgba(251,113,38,0.6)]">
          🔥
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-100">Install Top Shot Verifier</p>

          {state === "android-prompt" && (
            <>
              <p className="mt-0.5 text-xs text-zinc-400">
                Add to your home screen for the full app experience.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={install}
                  className="flex-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-1.5 text-xs font-semibold text-black transition hover:brightness-110"
                >
                  Install
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
                >
                  Not now
                </button>
              </div>
            </>
          )}

          {state === "ios-instructions" && (
            <>
              <p className="mt-0.5 text-xs text-zinc-400">
                Tap{" "}
                <span className="inline-flex items-center gap-0.5 font-semibold text-zinc-200">
                  <svg viewBox="0 0 24 24" className="inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>{" "}
                  Share
                </span>{" "}
                then{" "}
                <span className="font-semibold text-zinc-200">Add to Home Screen</span>.
              </p>
              <button
                type="button"
                onClick={dismiss}
                className="mt-2 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300"
              >
                Dismiss
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Close install prompt"
          className="shrink-0 rounded-full p-1 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-300"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default InstallPrompt;

export function InstallAppButton() {
  const [state, setState] = useState<InstallState>("hidden");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isInStandaloneMode()) {
      setState("hidden");
      return;
    }
    if (isIos()) {
      setState("ios-instructions");
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setState("android-prompt");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setState("hidden");
    setDeferredPrompt(null);
  }

  if (state === "hidden") return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-200">Install App</p>
          {state === "ios-instructions" ? (
            <p className="mt-0.5 text-xs text-zinc-500">
              Tap{" "}
              <span className="font-semibold text-zinc-300">Share → Add to Home Screen</span>{" "}
              to install.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-500">
              Add to your home screen for a native app experience.
            </p>
          )}
        </div>
        {state === "android-prompt" && (
          <button
            type="button"
            onClick={install}
            className="shrink-0 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-110"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
