import { qrPath } from "@/lib/qr";
import { cn } from "@/lib/utils";

/** Crisp vector QR code. Keep the default quiet zone for reliable scanning. */
export function QrCode({
  value,
  size = 192,
  className,
  label,
  quiet = 2,
}: {
  value: string;
  size?: number;
  className?: string;
  /** Accessible description, e.g. "QR code to join team Otters". */
  label?: string;
  quiet?: number;
}) {
  const { size: n, d } = qrPath(value);
  const total = n + quiet * 2;
  return (
    <svg
      viewBox={`${-quiet} ${-quiet} ${total} ${total}`}
      width={size}
      height={size}
      role="img"
      aria-label={label ?? "QR code"}
      shapeRendering="crispEdges"
      className={cn("rounded-sm bg-white text-black", className)}
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}
