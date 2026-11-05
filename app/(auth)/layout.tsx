import Link from "next/link";
import { Flag } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-bg">
      <div className="hero-art-green relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden rounded-b-[32px] px-4 pb-16 pt-12 text-center text-white">
        <div className="hero-scrim absolute inset-0" aria-hidden />
        <Link href="/" className="relative flex flex-col items-center gap-3.5">
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] border-white bg-accent">
            <Flag className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <span className="font-display text-[48px] uppercase leading-[0.98]">
            Golf AI
            <br />
            Coach
          </span>
          <span className="dsp inline-flex h-[30px] items-center rounded-full border-[1.5px] border-white/80 px-3.5 text-[11px]">
            Learns your game
          </span>
        </Link>
      </div>
      <div className="relative mx-auto -mt-9 w-full max-w-sm px-4 pb-12">{children}</div>
    </div>
  );
}
