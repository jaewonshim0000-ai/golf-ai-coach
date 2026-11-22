"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles, X } from "lucide-react";

import { askAction } from "@/app/actions";
import { ASK_IDLE, type AskEntry } from "@/lib/ai/ask";
import { cn } from "@/lib/utils";

/**
 * The find-it agent.
 *
 * A native <dialog>, not a modal library: showModal() already gives a focus
 * trap, an inert background, Escape-to-close and the top layer for free. On a
 * phone it fills the screen, like the design's Ask screen; wider, it floats.
 *
 * It opens from the Ask coach pill in the Practice header (any button that
 * dispatches `OPEN_EVENT`) and, on a wide screen, from its own floating button.
 */

const OPEN_EVENT = "ask-coach:open";

const EXAMPLES = [
  "Where am I losing the most shots?",
  "How is my putting from 10 feet?",
  "Find a bunker drill",
  "My last round",
];

const KIND_LABEL: Record<AskEntry["kind"], string> = {
  weakness: "Weakness",
  segment: "Stat",
  round: "Round",
  drill: "Drill",
  practice: "Practice",
  session: "Today",
  swing: "Swing",
  screen: "Screen",
};

function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z" />
    </svg>
  );
}

/** The Ask coach pill from the Practice header. */
export function AskCoachButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={cn(
        "press dsp inline-flex h-11 items-center gap-2 rounded-full bg-ink pl-1.5 pr-3.5 text-[11px] text-white",
        className,
      )}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3a3f33] text-gold">
        <Star className="h-3.5 w-3.5" />
      </span>
      Ask coach
    </button>
  );
}

export function AskAgent() {
  const [state, formAction, pending] = useActionState(askAction, ASK_IDLE);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      input.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  function ask(question: string) {
    if (!input.current || !form.current) return;
    input.current.value = question;
    form.current.requestSubmit();
  }

  const suggestions = state.ok ? state.followUp : EXAMPLES;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask about your game"
        className="dsp fixed bottom-6 right-6 z-30 hidden h-11 items-center gap-2 rounded-full bg-ink pl-1.5 pr-3.5 text-[11px] text-white shadow-[var(--shadow-raised)] transition-transform active:scale-95 md:flex"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3a3f33] text-gold">
          <Sparkles className="h-3.5 w-3.5" fill="currentColor" />
        </span>
        Ask coach
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        /* Clicking the backdrop lands on the dialog itself, never a child. */
        onClick={(event) => {
          if (event.target === dialog.current) setOpen(false);
        }}
        className="m-0 h-[100dvh] max-h-none w-full max-w-none overflow-y-auto bg-bg p-0 text-fg backdrop:bg-[rgb(20_24_15_/_0.55)] sm:m-auto sm:h-auto sm:max-h-[86svh] sm:max-w-[540px] sm:rounded-[28px]"
      >
        <div className="flex min-h-full flex-col gap-4 px-5 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))] sm:pb-28">
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-gold" aria-hidden>
                <Star className="h-[18px] w-[18px]" />
              </span>
              <h2 className="dsp text-[26px] leading-none">Ask your coach</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-fg"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          </header>

          {!state.ok && !state.message ? (
            <p className="text-[14px] leading-relaxed text-fg-muted">
              Ask about a club, a distance or a drill. It searches what the app has actually worked out from your
              rounds, practice and swings.
            </p>
          ) : null}

          {state.ok ? (
            <>
              {/* The form resets on submit, so the question is echoed as the player's bubble. */}
              <p className="max-w-[78%] self-end rounded-[22px_22px_6px_22px] bg-accent px-4 py-3 text-[15px] leading-[1.4] text-accent-fg">
                {state.question}
              </p>

              <article className="flex max-w-[92%] flex-col gap-3 self-start rounded-[22px_22px_22px_6px] bg-surface p-4">
                <p className="text-[15px] leading-[1.5]">{state.answer}</p>

                {state.results.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="dsp text-[11px] tracking-[0.1em] text-fg-subtle">Where to look</span>
                    <div className="flex flex-wrap gap-1.5">
                      {state.results.map((result) => (
                        <Link
                          key={result.id}
                          href={result.href}
                          title={result.detail}
                          onClick={() => setOpen(false)}
                          className="press inline-flex min-h-[34px] max-w-full items-center rounded-full border-[1.5px] border-fg px-3 py-1 text-[12px] font-bold leading-tight"
                        >
                          <span className="truncate">
                            {KIND_LABEL[result.kind]} · {result.title}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}

                <span className="text-[11px] text-fg-subtle">
                  Based on your data · {state.source === "ai" ? "AI coach" : "rule-based"}
                  {state.note ? ` · ${state.note}` : ""}
                </span>
              </article>
            </>
          ) : null}

          {state.message ? <p className="text-[13px] text-bad">{state.message}</p> : null}

          {suggestions.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="dsp text-[11px] tracking-[0.1em] text-fg-muted">{state.ok ? "Then ask" : "Try"}</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => ask(question)}
                    className="press min-h-9 rounded-[18px] bg-surface px-3.5 py-2 text-left text-[13px] font-semibold leading-snug"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <form
          ref={form}
          action={formAction}
          className="fixed inset-x-4 bottom-[calc(1.75rem+env(safe-area-inset-bottom))] flex gap-2 rounded-full bg-surface p-1.5 shadow-[0_10px_30px_-12px_rgb(30_33_27_/_0.35)] sm:absolute"
        >
          <label htmlFor="ask-question" className="sr-only">
            Ask about your game
          </label>
          <input
            id="ask-question"
            ref={input}
            name="question"
            type="text"
            maxLength={300}
            required
            autoComplete="off"
            placeholder="Ask about your game"
            className="h-12 min-w-0 flex-1 bg-transparent px-3.5 text-base text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            aria-label="Send"
            className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.4} />}
          </button>
        </form>
      </dialog>
    </>
  );
}
