// A QR code for a share link, as an SVG data URL, so a client can open it from a phone. Dark modules on a light ground in
// both themes (scanners need that), with a quiet zone. The `qrcode` package is loaded on first use.

const DARK = "#141414"; // the ink token, written out: this is an image, not a styled element
const LIGHT = "#f5f2ec"; // the paper token

export async function qrDataUrl(text: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  const svg = await QRCode.toString(text, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: DARK, light: LIGHT } });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
