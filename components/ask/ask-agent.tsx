"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Search, Sparkles, X } from "lucide-react";

import { askAction } from "@/app/actions";
import { ASK_IDLE, type AskEntry } from "@/lib/ai/ask";
import { Badge, Eyebrow } from "@/components/ui/primitives";

/**
 * The find-it agent.
 *
 * A native <dialog>, not a modal library: showModal() already gives a focus
 * trap, an inert background, Escape-to-close and the top layer for free.
 */

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

export function AskAgent() {
  const [state, formAction, pending] = useActionState(askAction, ASK_IDLE);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask about your game"
        className="dsp fixed right-3.5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex h-12 items-center gap-2 rounded-full bg-[image:var(--grad-accent)] px-4 text-[11px] font-medium tracking-[0.18em] text-white shadow-[var(--shadow-accent)] transition-transform active:scale-95 md:right-6 md:bottom-6"
      >
        <Sparkles className="h-4 w-4" />
        Ask
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        /* Clicking the backdrop lands on the dialog itself, never a child. */
        onClick={(event) => {
          if (event.target === dialog.current) setOpen(false);
        }}
        className="m-0 mt-auto max-h-[86svh] w-full max-w-none overflow-y-auto rounded-t-[22px] border border-border bg-surface p-0 text-fg shadow-[var(--shadow-card)] backdrop:bg-[rgb(9_14_10_/_0.5)] sm:m-auto sm:max-w-[540px] sm:rounded-[22px]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-5 py-4">
          <div>
            <h2 className="dsp text-[15px] font-semibold tracking-[0.02em]">Ask your data</h2>
            <p className="mt-0.5 text-[11px] text-fg-muted">
              Searches what the app has actually computed for you.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-strong text-fg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <form ref={form} action={formAction} className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <input
              ref={input}
              name="question"
              type="text"
              maxLength={300}
              required
              autoComplete="off"
              placeholder="Ask about a club, a distance, a drill…"
              aria-label="Ask about your game"
              className="h-11 w-full rounded-full border border-border-strong bg-surface-2 pl-10 pr-24 text-base text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className="dsp absolute right-1.5 top-1.5 flex h-8 items-center gap-1.5 rounded-full bg-[image:var(--grad-accent)] px-3.5 text-[10px] font-medium tracking-[0.17em] text-white disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Ask
            </button>
          </form>

          {!state.ok && !state.message ? (
            <div>
              <Eyebrow>Try</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => ask(example)}
                    className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {state.message ? <p className="text-[12px] text-bad">{state.message}</p> : null}

          {state.ok ? (
            <>
              <div className="rounded-[var(--radius-soft)] border border-border bg-surface-2 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  {/* The form resets on submit, so the question is echoed here. */}
                  <Eyebrow className="min-w-0 truncate normal-case">{state.question}</Eyebrow>
                  <Badge tone={state.source === "ai" ? "gold" : "neutral"}>
                    {state.source === "ai" ? "AI coach" : "Rule-based"}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[13px] leading-[1.6] text-fg">{state.answer}</p>
                {state.note ? (
                  <p className="mt-2 text-[11px] text-fg-subtle">{state.note}</p>
                ) : null}
              </div>

              {state.results.length > 0 ? (
                <div>
                  <Eyebrow>Where to look</Eyebrow>
                  <ul className="mt-2 space-y-1.5">
                    {state.results.map((result) => (
                      <li key={result.id}>
                        <Link
                          href={result.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 transition-colors hover:border-accent"
                        >
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-semibold">
                                {result.title}
                              </span>
                              <Badge tone="neutral">{KIND_LABEL[result.kind]}</Badge>
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-[1.45] text-fg-muted">
                              {result.detail}
                            </span>
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {state.followUp.length > 0 ? (
                <div>
                  <Eyebrow>Then ask</Eyebrow>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {state.followUp.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => ask(question)}
                        className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:border-accent hover:text-accent"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
