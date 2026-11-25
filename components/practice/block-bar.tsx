import { PRACTICE_BLOCK_LABELS, type PracticeBlock } from "@/types/practice";
import { cn } from "@/lib/utils";

/* Short names for the bar, where a full label would not fit. */
const BLOCK_SHORT: Record<PracticeBlock, string> = {
  warm_up: "Warm-up",
  technical: "Technique",
  skill: "Test",
  variable: "Random",
  pressure: "Pressure",
  reflection: "Reflect",
};

/*
  Each kind of block keeps its colour: stone warm-up, olive technique, ink
  test, flag-yellow pressure. The light ones carry no label inside the bar;
  theirs sit under it.
*/
const FILL: Record<PracticeBlock, string> = {
  warm_up: "bg-surface-2",
  technical: "bg-accent text-white",
  skill: "bg-ink text-white",
  variable: "bg-accent-strong text-white",
  pressure: "bg-gold",
  reflection: "bg-surface-2",
};
const LIGHT = new Set<PracticeBlock>(["warm_up", "pressure", "reflection"]);

/** A session's blocks as one bar, each as wide as its minutes. */
export function BlockBar({
  blocks,
  minutes = false,
  legend = false,
  className,
}: {
  blocks: { block: PracticeBlock; duration: number }[];
  /** Put the minutes after each label. */
  minutes?: boolean;
  /** Name the unlabelled light blocks under the bar. */
  legend?: boolean;
  className?: string;
}) {
  const light = blocks.filter((block) => LIGHT.has(block.block));
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={blocks.map((block) => `${PRACTICE_BLOCK_LABELS[block.block]} ${block.duration} minutes`).join(", ")}
        className={cn("flex h-[30px] gap-1", className)}
      >
        {blocks.map((block, index) => (
          <div
            key={index}
            className={cn(
              "glide-left flex min-w-0 items-center overflow-hidden whitespace-nowrap rounded-[6px] pl-2.5 text-[10px] font-bold uppercase tracking-[0.06em] first:rounded-l-full last:rounded-r-full",
              FILL[block.block],
            )}
            style={{ flex: block.duration, animationDelay: `${index * 100}ms` }}
          >
            {LIGHT.has(block.block) ? null : (
              <span className="truncate">
                {BLOCK_SHORT[block.block]}
                {minutes ? ` ${block.duration}` : ""}
              </span>
            )}
          </div>
        ))}
      </div>
      {legend && light.length > 0 ? (
        <div className="flex justify-between gap-3 text-[11px] font-semibold text-fg-subtle">
          {light.map((block, index) => (
            <span key={index}>
              {BLOCK_SHORT[block.block]} {block.duration}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
