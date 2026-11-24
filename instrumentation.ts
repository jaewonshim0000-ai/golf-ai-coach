import { captureRequestError, init } from "@sentry/nextjs";

import { sentryOptions } from "@/lib/report-error";

/**
 * Server errors go to Sentry once NEXT_PUBLIC_SENTRY_DSN is set (a DSN is not
 * a secret). Without it nothing is sent; see sentryOptions for what is kept out.
 */
export function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) init(sentryOptions(dsn));
}

/** Every failed server render, action and route; a no-op until init has run. */
export const onRequestError = captureRequestError;
