"use client";

import { Children, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/primitives";

/** A list that shows its first `limit` items, with a button for the rest. */
export function ShowMore({ limit, className, as: Tag = "div", children }: {
  limit: number; className?: string; as?: "div" | "ul"; children: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const items = Children.toArray(children);
  return <>
    <Tag className={className}>{all ? items : items.slice(0, limit)}</Tag>
    {items.length > limit ? (
      <Button type="button" variant="secondary" size="sm" aria-expanded={all} onClick={() => setAll(!all)}>
        {all ? "Show fewer" : `Show all ${items.length}`}
      </Button>
    ) : null}
  </>;
}
