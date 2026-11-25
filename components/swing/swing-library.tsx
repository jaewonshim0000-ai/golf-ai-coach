"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

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

/** The golfer swinging, in flag yellow, for the latest-swing card. */
function Swinging() {
  return (
    <svg viewBox="0 0 350 200" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 h-full w-full">
      <rect width="350" height="200" fill="#2B3A1F" />
      <path d="M0 80 Q60 62 120 76 T240 68 T350 76 V200 H0Z" fill="#33461F" />
      <path d="M0 150 Q175 134 350 154 V200 H0Z" fill="#3E5426" />
      <g fill="none" stroke="#E8C547" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(120 10) scale(0.9)">
        <circle cx="66" cy="42" r="11" />
        <path d="M66 53v46M50 66h32M54 99h24M54 99l-5 50M78 99l3 50" />
        <path d="M50 66l14 50M82 66l-16 50M64 116l14 40">
          <animate
            attributeName="d"
            dur="3.2s"
            repeatCount="indefinite"
            keyTimes="0;.4;.55;.75;1"
            calcMode="spline"
            keySplines=".45 0 .25 1;.6 0 .4 1;.3 0 .2 1;.45 0 .3 1"
            values="M50 66l14 50M82 66l-16 50M64 116l14 40;M50 66l30 6M82 66l-2 6M80 72l24 -34;M50 66l14 50M82 66l-16 50M64 116l14 40;M50 66l-12 -18M82 66l-40 -14M40 50l-20 20;M50 66l14 50M82 66l-16 50M64 116l14 40"
          />
        </path>
      </g>
    </svg>
  );
}

/**
 * The swing library from the design: club chips, the latest swing as a card
 * with its score, the score trend, then the recordings as tiles.
 */
export function SwingLibrary({
  swings,
  latest,
  trend,
}: {
  swings: LibrarySwing[];
  latest: { id: string; title: string; when: string; score: number | null; toWork: number | null } | null;
  /** The score trend card, shown under the latest swing. */
  trend?: ReactNode;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [all, setAll] = useState(false);
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
            className={chip(filter === key, "min-w-[66px] flex-1")}
          >
            {label}
          </button>
        ))}
      </div>

      {latest && filter === "all" ? (
        <Link
          href={`/swing/${latest.id}`}
          aria-label={`Latest swing: ${latest.title}, ${latest.when}.${latest.score !== null ? ` Score ${latest.score.toFixed(1)} out of 10.` : ""}`}
          className="press-lg relative block h-[200px] overflow-hidden rounded-[28px] text-white"
        >
          <Swinging />
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
      {filter === "all" ? trend : null}

      <div className="flex items-baseline justify-between gap-3">
        <h2 className="dsp text-[24px] leading-none">Recordings · {shown.length}</h2>
        {shown.length > 4 ? (
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll(!all)}
            className="press text-[13px] font-bold text-accent underline underline-offset-2"
          >
            {all ? "Show fewer" : "Show all"}
          </button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-[22px] bg-surface px-4 py-5 text-[14px] text-fg-muted">No recordings with this club yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(all ? shown : shown.slice(0, 4)).map((swing) => (
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
