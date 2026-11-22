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
        <p className="mono">{"// Copyright © 2026"}</p>
        <p className="mono">
          Golf AI Coach, Inc.
          <br />
          All Rights Reserved.
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
        <button type="button" aria-label="Green Reader" />
        <button type="button" aria-label="Caddie AI" />
      </nav>

      <div id="toast" className="toast" role="status" />

      <main id="top">
        <Chapter side="right" num="01" kicker="Swing Lab" title="Every swing," em="decoded."
          lede="Dolor sit fairway, consectetur birdie elit. Sed do eagle tempor incididunt ut divot et dolore magna grip."
          stats={[["240", "fps capture"], ["12", "swing checkpoints"], ["+9", "yards, avg gain"]]} />
        <Chapter side="left" num="02" kicker="Green Reader" title="Read greens like a" em="caddie."
          lede="Quis nostrud bunker ullamco laboris nisi ut aliquip ex ea commodo chippa, in reprehenderit in velvet greens."
          stats={[["0.1°", "slope accuracy"], ["4", "cups of break read"], ["−2.3", "putts per round"]]} />
        <Chapter side="right" num="03" kicker="Caddie AI" title="Your coach," em="on every hole."
          lede="Excepteur sint occaecat cupidatat, sunt in culpa qui officia mulligan. Lorem ipsum flagstick."
          stats={[["24/7", "on-call caddie"], ["36", "holes remembered"], ["1", "tap club pick"]]}>
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
