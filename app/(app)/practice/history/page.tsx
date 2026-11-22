import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { PracticeHistory } from "@/components/practice/practice-history";
import { RoundButton, ScreenTitle, TopBar } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Practice history" };
export const dynamic = "force-dynamic";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default async function PracticeHistoryPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const [sessions, profile] = await Promise.all([repo.getPracticeSessions(user.id), repo.getProfile(user.id)]);

  // This week, Monday first, in the server's calendar.
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const week = DAYS.map((name, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    const iso = isoDay(day);
    const done = sessions.filter((session) => session.status === "complete" && (session.completed_at ?? session.scheduled_for).slice(0, 10) === iso);
    return { name, iso, isToday: iso === isoDay(today), past: day < today, practised: done.length > 0, minutes: done.reduce((sum, session) => sum + (session.actual_duration ?? session.planned_duration), 0) };
  });
  const practisedDays = week.filter((day) => day.practised).length;
  const minutes = week.reduce((sum, day) => sum + day.minutes, 0);
  const planned = profile?.practice_days_per_week;

  return (
    <div className="flex flex-col gap-4">
      <TopBar
        left={
          <RoundButton href="/practice" label="Back to Practice">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
      />
      <ScreenTitle>
        Practice
        <br />
        history
      </ScreenTitle>

      <section aria-labelledby="week" className="flex flex-col gap-3 rounded-[28px] bg-ink p-4 text-white">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="week" className="dsp text-[20px] leading-none">
            This week
          </h2>
          <span className="text-[12px] font-semibold text-[#c9ccbf]">
            {planned ? `${practisedDays} of ${planned} planned` : `${practisedDays} day${practisedDays === 1 ? "" : "s"}`} · {minutes} min
          </span>
        </div>
        <ol aria-label="Days practised this week" className="grid grid-cols-7 gap-1.5">
          {week.map((day) => (
            <li
              key={day.iso}
              aria-label={`${day.name}${day.isToday ? ", today" : ""}${day.practised ? ", practised" : day.past ? ", rest" : ""}`}
              className={cn(
                "flex aspect-square items-center justify-center rounded-full text-[12px] font-bold",
                day.practised
                  ? "bg-accent"
                  : day.past && !day.isToday
                    ? "bg-[#3a3f33] text-[#a9ad9f]"
                    : "border-[1.5px] border-[#4a5042] text-[#a9ad9f]",
                day.isToday && "shadow-[0_0_0_2px_#23271f,0_0_0_4px_#e8c547]",
              )}
            >
              {day.name[0]}
            </li>
          ))}
        </ol>
      </section>

      <PracticeHistory sessions={sessions} />
    </div>
  );
}
