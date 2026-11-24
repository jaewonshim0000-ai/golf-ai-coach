/**
 * Sentry's settings, shared by server and browser. Errors only: no tracing,
 * and none of the request, user, AI or database data the SDK collects by
 * default, so a report never carries a player's name, email, cookies,
 * coaching prompts or golf data. The privacy policy relies on this.
 */
export function sentryOptions(dsn: string) {
  return {
    dsn,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
  };
}

/** An error an error page caught: logged, and sent to Sentry when it is switched on. */
export function reportError(error: unknown): void {
  console.error(error);
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
}
