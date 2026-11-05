import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclosure({ title, description, count, children, className, defaultOpen = false, ...props }: {
  title: string; description?: ReactNode; count?: number; children: ReactNode; defaultOpen?: boolean;
} & Omit<ComponentProps<"details">, "title" | "open" | "children">) {
  return <details {...props} open={defaultOpen} className={cn("group/disclosure rounded-[var(--radius-card)] bg-surface", className)}>
    <summary aria-label={title} className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-[18px] [&::-webkit-details-marker]:hidden">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-display text-[22px] uppercase leading-none">
          {title}{count !== undefined ? <span className="tabular flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-surface-2 px-2 font-sans text-[12px] font-bold text-fg">{count}</span> : null}
        </span>
        {description ? <span className="mt-1.5 block text-[13px] leading-relaxed text-fg-muted">{description}</span> : null}
      </span>
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-fg text-fg">
        <ChevronDown className="h-4 w-4 transition-transform group-open/disclosure:rotate-180" />
      </span>
    </summary>
    <div className="px-[18px] pb-[18px]">{children}</div>
  </details>;
}
