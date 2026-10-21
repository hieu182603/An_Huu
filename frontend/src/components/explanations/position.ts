/** Place the popup below the anchor, or above its top edge when there is no room,
 * so the selected phrase stays visible. `top` defaults to `y` for point anchors. */
export function positionExplainPopup(anchor: { x: number; y: number; top?: number }, popup: { width: number; height: number }, viewport: { width: number; height: number }, gap = 12) {
  let left = anchor.x + gap;
  let top = anchor.y + gap;
  if (left + popup.width > viewport.width - 8) left = anchor.x - popup.width - gap;
  if (top + popup.height > viewport.height - 8) top = (anchor.top ?? anchor.y) - popup.height - gap;
  return { left: Math.max(8, Math.min(left, viewport.width - popup.width - 8)), top: Math.max(8, Math.min(top, viewport.height - popup.height - 8)) };
}
