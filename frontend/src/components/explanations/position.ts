export function positionExplainPopup(anchor: { x: number; y: number }, popup: { width: number; height: number }, viewport: { width: number; height: number }, gap = 12) {
  let left = anchor.x + gap;
  let top = anchor.y + gap;
  if (left + popup.width > viewport.width - 8) left = anchor.x - popup.width - gap;
  if (top + popup.height > viewport.height - 8) top = anchor.y - popup.height - gap;
  return { left: Math.max(8, Math.min(left, viewport.width - popup.width - 8)), top: Math.max(8, Math.min(top, viewport.height - popup.height - 8)) };
}
