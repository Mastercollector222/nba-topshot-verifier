/**
 * twitter-image.tsx — re-exports the same ImageResponse as opengraph-image.
 * X/Twitter picks this named route for summary_large_image cards.
 */
export { default, size, contentType, alt } from "./opengraph-image";
