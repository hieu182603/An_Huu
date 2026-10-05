import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function ResponsiveDialog({ open, title, onClose, children, drawer = false }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; drawer?: boolean;
}) {
  const titleId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById("root");
    const previousInert = root?.inert ?? false;
    document.body.style.overflow = "hidden";
    window.scrollTo({ left: 0 });
    if (root) root.inert = true;
    const focusable = () => Array.from(surface.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length && !el.closest('[inert]'));
    focusable()[0]?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); surface.current?.focus({ preventScroll: true }); return; }
      const outside = !surface.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus({ preventScroll: true }); }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus({ preventScroll: true }); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={`overlay${drawer ? " drawer-overlay" : ""}`} role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div ref={surface} className={drawer ? "drawer" : "modal"} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header><h2 id={titleId}>{title}</h2><button type="button" className="icon-button dialog-close" aria-label={drawer ? "Đóng drawer" : "Đóng modal"} onClick={onClose}><span aria-hidden="true">×</span></button></header>
        <div className={drawer ? "drawer-body" : "modal-body"}>{children}</div>
      </div>
    </div>, document.body,
  );
}
