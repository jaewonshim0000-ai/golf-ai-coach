import type { SwingFocus } from "@/lib/golf/swing-focus";
import { SwingCoach } from "./swing-coach";

export function SwingAnalysis({ focus, sessionId, coachingKey }: {
  focus: SwingFocus; sessionId: string; coachingKey: string;
}) {
  return <section id="swing-analysis" className="scroll-mt-6" aria-label="Swing analysis">
    <SwingCoach key={coachingKey} sessionId={sessionId} focus={focus} />
  </section>;
}
