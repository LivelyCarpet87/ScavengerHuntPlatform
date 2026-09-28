import QRCode from "qrcode";

/**
 * QR code as a single SVG path (dark modules merged per row). Works on the
 * server and in the browser; render with <QrCode value="…" /> from
 * components/ui/qr-code.tsx.
 */
export function qrPath(text: string, ecc: "L" | "M" | "Q" | "H" = "M"): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: ecc });
  const { size, data } = qr.modules;
  let d = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (data[y * size + x]) {
        let run = 1;
        while (x + run < size && data[y * size + x + run]) run++;
        d += `M${x} ${y}h${run}v1h-${run}z`;
        x += run;
      } else {
        x++;
      }
    }
  }
  return { size, d };
}
