"use client";

/**
 * Tiny client wrapper — renders the ⌘K pill in the header and dispatches a
 * synthetic keydown event that CommandPalette listens for.
 */
export function CommandPaletteHint() {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
        )
      }
      className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-zinc-500 transition hover:border-white/20 hover:text-zinc-300 lg:flex"
      aria-label="Open command palette"
    >
      <span className="font-mono">⌘K</span>
    </button>
  );
}
