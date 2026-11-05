import Link from "next/link";

export default function NotFound() {
  return (
    <div className="hero-grid flex min-h-svh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="dsp text-[10px] font-medium tracking-[0.17em] text-fg-subtle">404</p>
      <h1 className="dsp text-[40px] leading-[0.98]">We could not find that</h1>
      <p className="max-w-sm text-sm text-fg-muted">
        The page, round or session you were looking for does not exist, or does not belong to your
        account.
      </p>
      <Link
        href="/practice"
        className="dsp mt-3 inline-flex h-12 items-center rounded-full bg-accent px-6 text-[12px] text-accent-fg"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
