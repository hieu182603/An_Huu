import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { Icon } from "./ui";
export function DiscoveryImage({ src, alt, fallback }: { src?: string | null; alt: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <img src={!src || failed ? fallback : src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
export function DiscoveryError({ message, retry }: { message: string; retry: () => void }) {
  const en = useI18n().language === "en";
  return <div className="discovery-error" role="alert"><p>{message}</p><button className="overview-button secondary" onClick={retry}>{en ? "Retry" : "Thử lại"}</button></div>;
}
export function DiscoveryPager({ page, total, limit, change }: { page: number; total: number; limit: number; change: (page: number) => void }) {
  const en = useI18n().language === "en", pages = Math.max(1, Math.ceil(total / limit));
  return <nav className="discovery-pagination" aria-label={en ? "Pagination" : "Phân trang"}><button className="overview-button secondary" disabled={page <= 1} onClick={() => change(page-1)}><Icon name="chevron-left" />{en ? "Previous" : "Trước"}</button><span>{en ? "Page" : "Trang"} {page}/{pages} · {total} {en ? "results" : "kết quả"}</span><button className="overview-button secondary" disabled={page >= pages} onClick={() => change(page+1)}>{en ? "Next" : "Sau"}<Icon name="chevron-right" /></button></nav>;
}
