"use client";

/**
 * components/CloudinaryUploadButton.tsx
 * ---------------------------------------------------------------------------
 * Reusable wrapper around the Cloudinary Upload Widget. Designed for user
 * avatar uploads but generic enough for any single-image use-case.
 *
 * Usage:
 *   <CloudinaryUploadButton
 *     onUploaded={({ secureUrl, publicId, displayUrl }) => { ... }}
 *   />
 *
 * Behaviour:
 *   - Lazy-loads the official widget script the first time the button is
 *     clicked (kept out of the initial bundle).
 *   - Opens the widget pre-configured with face-aware square cropping,
 *     1:1 aspect ratio, max-1 file, sources: local / url / camera.
 *   - On success: calls onUploaded with `secureUrl` (raw upload),
 *     `publicId`, and a transformation URL (`displayUrl`) suitable for
 *     direct use as an avatar.
 *
 * Env:
 *   - NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME — your Cloudinary cloud name.
 *     Set this in `.env.local`. The unsigned upload preset
 *     `user_avatar` is assumed to exist with face-aware cropping.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

const WIDGET_SRC = "https://upload-widget.cloudinary.com/latest/global/all.js";
// TODO: replace with your Cloudinary cloud name, or set
// NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME in .env.local.
const CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "YOUR_CLOUD_NAME";
const UPLOAD_PRESET = "user_avatar";

/** Final transformation applied to the public_id for avatar display. */
const AVATAR_TRANSFORM = "c_crop,g_face,w_200,h_200,r_max";

export interface UploadResult {
  secureUrl: string;
  publicId: string;
  /** Pre-built transformation URL for direct <img> / Image use. */
  displayUrl: string;
}

/** Helper to build the final avatar URL from a public_id. */
export function buildAvatarUrl(publicId: string): string {
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${AVATAR_TRANSFORM}/${publicId}`;
}

// Minimal type surface for the widget instance — we only call open() on it.
interface CloudinaryWidget {
  open: () => void;
}
interface CloudinaryGlobal {
  createUploadWidget: (
    options: Record<string, unknown>,
    callback: (
      err: unknown,
      result: { event?: string; info?: { secure_url: string; public_id: string } },
    ) => void,
  ) => CloudinaryWidget;
}
declare global {
  interface Window {
    cloudinary?: CloudinaryGlobal;
  }
}

/** Load the widget script exactly once (cached on window). */
function loadWidgetScript(): Promise<CloudinaryGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cannot load widget on the server"));
  }
  if (window.cloudinary) return Promise.resolve(window.cloudinary);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${WIDGET_SRC}"]`,
    );
    const onReady = () => {
      if (window.cloudinary) resolve(window.cloudinary);
      else reject(new Error("Cloudinary widget failed to initialise"));
    };
    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("Script load error")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = WIDGET_SRC;
    s.async = true;
    s.onload = onReady;
    s.onerror = () => reject(new Error("Script load error"));
    document.head.appendChild(s);
  });
}

export function CloudinaryUploadButton({
  onUploaded,
  label = "Upload profile picture",
  className = "",
  disabled = false,
}: {
  onUploaded: (r: UploadResult) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Persist the widget instance across opens so the user doesn't pay the
  // construction cost on every click after the first.
  const widgetRef = useRef<CloudinaryWidget | null>(null);

  const handleClick = useCallback(async () => {
    setErr(null);
    if (CLOUD_NAME === "YOUR_CLOUD_NAME") {
      setErr("Cloudinary not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.");
      return;
    }
    try {
      setLoading(true);
      const cloudinary = await loadWidgetScript();
      if (!widgetRef.current) {
        widgetRef.current = cloudinary.createUploadWidget(
          {
            cloudName: CLOUD_NAME,
            uploadPreset: UPLOAD_PRESET,
            maxFiles: 1,
            multiple: false,
            cropping: true,
            croppingAspectRatio: 1,
            croppingShowDimensions: true,
            showSkipCropButton: false,
            sources: ["local", "url", "camera"],
            // Face-aware auto-crop on the upload preset side; the
            // displayUrl below also pins g_face for the final render.
            folder: "avatars",
            clientAllowedFormats: ["png", "jpg", "jpeg", "webp", "gif"],
            maxImageFileSize: 5_000_000, // 5 MB
            // UI polish to match the dark theme.
            theme: "minimal",
            styles: {
              palette: {
                window: "#0c0c0e",
                sourceBg: "#111114",
                windowBorder: "#27272a",
                tabIcon: "#fb923c",
                inactiveTabIcon: "#71717a",
                menuIcons: "#fb923c",
                link: "#fb923c",
                action: "#f59e0b",
                inProgress: "#fb923c",
                complete: "#22c55e",
                error: "#ef4444",
                textDark: "#000000",
                textLight: "#fafafa",
              },
            },
          },
          (error, result) => {
            if (error) {
              setErr(
                error instanceof Error
                  ? error.message
                  : typeof error === "string"
                    ? error
                    : "Upload failed",
              );
              return;
            }
            if (result?.event === "success" && result.info) {
              const { secure_url, public_id } = result.info;
              onUploaded({
                secureUrl: secure_url,
                publicId: public_id,
                displayUrl: buildAvatarUrl(public_id),
              });
            }
          },
        );
      }
      widgetRef.current.open();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open uploader");
    } finally {
      setLoading(false);
    }
  }, [onUploaded]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className={
          "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-xs font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 " +
          className
        }
      >
        <UploadCloud className="h-4 w-4" />
        {loading ? "Opening…" : label}
      </button>
      {err ? <p className="text-[11px] text-red-400">{err}</p> : null}
    </div>
  );
}

export default CloudinaryUploadButton;
