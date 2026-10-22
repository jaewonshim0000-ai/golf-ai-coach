export const SWIPE_REVEAL = 88;

export function swipeIntent(x: number, y: number): "pending" | "horizontal" | "vertical" {
  if (Math.max(Math.abs(x), Math.abs(y)) < 8) return "pending";
  if (Math.abs(y) > Math.abs(x) * 1.1) return "vertical";
  if (Math.abs(x) > Math.abs(y) * 1.3) return "horizontal";
  return "pending";
}

export function swipeOffset(start: number, delta: number): number {
  return Math.max(0, Math.min(SWIPE_REVEAL, start + delta));
}
