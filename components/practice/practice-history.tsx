"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { deletePracticeSessionFromListAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { formatDate, relativeDays } from "@/lib/utils";
import { SWIPE_REVEAL, swipeIntent, swipeOffset } from "@/lib/practice/swipe";
import type { PracticeSession } from "@/types/practice";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { Disclosure } from "@/components/ui/disclosure";

export function PracticeHistory({ sessions }: { sessions: PracticeSession[] }) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const onDeleted = useCallback((id: string) => {
    setRemoved((current) => [...current, id]);
    setMessage("Session deleted.");
  }, []);
  const visible = sessions.filter((session) => !removed.includes(session.id));
  const active = visible.filter((session) => session.status !== "complete");
  const completed = visible.filter((session) => session.status === "complete");
  return <div className="space-y-3">
    <p role="status" className={message ? "text-[12px] text-good" : "sr-only"}>{message}</p>
    {[{ title: "Saved practices", rows: active, empty: "No practices in progress" },
      { title: "Recent sessions", rows: completed, empty: "No completed sessions yet" }].map(({ title, rows, empty }) =>
      <Disclosure key={title} title={title} count={rows.length} description={rows.length ? "Swipe right for Delete, or use the row’s action button." : undefined}>
        {rows.length ? <ul className="space-y-2">{rows.map((session) => <SwipePracticeRow key={session.id} session={session} onDeleted={onDeleted} />)}</ul>
          : <EmptyState title={empty} message="Your saved sessions will appear here." />}
      </Disclosure>)}
  </div>;
}

function SwipePracticeRow({ session, onDeleted }: { session: PracticeSession; onDeleted: (id: string) => void }) {
  const [state, formAction, pending] = useActionState(deletePracticeSessionFromListAction, IDLE);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const gesture = useRef<{ x: number; y: number; start: number; locked: boolean } | null>(null);
  const suppressClick = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const actions = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const revealed = offset === SWIPE_REVEAL;

  useEffect(() => { if (state.ok) onDeleted(session.id); }, [state, session.id, onDeleted]);
  useEffect(() => { if (confirming) cancel.current?.focus(); }, [confirming]);

  function start(event: PointerEvent<HTMLDivElement>) {
    if (pending || confirming || !event.isPrimary || event.button !== 0 ||
      (event.target as HTMLElement).closest("button, input, select, textarea")) return;
    suppressClick.current = false;
    gesture.current = { x: event.clientX, y: event.clientY, start: offset, locked: false };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current) return;
    const x = event.clientX - current.x, y = event.clientY - current.y;
    if (!current.locked) {
      const intent = swipeIntent(x, y);
      if (intent === "vertical") { gesture.current = null; return; }
      if (intent !== "horizontal") return;
      current.locked = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    event.preventDefault();
    setOffset(swipeOffset(current.start, x));
  }
  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const current = gesture.current;
    if (!current) return;
    if (current.locked) {
      const next = cancelled ? current.start : swipeOffset(current.start, event.clientX - current.x);
      setOffset(next >= SWIPE_REVEAL / 2 ? SWIPE_REVEAL : 0);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gesture.current = null;
    setDragging(false);
    if (current.locked) window.setTimeout(() => { suppressClick.current = false; }, 0);
  }

  return <li className="space-y-2" aria-busy={pending} onKeyDown={(event) => {
    if (event.key === "Escape" && !pending && (revealed || confirming)) {
      event.preventDefault(); setConfirming(false); setOffset(0); requestAnimationFrame(() => actions.current?.focus());
    }
  }}>
    <div className="relative overflow-hidden rounded-xl bg-bad">
      <button ref={deleteTrigger} type="button" aria-label={`Delete ${session.title}`} aria-hidden={!revealed} tabIndex={revealed ? 0 : -1}
        disabled={!revealed || pending} onClick={() => setConfirming(true)}
        className="absolute inset-y-0 left-0 flex w-[88px] flex-col items-center justify-center gap-1 text-[12px] font-medium text-white">
        <Trash2 className="h-4 w-4" aria-hidden />Delete
      </button>
      <div className="relative flex min-h-16 select-none items-center gap-2 rounded-xl border border-border bg-surface-2"
        style={{ touchAction: "pan-y", transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 160ms ease" }}
        onPointerDown={start} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}
        onClickCapture={(event) => {
          if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
        }}>
        <Link href={`/practice/sessions/${session.id}`} className="min-w-0 flex-1 px-3.5 py-3" draggable={false}>
          <span className="block truncate text-[13px] font-medium">{session.title}</span>
          <span className="mt-0.5 block text-[11px] text-fg-subtle">{formatDate(session.scheduled_for)} · {relativeDays(session.scheduled_for)}</span>
        </Link>
        <Badge tone={session.status === "complete" ? "good" : "warn"}>{session.status === "complete" ? "done" : session.status === "planned" ? "planned" : "open"}</Badge>
        <button ref={actions} type="button" aria-label={`Session actions for ${session.title}`} aria-expanded={revealed}
          disabled={pending} onClick={() => { setOffset(revealed ? 0 : SWIPE_REVEAL); requestAnimationFrame(() => revealed ? actions.current?.focus() : deleteTrigger.current?.focus()); }} className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-track">
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
    {confirming ? <div role="alertdialog" aria-labelledby={`delete-title-${session.id}`} className="rounded-xl bg-surface-2 p-3">
      <p id={`delete-title-${session.id}`} className="text-[13px] font-semibold">Delete “{session.title}”?</p>
      <p className="mt-1 text-[12px] text-fg-muted">This removes the session and its saved results.</p>
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="confirm" value="delete" />
        <Button type="submit" variant="danger" size="sm" disabled={pending}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} {pending ? "Deleting…" : "Delete session"}</Button>
        <button ref={cancel} type="button" disabled={pending} onClick={() => { setConfirming(false); setOffset(0); requestAnimationFrame(() => actions.current?.focus()); }} className="min-h-10 rounded-full px-4 text-[12px] font-medium text-fg-muted">Cancel</button>
        {state.message && !state.ok ? <p role="alert" className="w-full text-[12px] text-bad">{state.message}</p> : null}
      </form>
    </div> : null}
  </li>;
}
