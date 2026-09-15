/**
 * Shared result shape for every server action.
 *
 * It lives outside app/actions.ts because a "use server" module may only
 * export async functions - a plain constant there breaks the build.
 */
export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
};

export const IDLE: ActionState = { ok: false };
