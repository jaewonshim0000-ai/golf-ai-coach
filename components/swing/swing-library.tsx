"use client";

import Link from "next/link";
import { useState } from "react";

import { SwingVideo } from "@/components/swing/swing-video";
import { chip } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type LibrarySwing = {
  id: string;
  title: string;
  date: string;
  videoUrl: string | null;
  group: "driver" | "woods" | "irons" | "wedges" | "putter";
  badge: { label: string; tone: "good" | "warn" | "neutral" };
};

const FILTERS = [
  ["all", "All"],
  ["driver", "Driver"],
  ["irons", "Irons"],
  ["wedges", "Wedges"],
  ["woods", "Woods"],
] as const;

const BADGE = {
  good: "bg-accent-soft text-accent-strong",
  warn: "bg-warn-soft text-warn",
  neutral: "bg-white/90 text-[#1e211b]",
};

/** The golfer at the top of the backswing, in flag yellow, for the latest-swing card. */
function TopOfSwing() {
  return (
    <svg viewBox="0 0 350 280" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 h-full w-full">
      <rect width="350" height="280" fill="#2b3a1f" />
      <path d="M0 110 Q60 88 120 104 T240 96 T350 104 V280 H0Z" fill="#33461f" />
      <path d="M0 200 Q175 182 350 204 V280 H0Z" fill="#3e5426" />
      <g fill="none" stroke="#E8C547" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="178" cy="78" r="12" />
        <path d="M178 90 V140" />
        <path d="M160 102 L196 104 L214 86" />
        <path d="M160 102 L198 98" />
        <path d="M214 86 L236 64" strokeWidth="3" />
        <path d="M164 140 L194 140" />
        <path d="M166 140 L162 194" />
        <path d="M192 140 L194 194" />
      </g>
      <g fill="#E8C547">
        <circle cx="178" cy="78" r="0" />
        <circle cx="160" cy="102" r="3.5" />
        <circle cx="196" cy="104" r="3.5" />
        <circle cx="164" cy="140" r="3.5" />
        <circle cx="194" cy="140" r="3.5" />
        <circle cx="188" cy="118" r="3.5" />
      </g>
    </svg>
  );
}

/**
 * The swing library from the design: club chips, the latest swing as a big
 * card with its score, then every recording as a tile.
 */
export function SwingLibrary({
  swings,
  latest,
}: {
  swings: LibrarySwing[];
  latest: { id: string; title: string; when: string; score: number | null; toWork: number | null } | null;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const shown = swings.filter((swing) => filter === "all" || swing.group === filter);
  const present = new Set(swings.map((swing) => swing.group));
  return (
    <div className="flex flex-col gap-4">
      <div className="no-bar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Club">
        {FILTERS.filter(([key]) => key === "all" || present.has(key) || key !== "woods").map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={chip(filter === key, "min-w-[80px]")}
          >
            {label}
          </button>
        ))}
      </div>

      {latest && filter === "all" ? (
        <Link
          href={`/swing/${latest.id}`}
          aria-label={`Latest swing: ${latest.title}, ${latest.when}.${latest.score !== null ? ` Score ${latest.score.toFixed(1)} out of 10.` : ""}`}
          className="press-lg relative block h-[260px] overflow-hidden rounded-[28px] text-white"
        >
          <TopOfSwing />
          <span className="dsp absolute left-4 top-4 inline-flex h-[30px] items-center rounded-full bg-white/90 px-3 text-[10px] text-[#1e211b]">
            Latest · {latest.when}
          </span>
          <div className="glass absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-[22px] border border-white/20 bg-white/[0.18] p-3.5 pl-4">
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold">{latest.title}</p>
              <p className="mt-0.5 text-[13px] text-white/85">
                {latest.toWork === null
                  ? "Open to review"
                  : latest.toWork === 0
                    ? "Everything in band"
                    : `${latest.toWork} thing${latest.toWork === 1 ? "" : "s"} to work on`}
              </p>
            </div>
            <span className="font-display tabular flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-white text-[20px] text-[#1e211b]">
              {latest.score !== null ? latest.score.toFixed(1) : "—"}
            </span>
          </div>
        </Link>
      ) : null}

      <h2 className="dsp text-[26px] leading-none">Recordings · {shown.length}</h2>
      {shown.length === 0 ? (
        <p className="rounded-[22px] bg-surface px-4 py-5 text-[14px] text-fg-muted">No recordings with this club yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {shown.map((swing) => (
            <li key={swing.id}>
              <Link href={`/swing/${swing.id}`} className="press-lg relative block overflow-hidden rounded-[22px] bg-[#2b3a1f]">
                <SwingVideo id={swing.id} videoUrl={swing.videoUrl} className="aspect-[3/4] rounded-none bg-[#2b3a1f]" />
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgb(20_24_15_/_0.75))]" />
                <span className={cn("dsp pointer-events-none absolute right-2.5 top-2.5 inline-flex h-7 items-center rounded-full px-2.5 text-[10px] normal-case tracking-normal", BADGE[swing.badge.tone])}>
                  {swing.badge.label}
                </span>
                <span className="pointer-events-none absolute inset-x-3 bottom-3 truncate text-[13px] font-bold text-white">
                  {swing.title} · {swing.date}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
