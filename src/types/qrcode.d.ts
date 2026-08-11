declare module "qrcode" {
  export interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: "low" | "medium" | "quartile" | "high";
    color?: { dark?: string; light?: string };
  }

  export function toDataURL(
    text: string,
    options?: QRCodeToDataURLOptions
  ): Promise<string>;

  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: QRCodeToDataURLOptions
  ): Promise<void>;

  const _default: {
    toDataURL: typeof toDataURL;
    toCanvas: typeof toCanvas;
  };
  export default _default;
}
