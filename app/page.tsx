import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Check,
  Flag,
  Lock,
  MessageCircle,
  Share,
  SquarePlus,
  Target,
  User,
  Video,
} from "lucide-react";

import { InstallButton } from "@/components/landing/install-button";
import { LIMITS } from "@/lib/billing/plans";
import * as repo from "@/lib/db/repo";

/**
 * The public landing page. Signed-in players never see it: they go straight to
 * the app, which is also where the installed app starts.
 *
 * Every screen drawn here is an illustration with sample numbers, hidden from
 * assistive tech; the claims in the copy are the ones the app actually keeps.
 */
export default async function Home() {
  if (await repo.currentUser()) redirect("/practice");

  return (
    <div className="overflow-x-clip bg-bg text-fg">
      <Hero />
      <Ticker />
      <Numbers />
      <Features />
      <Steps />
      <Pricing />
      <Install />
      <Footer />
    </div>
  );
}

const CTA =
  "press dsp inline-flex h-14 items-center justify-center gap-2 rounded-full bg-gold px-7 text-[13px] text-[#1e211b] transition-[filter,transform] hover:brightness-105";
const EYEBROW = "dsp text-[11px] tracking-[0.17em]";

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-accent text-white">
        <Flag className="h-4 w-4" strokeWidth={2.4} />
      </span>
      <span className="font-display text-[20px] uppercase leading-none">Golf AI Coach</span>
    </span>
  );
}

// -------------------------------------------------------------------- hero

function Hero() {
  return (
    <header className="hero-art relative isolate overflow-hidden rounded-b-[40px] text-white">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgb(18_22_13/0.9)_0%,rgb(18_22_13/0.62)_48%,rgb(18_22_13/0.3)_100%)]"
      />

      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login" className="dsp press hidden h-10 items-center rounded-full px-4 text-[11px] hover:bg-white/10 sm:inline-flex">
            Sign in
          </Link>
          <InstallButton className="dsp press inline-flex h-10 items-center rounded-full bg-white/90 px-4 text-[11px] text-[#1e211b] hover:bg-white">
            Get the app
          </InstallButton>
        </div>
      </nav>

      <div className="mx-auto grid max-w-6xl gap-14 px-5 pb-20 pt-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:pb-28 lg:pt-14">
        <div className="rise">
          <p className={`${EYEBROW} inline-flex h-[30px] items-center rounded-full border-[1.5px] border-white/70 px-3.5`}>
            The coach that learns your game
          </p>
          <h1 className="dsp mt-6 text-[clamp(52px,9.4vw,124px)] leading-[0.92]">
            Fix the shots
            <br />
            that cost you <span className="text-gold">strokes.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/85 md:text-[19px]">
            Golf AI Coach tracks your rounds, measures your practice and reads your swing on video.
            Then it tells you the one thing to work on next.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <InstallButton className={CTA}>
              Get the app free <ArrowRight className="h-4 w-4" />
            </InstallButton>
            <a href="#features" className="dsp press inline-flex h-14 items-center rounded-full border-[1.5px] border-white/70 px-7 text-[13px] hover:bg-white/10">
              See what it does
            </a>
          </div>
          <p className="mt-5 text-[13px] text-white/70">
            Free to start. No app store. Works on iPhone, Android and desktop.
          </p>
        </div>

        <Phone />
      </div>
    </header>
  );
}

const SAMPLE_SG = [
  { label: "Off the tee", value: 0.4 },
  { label: "Approach", value: -0.9 },
  { label: "Short game", value: -0.3 },
  { label: "Putting", value: -1.8 },
];

/** Bars grow out from a centre line: gained to the right, lost to the left. */
function SgRows({ rows }: { rows: typeof SAMPLE_SG }) {
  return (
    <div className="space-y-2.5">
      {rows.map(({ label, value }) => (
        <div key={label} className="grid grid-cols-[84px_1fr_34px] items-center gap-2 text-[11px]">
          <span className="text-fg-muted">{label}</span>
          <span className="flex h-2 rounded-full bg-track">
            <span className="flex w-1/2 justify-end">
              {value < 0 ? <span className="h-2 rounded-l-full bg-bad" style={{ width: `${(-value / 2) * 100}%` }} /> : null}
            </span>
            <span className="w-1/2">
              {value > 0 ? <span className="block h-2 rounded-r-full bg-accent" style={{ width: `${(value / 2) * 100}%` }} /> : null}
            </span>
          </span>
          <span className={`tabular text-right font-semibold ${value < 0 ? "text-bad" : "text-accent-strong"}`}>
            {value > 0 ? "+" : "−"}
            {Math.abs(value).toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 72 72" width={size} height={size}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="7" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke="var(--c-gold)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(score / 10) * c} ${c}`}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="43" textAnchor="middle" fill="currentColor" fontFamily="var(--font-display)" fontSize="22">
        {score.toFixed(1)}
      </text>
    </svg>
  );
}

function Phone() {
  return (
    <div aria-hidden className="relative mx-auto w-[286px] lg:mr-6">
      <div className="rotate-[3deg] rounded-[48px] bg-[#14170f] p-2.5 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)] ring-1 ring-white/15">
        <div className="overflow-hidden rounded-[38px] bg-bg text-fg">
          <div className="hero-art-range relative flex h-28 items-end p-4 text-white">
            <div className="hero-scrim absolute inset-0" />
            <span className="relative font-display text-[30px] uppercase leading-none">Practice</span>
          </div>
          <div className="space-y-2.5 p-3">
            <div className="rounded-[22px] bg-ink p-4 text-ink-fg">
              <p className="dsp text-[9px] tracking-[0.17em] text-gold">Your priority</p>
              <p className="mt-1.5 font-display text-[26px] uppercase leading-none">Lag putting</p>
              <p className="mt-1.5 text-[11px] text-white/70">Costing you 1.8 strokes a round</p>
              <span className="dsp mt-3 inline-flex h-8 items-center rounded-full bg-accent px-3.5 text-[10px] text-accent-fg">
                Start 30 minutes
              </span>
            </div>
            <div className="rounded-[22px] bg-surface p-4">
              <p className="dsp mb-3 text-[9px] tracking-[0.17em] text-fg-subtle">Strokes gained · last 10</p>
              <SgRows rows={SAMPLE_SG} />
            </div>
          </div>
          <div className="mx-3 mb-3 flex h-12 items-center justify-between rounded-full bg-ink px-2 text-white/60">
            <span className="dsp flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[10px] text-accent-fg">
              <Target className="h-3.5 w-3.5" /> Practice
            </span>
            <Flag className="h-4 w-4" />
            <Video className="h-4 w-4" />
            <User className="mr-3 h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-3 flex -rotate-[5deg] items-center gap-3 rounded-[22px] bg-surface py-2.5 pl-2.5 pr-4 text-fg shadow-raised sm:-left-16">
        <ScoreRing score={7.4} size={56} />
        <div>
          <p className="dsp text-[9px] tracking-[0.17em] text-fg-subtle">Swing score</p>
          <p className="text-[13px] font-semibold">Up 0.6 this month</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ ticker

const WORDS = ["Strokes gained", "Dispersion", "Lag putting", "Driver carry", "Up and downs", "Start line", "Swing score", "Fairways hit"];

function Ticker() {
  const row = (
    <div className="flex shrink-0 items-center">
      {WORDS.map((word, i) => (
        <span key={word} className="flex items-center">
          <span className={`font-display px-6 text-[44px] uppercase leading-none md:text-[64px] ${i % 2 ? "outline-text" : ""}`}>
            {word}
          </span>
          <Flag className="h-5 w-5 text-accent" strokeWidth={2.4} />
        </span>
      ))}
    </div>
  );
  return (
    <div aria-hidden className="overflow-hidden py-10 text-fg md:py-14">
      <div className="ticker flex w-max">
        {row}
        {row}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- numbers

const NUMBERS = [
  { value: "30", label: "practice tests for range, chipping and putting" },
  { value: "4", label: "strokes-gained categories, tee to green" },
  { value: "10", label: "point swing score from your own video" },
  { value: "1", label: "priority to work on, updated as you play" },
];

function Numbers() {
  return (
    <section className="mx-auto max-w-6xl px-5">
      <div className="reveal grid grid-cols-2 gap-x-6 gap-y-10 rounded-[var(--radius-card)] bg-ink px-7 py-10 text-ink-fg md:grid-cols-4 md:px-10 md:py-12">
        {NUMBERS.map(({ value, label }) => (
          <div key={label}>
            <p className="font-display text-[72px] leading-[0.9] text-gold md:text-[96px]">{value}</p>
            <p className="mt-3 max-w-[18ch] text-[13px] leading-snug text-white/75">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- features

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="reveal max-w-3xl">
      <p className={`${EYEBROW} text-accent-strong`}>{eyebrow}</p>
      <h2 className="dsp mt-3 text-[clamp(40px,6.4vw,80px)] leading-[0.95]">{title}</h2>
      {children ? <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-fg-muted">{children}</p> : null}
    </div>
  );
}

function Bullets({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <ul className={`space-y-2.5 text-[15px] ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={3} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ten finishes around a target, with the dispersion the range tests report. */
function TargetPlot() {
  const shots = [
    [112, 70], [138, 96], [96, 104], [150, 62], [124, 118],
    [84, 78], [160, 110], [118, 88], [134, 132], [102, 58],
  ];
  return (
    <svg viewBox="0 0 240 190" className="w-full" aria-hidden>
      {[84, 60, 36, 12].map((r) => (
        <circle key={r} cx="120" cy="95" r={r} fill="none" stroke="var(--c-border-strong)" strokeWidth="1.5" />
      ))}
      <line x1="120" y1="6" x2="120" y2="184" stroke="var(--c-border-strong)" strokeDasharray="3 5" />
      <line x1="30" y1="95" x2="210" y2="95" stroke="var(--c-border-strong)" strokeDasharray="3 5" />
      <ellipse cx="122" cy="94" rx="46" ry="42" fill="var(--c-accent)" fillOpacity="0.14" stroke="var(--c-accent)" strokeWidth="1.5" strokeDasharray="5 4" />
      {shots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" fill="var(--c-accent)" stroke="var(--c-surface)" strokeWidth="1.5" />
      ))}
      <circle cx="120" cy="95" r="3.5" fill="var(--c-gold)" stroke="var(--c-fg)" strokeWidth="1.5" />
    </svg>
  );
}

/** A tracked body at the top of the backswing. */
function Skeleton() {
  const bones = [
    [100, 58, 82, 66], [100, 58, 120, 64], [82, 66, 90, 122], [120, 64, 114, 122], [90, 122, 114, 122],
    [90, 122, 82, 164], [82, 164, 78, 204], [114, 122, 122, 164], [122, 164, 128, 204],
    [82, 66, 112, 46], [112, 46, 138, 34], [120, 64, 142, 54], [142, 54, 138, 34],
  ];
  const joints = [[82, 66], [120, 64], [90, 122], [114, 122], [82, 164], [122, 164], [78, 204], [128, 204], [112, 46], [142, 54], [138, 34]];
  return (
    <svg viewBox="0 0 200 220" className="h-full w-full" aria-hidden>
      <path d="M150 204 Q40 150 60 60 Q72 14 138 34" fill="none" stroke="var(--c-gold)" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 5" />
      <line x1="138" y1="34" x2="62" y2="22" stroke="#f4f1e8" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="100" cy="212" rx="60" ry="5" fill="#000" fillOpacity="0.25" />
      {bones.map(([x1, y1, x2, y2]) => (
        <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8db04a" strokeWidth="3.5" strokeLinecap="round" />
      ))}
      <circle cx="100" cy="40" r="11" fill="none" stroke="#8db04a" strokeWidth="3.5" />
      {joints.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#e8c547" />
      ))}
    </svg>
  );
}

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-8 px-5 pt-24 md:pt-32">
      <SectionHead
        eyebrow="What it does"
        title={
          <>
            Three tools.
            <br />
            One answer.
          </>
        }
      >
        Most golf apps hand you a pile of stats. This one connects your rounds, your practice and
        your swing, so you always know what deserves your next bucket of balls.
      </SectionHead>

      <div className="mt-12 grid gap-4 md:grid-cols-6">
        {/* Play */}
        <article className="reveal rounded-[var(--radius-card)] bg-surface p-7 md:col-span-4 md:p-9">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <p className={`${EYEBROW} flex items-center gap-2 text-accent-strong`}>
                <Flag className="h-3.5 w-3.5" /> Play
              </p>
              <h3 className="dsp mt-3 text-[38px] leading-[0.98]">See where the shots went</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                Log a round shot by shot or as a scorecard. Strokes gained shows what each part of
                your game is worth, measured against golfers at your level.
              </p>
              <Bullets
                className="mt-5"
                items={["Compare against Tour, scratch or any handicap", "Break it down by distance, club and lie", "Fairways, greens and three-putts from a scorecard"]}
              />
            </div>
            <div aria-hidden className="rounded-[var(--radius-soft)] bg-surface-2 p-5">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <p className="dsp text-[9px] tracking-[0.17em] text-fg-subtle">Saturday · 18 holes</p>
                  <p className="font-display text-[52px] leading-none">84</p>
                </div>
                <span className="dsp rounded-full bg-bad-soft px-3 py-1.5 text-[10px] text-bad">−2.6 vs 10 hcp</span>
              </div>
              <SgRows rows={SAMPLE_SG} />
            </div>
          </div>
        </article>

        {/* Ask */}
        <article className="reveal flex flex-col justify-between rounded-[var(--radius-card)] bg-accent p-7 text-accent-fg md:col-span-2 md:p-9">
          <MessageCircle className="h-8 w-8" strokeWidth={2} />
          <div className="mt-10">
            <h3 className="dsp text-[38px] leading-[0.98]">Ask your coach</h3>
            <p className="mt-3 text-[15px] leading-relaxed opacity-90">
              &ldquo;Why do I keep missing right from 150?&rdquo; Ask in plain words and get an
              answer built from your own rounds and sessions.
            </p>
          </div>
        </article>

        {/* Practice */}
        <article className="reveal rounded-[var(--radius-card)] bg-surface p-7 md:col-span-3 md:p-9">
          <p className={`${EYEBROW} flex items-center gap-2 text-accent-strong`}>
            <Target className="h-3.5 w-3.5" /> Practice
          </p>
          <h3 className="dsp mt-3 text-[38px] leading-[0.98]">Practice you can measure</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            Thirty tests with real numbers: dispersion in yards, carry distance, makes out of ten.
            Pick a goal and a length and the app builds the session.
          </p>
          <div className="mt-6 grid grid-cols-[1fr_auto] items-center gap-5 rounded-[var(--radius-soft)] bg-surface-2 p-5" aria-hidden>
            <TargetPlot />
            <div className="space-y-4">
              <div>
                <p className="font-display text-[40px] leading-none">18</p>
                <p className="dsp text-[9px] tracking-[0.17em] text-fg-subtle">Yards wide</p>
              </div>
              <div>
                <p className="font-display text-[40px] leading-none text-accent-strong">−6</p>
                <p className="dsp text-[9px] tracking-[0.17em] text-fg-subtle">Since May</p>
              </div>
            </div>
          </div>
        </article>

        {/* Swing */}
        <article className="reveal relative overflow-hidden rounded-[var(--radius-card)] bg-ink p-7 text-ink-fg md:col-span-3 md:p-9">
          <p className={`${EYEBROW} flex items-center gap-2 text-gold`}>
            <Video className="h-3.5 w-3.5" /> Swing
          </p>
          <h3 className="dsp mt-3 max-w-[11ch] text-[38px] leading-[0.98]">Film it. Get a score.</h3>
          <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-white/75">
            Record a swing on your phone. The app tracks your body through every position, scores
            it out of ten and compares it with a reference swing.
          </p>
          <div className="mt-6 flex items-center gap-4 sm:pr-[42%]" aria-hidden>
            <ScoreRing score={7.4} />
            <div className="flex flex-wrap gap-1.5">
              {["Address", "Top", "Impact", "Finish"].map((phase, i) => (
                <span key={phase} className={`dsp rounded-full px-3 py-1.5 text-[10px] ${i === 1 ? "bg-gold text-[#1e211b]" : "bg-white/10"}`}>
                  {phase}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-6 flex items-center gap-2 text-[12px] text-white/60">
            <Lock className="h-3.5 w-3.5" /> Your videos stay private to your account.
          </p>
          <div className="pointer-events-none absolute -right-6 bottom-0 top-6 hidden w-[44%] sm:block">
            <Skeleton />
          </div>
        </article>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------- steps

const STEPS = [
  { title: "Play a round", body: "Track shots as you go or enter the scorecard afterwards. Either way takes a couple of minutes." },
  { title: "Get your priority", body: "The app finds the part of your game losing the most strokes and puts it at the top of your practice." },
  { title: "Practice the fix", body: "Run tests that target it, watch the numbers move, and let your next round confirm it worked." },
];

function Steps() {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-24 md:pt-32">
      <SectionHead eyebrow="How it works" title="Play. Learn. Practice. Repeat." />
      <ol className="mt-12 grid gap-4 md:grid-cols-3">
        {STEPS.map(({ title, body }, i) => (
          <li key={title} className="reveal rounded-[var(--radius-card)] border-[1.5px] border-border-strong p-7">
            <p className="font-display outline-text text-[88px] leading-[0.9] text-accent">0{i + 1}</p>
            <h3 className="dsp mt-6 text-[28px] leading-none">{title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ----------------------------------------------------------------- pricing

function Pricing() {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-24 md:pt-32">
      <SectionHead eyebrow="Plans" title="Start free. Upgrade when it pays off." />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="reveal flex flex-col rounded-[var(--radius-card)] bg-surface p-7 md:p-9">
          <p className={`${EYEBROW} text-fg-subtle`}>Free</p>
          <p className="mt-3 font-display text-[56px] leading-none">$0</p>
          <Bullets
            className="mt-7 flex-1"
            items={[
              `${LIMITS.free.round} rounds a month`,
              `${LIMITS.free.swing} swing analyses a month`,
              "All 30 practice tests and guided sessions",
              "Practice priorities from your rounds",
            ]}
          />
          <Link href="/signup" className="dsp press mt-8 inline-flex h-14 items-center justify-center rounded-full border-[1.5px] border-fg text-[13px] hover:bg-fg/5">
            Create a free account
          </Link>
        </div>
        <div className="reveal flex flex-col rounded-[var(--radius-card)] bg-ink p-7 text-ink-fg md:p-9">
          <p className={`${EYEBROW} text-gold`}>Premium</p>
          <p className="mt-3 font-display text-[56px] uppercase leading-none">Everything</p>
          <Bullets
            className="mt-7 flex-1"
            items={[
              "Unlimited rounds",
              `${LIMITS.premium.swing} swing analyses a month`,
              "Full strokes-gained breakdown by category, distance, club and lie",
              "Everything in Free",
            ]}
          />
          <InstallButton className={`${CTA} mt-8`}>Start free, upgrade in the app</InstallButton>
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------- install

function Install() {
  return (
    <section id="install" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-24 md:py-32">
      <div className="hero-art-dusk reveal relative isolate overflow-hidden rounded-[40px] px-7 py-16 text-white md:px-14 md:py-24">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[rgb(18_22_13/0.72)]" />
        <p className={`${EYEBROW} text-gold`}>Get the app</p>
        <h2 className="dsp mt-3 max-w-[14ch] text-[clamp(44px,7.4vw,96px)] leading-[0.93]">
          On your home screen in ten seconds.
        </h2>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/85">
          No app store and nothing to update. Create your account, add it to your home screen, and
          it opens like any other app.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <InstallButton className={CTA}>
            Get the app free <ArrowRight className="h-4 w-4" />
          </InstallButton>
          <Link href="/login" className="dsp press inline-flex h-14 items-center rounded-full border-[1.5px] border-white/70 px-7 text-[13px] hover:bg-white/10">
            I have an account
          </Link>
        </div>
        <div className="mt-12 grid gap-3 text-[14px] sm:grid-cols-2 lg:max-w-3xl">
          <p className="flex items-start gap-3 rounded-[var(--radius-soft)] bg-white/10 p-4">
            <Share className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>
              <strong className="font-semibold">iPhone and iPad.</strong> Open in Safari, tap Share,
              then Add to Home Screen.
            </span>
          </p>
          <p className="flex items-start gap-3 rounded-[var(--radius-soft)] bg-white/10 p-4">
            <SquarePlus className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>
              <strong className="font-semibold">Android and desktop.</strong> Open in Chrome, open
              the menu, then Install app.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t px-5 py-8 text-[13px] text-fg-subtle">
      <span className="font-display text-[18px] uppercase text-fg">Golf AI Coach</span>
      <span>Screens shown use sample data.</span>
      <span className="flex gap-5">
        <Link href="/login" className="hover:text-fg">Sign in</Link>
        <Link href="/signup" className="hover:text-fg">Create account</Link>
      </span>
    </footer>
  );
}
