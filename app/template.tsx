/**
 * app/template.tsx
 * ---------------------------------------------------------------------------
 * Next.js re-mounts `template` on every navigation (unlike `layout` which
 * persists). Wrapping children in a div with the `.page-enter` CSS class
 * gives us a light fade-in + translateY on every route change — no JS
 * animation library needed, respects `prefers-reduced-motion` via
 * `motion-safe:` media query built into the keyframe.
 * ---------------------------------------------------------------------------
 */

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
