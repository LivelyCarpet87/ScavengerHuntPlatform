import type { ComponentProps } from "react";

/**
 * Plain <img> for submission media. Derivatives (thumb/display) are made at
 * upload time and served through the access-checked /files route, so the
 * Next image optimizer (which fetches without the viewer's cookie) can't be
 * used here.
 */
export function Img({ alt, loading = "lazy", decoding = "async", ...props }: ComponentProps<"img"> & { alt: string }) {
  // biome-ignore lint/performance/noImgElement: files are pre-sized derivatives behind an access check
  return <img alt={alt} loading={loading} decoding={decoding} draggable={false} {...props} />;
}
