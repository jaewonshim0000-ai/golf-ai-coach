import { sentryOptions } from "@/lib/report-error";

/*
  Browser errors go to Sentry once NEXT_PUBLIC_SENTRY_DSN is set (it is read
  at build time, so redeploy after setting it). The SDK is a lazy chunk:
  without a DSN no page ever fetches it.
*/
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => Sentry.init(sentryOptions(dsn)));
}
