import type { HandicapEntry, PlayerProfile, User } from "../../types/player";
import type { Course, Round, Shot } from "../../types/rounds";
import type {
  DrillAttempt,
  PlanAdaptation,
  PlanSession,
  PracticeItem,
  PracticeSession,
  SwingFinding,
  SwingSession,
  TrainingPlan,
} from "../../types/practice";
import { demoData, DEMO_USER_ID } from "../seed/demo-player";

/**
 * Mutable in-memory copy of the demo dataset.
 *
 * ponytail: process-local and non-durable, which is exactly what demo mode
 * needs - a restart gives everyone a clean, identical demo. Configure Supabase
 * and none of this module is reachable.
 */
export type DemoStore = {
  user: User;
  profile: PlayerProfile;
  handicapHistory: HandicapEntry[];
  courses: Course[];
  rounds: Round[];
  shots: Shot[];
  practiceSessions: PracticeSession[];
  practiceItems: PracticeItem[];
  drillAttempts: DrillAttempt[];
  swingSessions: SwingSession[];
  swingFindings: SwingFinding[];
  plans: TrainingPlan[];
  planSessions: PlanSession[];
  planAdaptations: PlanAdaptation[];
};

declare global {
  // eslint-disable-next-line no-var
  var __golfDemoStore: DemoStore | undefined;
}

function create(): DemoStore {
  const data = demoData();
  return {
    user: data.user,
    profile: data.profile,
    handicapHistory: [...data.handicapHistory],
    courses: [...data.courses],
    rounds: [...data.rounds],
    shots: [...data.shots],
    practiceSessions: [...data.practiceSessions],
    practiceItems: [...data.practiceItems],
    drillAttempts: [...data.drillAttempts],
    swingSessions: [...data.swingSessions],
    swingFindings: [...data.swingFindings],
    plans: [data.plan],
    planSessions: [...data.planSessions],
    planAdaptations: [...data.planAdaptations],
  };
}

/** Survives dev-server hot reloads so edits made in the demo do not vanish. */
export function store(): DemoStore {
  if (!globalThis.__golfDemoStore) globalThis.__golfDemoStore = create();
  return globalThis.__golfDemoStore;
}

export function resetDemoStore(): void {
  globalThis.__golfDemoStore = create();
}

export { DEMO_USER_ID };

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
