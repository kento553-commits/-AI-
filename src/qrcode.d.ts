declare module "qrcode" {
  type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  type ToDataURLOptions = {
    errorCorrectionLevel?: ErrorCorrectionLevel;
    margin?: number;
    width?: number;
  };

  const QRCode: {
    toDataURL(text: string, options?: ToDataURLOptions): Promise<string>;
  };

  export default QRCode;
}
