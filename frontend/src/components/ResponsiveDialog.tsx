import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function ResponsiveDialog({
  open,
  title,
  onClose,
  children,
  drawer = false,
  className = "",
  hideHeader = false,
  usePortal = true,
  initialFocusSelector,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  drawer?: boolean;
  className?: string;
  hideHeader?: boolean;
  usePortal?: boolean;
  initialFocusSelector?: string;
}) {
  const titleId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    // Lock the viewport, not body: body overflow creates a new scroll ancestor
    // and makes sticky navigation jump when the page is already scrolled.
    const scrollRoot = document.documentElement;
    const previousOverflow = scrollRoot.style.overflow;
    const root = document.getElementById("root");
    const previousInert = root?.inert ?? false;
    scrollRoot.style.overflow = "hidden";
    if (usePortal && root) root.inert = true;
    const focusable = () => Array.from(surface.current?.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,summary,[tabindex="0"]') ?? []).filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length && !el.closest('[inert]'));
    const initialFocus = initialFocusSelector ? surface.current?.querySelector<HTMLElement>(initialFocusSelector) : null;
    (initialFocus ?? focusable()[0] ?? surface.current)?.focus({ preventScroll: true });
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
      scrollRoot.style.overflow = previousOverflow;
      if (usePortal && root) root.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, usePortal, initialFocusSelector]);

  if (!open) return null;

  const dialogElement = (
    <div className={`overlay${drawer ? " drawer-overlay" : ""}`} role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div ref={surface} className={`${drawer ? "drawer" : "modal"} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={hideHeader ? undefined : titleId} aria-label={hideHeader ? title : undefined} tabIndex={-1}>
        {!hideHeader && (
          <header>
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-button dialog-close" aria-label={drawer ? "Đóng drawer" : "Đóng modal"} onClick={onClose}>
              <span aria-hidden="true">×</span>
            </button>
          </header>
        )}
        <div className={drawer ? "drawer-body" : "modal-body"}>{children}</div>
      </div>
    </div>
  );

  return usePortal ? createPortal(dialogElement, document.body) : dialogElement;
}
