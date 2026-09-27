import type { ComponentProps } from "react";

/**
 * A plain <img> for uploads served by the access-checked /files route and for
 * on-device previews (blob: URLs). Neither can go through the Next image
 * optimizer, which fetches without the viewer's session cookie.
 */
export function PlainImg({ alt, ...props }: ComponentProps<"img"> & { alt: string }) {
  // biome-ignore lint/performance/noImgElement: access-checked and blob: URLs can't be optimized
  return <img alt={alt} decoding="async" {...props} />;
}
