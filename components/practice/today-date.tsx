"use client";

/** Today's date as the eyebrow over the greeting, in the player's own time zone. */
export function TodayDate({ className }: { className?: string }) {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const day = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <span suppressHydrationWarning className={className}>
      {weekday} · {day}
    </span>
  );
}
