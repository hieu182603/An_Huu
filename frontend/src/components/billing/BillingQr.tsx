import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renders the VietQR payload returned by payOS (`order.qrCode`) as an SVG, locally — nothing is sent anywhere. */
export function BillingQr({ value, label }: { value: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#0b2545", light: "#ffffff" } })
      .then(markup => { if (alive) setSvg(markup); })
      .catch(() => { if (alive) setSvg(null); });
    return () => { alive = false; };
  }, [value]);
  if (!svg) return null;
  return <div className="billing-qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
