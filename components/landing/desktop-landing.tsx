"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Space_Mono } from "next/font/google";

import "./landing.css";

const spaceMono = Space_Mono({ subsets: ["latin"], weight: "400", variable: "--font-space-mono", display: "swap" });

/** Tailwind's `md`: the page is hidden below it, so the 3D scene only starts at or above it. */
const DESKTOP = "(min-width: 48rem)";

/**
 * The signed-out landing page at desktop widths: a 3D putting green that the
 * wheel rolls the ball across, with three slides about the app. The scene
 * (three.js, in its own chunk) is only fetched and started at desktop widths,
 * so phones never download it.
 */
export function DesktopLanding() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const desktop = matchMedia(DESKTOP);
    let stop: (() => void) | undefined;
    let run = 0;
    const sync = () => {
      const current = ++run;
      stop?.();
      stop = undefined;
      if (!desktop.matches) return;
      void import("./landing-scene").then(({ startLandingScene }) => {
        if (current === run && root.current) stop = startLandingScene(root.current);
      });
    };
    sync();
    desktop.addEventListener("change", sync);
    return () => {
      desktop.removeEventListener("change", sync);
      run++;
      stop?.();
    };
  }, []);

  return (
    <div ref={root} className={`landing hidden md:block ${spaceMono.variable}`}>
      <div id="labels" aria-hidden />

      <header className="hud hud-left">
        <a className="logo" href="#top" aria-label="Golf AI Coach home">
          GOLF<span className="flag" aria-hidden />AI
        </a>
        <p className="mono">{"// © 2026 Golf AI Coach"}</p>
        <p className="mono">
          <Link href="/privacy">Privacy</Link>
          {" · "}
          <Link href="/terms">Terms</Link>
        </p>
      </header>

      <aside className="hud hud-right">
        <nav className="account mono" aria-label="Account">
          <Link className="chip" href="/login">Sign in</Link>
          <Link className="chip join" href="/signup">Get started</Link>
        </nav>
        <div className="intro">
          <p className="mono">////// Manifesto</p>
          <p className="mono manifesto">
            Our mission is to build the next generation of swing coaching at the intersection of Data, AI, and freshly cut grass.
          </p>
        </div>
      </aside>

      <footer className="hud hud-bottom">
        <p className="mono">
          Scroll to roll
          <br />
          the putt in.
        </p>
        <p className="mono chip hint">
          <span className="pulse" aria-hidden />
          Tap or click to putt.
        </p>
        <button id="sound" className="mono chip sound" type="button" aria-pressed="false">
          <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden>
            <path d="M1 5h3l4-3v10L4 9H1z" fill="none" stroke="currentColor" />
            <path className="x" d="M10.5 4.5l4 5m0-5l-4 5" stroke="currentColor" />
            <path className="w" d="M10.5 4.5q2 2.5 0 5M12.5 2.5q4 4.5 0 9" fill="none" stroke="currentColor" />
          </svg>
          <span>
            Sound: <b>Off</b>
          </span>
        </button>
      </footer>

      <aside className="hud coach mono" aria-live="polite" aria-label="Live coach read">
        <p className="kicker">
          {"// Coach read "}
          <span className="live" title="live">●</span>
        </p>
        <dl>
          <dt>Pin</dt><dd data-c="pin">–</dd>
          <dt>Break</dt><dd data-c="brk">–</dd>
          <dt>Pace</dt><dd data-c="pace">–</dd>
          <dt>Wind</dt><dd data-c="wind">–</dd>
          <dt>Putts</dt><dd data-c="putts">0</dd>
        </dl>
      </aside>

      <nav className="hud dots" aria-label="Chapters">
        <button type="button" aria-label="Intro" />
        <button type="button" aria-label="Swing Lab" />
        <button type="button" aria-label="Practice" />
        <button type="button" aria-label="Coach" />
      </nav>

      <div id="toast" className="toast" role="status" />

      {/*
        Every number here is something the app does, not a result it promises:
        no yards gained, no strokes saved. Check them against the code before
        changing a feature they describe.
      */}
      <main id="top">
        <Chapter side="right" num="01" kicker="Swing Lab" title="Every swing," em="scored."
          lede="Film a swing on your phone, face on or down the line. Your body is tracked frame by frame right in the browser, the swing is scored out of 10, and you get the one fault to fix first, with drills for it. A trend line shows whether it is getting better."
          stats={[["5", "swing checks"], ["1", "fix at a time"], ["0", "video sent to AI"]]} />
        <Chapter side="left" num="02" kicker="Practice" title="Practice you can" em="measure."
          lede="Thirty practice tests for the range, chipping and putting. Your recent rounds decide which come first, and each test's target tightens as you improve. Pick 15, 30 or 60 minutes and the session is built for you."
          stats={[["30", "practice tests"], ["10", "balls a goal test"], ["15–60", "minute sessions"]]} />
        <Chapter side="right" num="03" kicker="Coach" title="Your coach, from" em="your numbers."
          lede="Log a round shot by shot or as a live scorecard that saves each hole as you go. See fairways, greens, putts and scrambling, and with Premium, strokes gained by club and distance. Ask the coach anything about your game; it answers from your own data."
          stats={[["2", "ways to log a round"], ["10", "recent rounds read"], ["1", "priority, worst first"]]}>
          <Link className="cta" href="/signup">
            Open the coach <span aria-hidden>→</span>
          </Link>
        </Chapter>
      </main>
    </div>
  );
}

function Chapter({ side, num, kicker, title, em, lede, stats, children }: {
  side: "left" | "right";
  num: string;
  kicker: string;
  title: string;
  em: string;
  lede: string;
  stats: [string, string][];
  children?: React.ReactNode;
}) {
  return (
    <section className={`chapter ${side}`}>
      <div className="panel">
        <div className="panel-top">
          <span className="num" aria-hidden>{num}</span>
          <p className="kicker">////// {kicker}</p>
        </div>
        <h2>
          {title} <em>{em}</em>
        </h2>
        <p className="lede">{lede}</p>
        <ul className="stats">
          {stats.map(([value, label]) => (
            <li key={label}>
              <b>{value}</b>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        {children}
      </div>
    </section>
  );
}
