import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Strokes gained always carries its sign. A bare "1.7" is ambiguous. */
export function signed(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : rounded === 0 ? "" : ""}${rounded.toFixed(digits)}`;
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function ratio(made: number, total: number): string {
  return total === 0 ? "—" : `${made}/${total}`;
}

export function formatDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatShortDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function relativeDays(iso: string, today = new Date()): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function toParLabel(toPar: number | null): string {
  if (toPar === null) return "—";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : String(toPar);
}

/** Positive strokes gained is good; positive score is bad. Colour accordingly. */
export function sgTone(value: number): "good" | "bad" | "neutral" {
  if (value > 0.05) return "good";
  if (value < -0.05) return "bad";
  return "neutral";
}

export function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
