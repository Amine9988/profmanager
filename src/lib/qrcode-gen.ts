import QRCode from "qrcode/lib/core/qrcode.js";

export function generateQRCode(text: string, cellSize: number = 3): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const margin = 2;
  const total = size + margin * 2;
  const scale = Math.max(1, cellSize);
  const px = total * scale;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`;
  svg += `<rect width="${px}" height="${px}" fill="#fff"/>`;
  let d = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.modules.get(r, c)) {
        d += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
  }
  svg += `<path d="${d}" fill="#000"/>`;
  svg += `</svg>`;
  return svg;
}
