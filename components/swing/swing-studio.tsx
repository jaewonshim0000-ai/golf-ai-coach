"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/primitives";

/** Keep the original player mounted for synchronized playback. On small
 * screens the reconstructed replay takes priority over recording settings. */
export function SwingStudio({ video, reconstruction, ready }: { video: ReactNode; reconstruction: ReactNode; ready: boolean }) {
  const [tab, setTab] = useState<"video" | "model">(ready ? "model" : "video");
  useEffect(() => { if (ready) setTab("model"); }, [ready]);
  useEffect(() => {
    const review = () => {
      setTab("video");
      requestAnimationFrame(() => document.querySelector("video[data-swing-player]")?.scrollIntoView({ block: "center", behavior: "smooth" }));
    };
    window.addEventListener("swing:review", review);
    return () => window.removeEventListener("swing:review", review);
  }, []);
  return <div className="space-y-3">
    <div className="flex gap-2" role="tablist" aria-label="Swing replay">
      <Button type="button" role="tab" id="original-video-tab" aria-selected={tab === "video"} aria-controls="original-video-panel"
        variant={tab === "video" ? "primary" : "secondary"} onClick={() => setTab("video")}>Original video</Button>
      <Button type="button" role="tab" id="reconstruction-tab" aria-selected={tab === "model"} aria-controls="reconstruction-panel"
        variant={tab === "model" ? "primary" : "secondary"} onClick={() => setTab("model")}>3D replay</Button>
    </div>
    <div id="original-video-panel" role="tabpanel" aria-labelledby="original-video-tab" hidden={tab !== "video"}>{video}</div>
    <div id="reconstruction-panel" role="tabpanel" aria-labelledby="reconstruction-tab" hidden={tab !== "model"}>{reconstruction}</div>
  </div>;
}
