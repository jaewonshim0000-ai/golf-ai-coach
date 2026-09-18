import { z } from "zod";

import type { PlayerState } from "../player-state";
import type { AISource } from "./provider";
import { COACH_SYSTEM_PROMPT, getProvider } from "./provider";
import { askAnswerSchema } from "./schemas";
import { CLUB_LABELS, SG_CATEGORY_LABELS, labelize } from "../../types/golf";
import { formatDate, percent, signed, toParLabel } from "../utils";
import { summarizeRound } from "../golf/strokes-gained";

/**
 * The find-it agent.
 *
 * Retrieval is deterministic: every answerable thing in the app - each scored
 * segment, weakness, round, drill, practice metric and screen - is indexed with
 * the number already computed for it and the URL that shows it. A question is
 * matched against that index by plain token overlap.
 *
 * The model only chooses between retrieved entries and writes one sentence
 * about them. It cannot introduce a result, because any id it returns that is
 * not in the retrieved set is dropped, and it cannot introduce a number,
 * because every number rendered comes from the entry, not from the reply.
 * With no API key configured the rule-based answer says the same thing in
 * plainer language off the same hits.
 */

export type AskEntryKind =
  | "weakness"
  | "segment"
  | "round"
  | "drill"
  | "practice"
  | "session"
  | "swing"
  | "screen";

export type AskEntry = {
  id: string;
  kind: AskEntryKind;
  title: string;
  /** Always a computed fact, never prose. This is what the UI shows. */
  detail: string;
  href: string;
  /** Extra search terms that should match but do not belong in the title. */
  keywords: string[];
  /** Strokes a round at stake. Orders equally-relevant hits by what matters. */
  weight?: number;
};

export type AskState = {
  ok: boolean;
  question: string;
  answer: string;
  results: AskEntry[];
  followUp: string[];
  source: AISource;
  note?: string;
  message?: string;
};

export const ASK_IDLE: AskState = {
  ok: false,
  question: "",
  answer: "",
  results: [],
  followUp: [],
  source: "rules",
};

/** The question is user input crossing into a prompt, so it is bounded here. */
export const askQuestionSchema = z.string().trim().min(2).max(300);

const MAX_RESULTS = 4;
const CANDIDATES = 12;

// ------------------------------------------------------------------- index

/** Screens are always indexed, so a brand new account can still navigate. */
const SCREENS: AskEntry[] = [
  {
    id: "screen:dashboard",
    kind: "screen",
    title: "Dashboard",
    detail: "Your current priority, the coach read-out and today's session",
    href: "/dashboard",
    keywords: ["home", "priority", "focus", "overview", "summary", "coach"],
  },
  {
    id: "screen:stats",
    kind: "screen",
    title: "Round stats",
    detail: "Every segment of your game, filterable",
    href: "/rounds",
    keywords: ["numbers", "strokes", "gained", "data", "breakdown", "charts", "filter"],
  },
  {
    id: "screen:rounds",
    kind: "screen",
    title: "Rounds",
    detail: "Every round you have logged",
    href: "/rounds",
    keywords: ["scores", "scorecard", "history", "played", "courses"],
  },
  {
    id: "screen:new-round",
    kind: "screen",
    title: "Log a new round",
    detail: "Start recording shots hole by hole",
    href: "/rounds/new",
    keywords: ["add", "start", "play", "record", "new", "shots", "today"],
  },
  {
    id: "screen:practice",
    kind: "screen",
    title: "Train",
    detail: "Today's session, your drills and your swing",
    href: "/train",
    keywords: ["train", "training", "session", "range", "log", "results"],
  },
  {
    id: "screen:drills",
    kind: "screen",
    title: "Drill library",
    detail: "Every drill, with the metric it tracks and the standard to beat",
    href: "/train/drills",
    keywords: ["drills", "exercises", "routines", "library", "search"],
  },
  {
    id: "screen:profile",
    kind: "screen",
    title: "Profile",
    detail: "Handicap, bag, goals, availability and facilities",
    href: "/profile",
    keywords: ["settings", "handicap", "bag", "clubs", "goals", "account", "me"],
  },
];

/**
 * Where a segment lives. The breakdowns live on the rounds screen. Distance bands carry a `min-max` id
 * that the stats distance filter already understands; putt bands do not,
 * because that filter works in yards and putts are recorded in feet, so those
 * narrow to the category and let the chart show the band.
 */
function segmentHref(kind: string, key: string): string {
  switch (kind) {
    case "category":
      return `/rounds?category=${key}`;
    case "club":
      return `/rounds?club=${key}`;
    case "lie":
      return `/rounds?lie=${key}`;
    case "shot_type":
      return `/rounds?shot_type=${key}`;
    case "approach_distance":
      return `/rounds?category=approach&distance=${key.endsWith("+") ? `${parseInt(key, 10)}-600` : key}`;
    case "putt_distance":
      return "/rounds?category=putting";
    default:
      return "/rounds";
  }
}

export function buildAskIndex(state: PlayerState): AskEntry[] {
  const entries: AskEntry[] = [...SCREENS];

  /*
    A ranked weakness and the segment underneath it are the same row of data
    seen twice, and they share an href. Index the weakness, which carries the
    cost and confidence, and skip its segment.
  */
  const covered = new Set(state.weaknesses.map((w) => `${w.kind}:${w.key}`));

  for (const weakness of state.weaknesses) {
    entries.push({
      id: `weakness:${weakness.id}`,
      kind: "weakness",
      title: weakness.title,
      detail: `Costing ${weakness.strokes_lost_per_round.toFixed(2)} strokes a round · ${weakness.sample_size} shots · ${percent(weakness.confidence)} confidence · ${weakness.severity}`,
      href: segmentHref(weakness.kind, weakness.key),
      keywords: [
        "weakness",
        "worst",
        "problem",
        "losing",
        "priority",
        "improve",
        "fix",
        SG_CATEGORY_LABELS[weakness.category],
        weakness.severity,
        weakness.trend_label,
        ...weakness.related_skills,
      ],
      weight: weakness.strokes_lost_per_round,
    });
  }

  // Segments the player has barely hit are noise in a search result list.
  for (const segment of state.segments) {
    if (segment.shots < 4) continue;
    if (covered.has(`${segment.kind}:${segment.key}`)) continue;
    entries.push({
      id: `segment:${segment.kind}:${segment.key}`,
      kind: "segment",
      title: segment.label,
      detail: `${signed(segment.sg_per_round)} strokes a round · ${signed(segment.sg_per_shot)} a shot · ${segment.shots} shots`,
      href: segmentHref(segment.kind, segment.key),
      keywords: [
        labelize(segment.kind),
        SG_CATEGORY_LABELS[segment.category],
        segment.sg_per_round >= 0 ? "gaining" : "losing",
        "strokes gained",
      ],
      weight: Math.abs(segment.sg_per_round),
    });
  }

  for (const round of state.rounds) {
    const stats = summarizeRound(round, state.shotsByRound.get(round.id) ?? []);
    entries.push({
      id: `round:${round.id}`,
      kind: "round",
      title: round.course_name,
      detail: `${formatDate(round.played_on)} · ${stats.score ?? "—"} (${toParLabel(stats.to_par)}) · ${signed(stats.sg_total, 1)} strokes gained`,
      href: `/rounds/${round.id}`,
      keywords: ["round", "score", "scorecard", "played", ...round.conditions],
    });
  }

  for (const trend of state.practiceTrends) {
    entries.push({
      id: `practice:${trend.drill_id}`,
      kind: "practice",
      title: trend.drill_name,
      detail: `${trend.metric}: ${trend.latest === null ? "no result yet" : percent(trend.latest)} against a ${percent(trend.target)} target · ${trend.sessions} sessions`,
      href: "/train",
      keywords: ["practice", "progress", "result", "improving", trend.skill, trend.metric],
    });
  }

  for (const drill of state.drills) {
    entries.push({
      id: `drill:${drill.id}`,
      kind: "drill",
      title: drill.name,
      detail: `${labelize(drill.category)} · tracks ${drill.metric_to_track} · ${drill.recommended_duration} min · ${drill.difficulty}`,
      href: "/train/drills",
      keywords: [
        "drill",
        "practice",
        "exercise",
        drill.skill_trained,
        drill.difficulty,
        ...(drill.sub_category ? [drill.sub_category] : []),
        ...drill.clubs.map((club) => CLUB_LABELS[club]),
      ],
    });
  }

  for (const finding of state.swingFindings) {
    entries.push({
      id: `swing:${finding.id}`,
      kind: "swing",
      title: finding.issue,
      detail: `${labelize(finding.category)} · ${finding.certainty} · ${percent(finding.confidence)} confidence · ${finding.severity} severity`,
      href: "/train#swing",
      keywords: ["swing", "technique", "fault", "finding", finding.certainty],
    });
  }

  if (state.session) {
    entries.push({
      id: "session:today",
      kind: "session",
      title: state.session.title,
      detail: `Today · ${state.session.block} block · ${state.session.duration} min · ${state.session.drills.length} drills`,
      href: "/train",
      keywords: ["today", "session", "training", "block", "practice", "next"],
    });
  }

  return entries;
}

// ------------------------------------------------------------------ search

/**
 * Crude suffix stripping, so "putting" and "putts" reach the same stem. Not a
 * real stemmer, and it does not need to be: it only has to make golf words
 * from a question line up with golf words in a label.
 */
function stem(token: string): string {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

/*
  Single words only. A multi-word alias such as "around the green" expands into
  three free tokens, and one of them ("green") then title-matches "Greenside
  bunker" - so asking for a bunker drill scored the bunker weakness higher than
  the drill. Category association is already carried by each entry's keywords.
*/
const ALIASES: Record<string, string[]> = {
  yd: ["yard"],
  yard: ["yd"],
  ft: ["feet", "foot"],
  feet: ["ft", "foot"],
  foot: ["ft", "feet"],
  drive: ["driver", "tee"],
  driver: ["tee"],
  tee: ["driver"],
  iron: ["approach"],
  wedge: ["approach"],
  bunker: ["sand"],
  sand: ["bunker"],
  putt: ["putting"],
  score: ["round"],
  shot: ["stroke"],
  stroke: ["shot"],
  weak: ["weakness", "worst", "losing"],
  bad: ["worst", "losing", "weakness"],
  worst: ["weakness", "losing"],
  best: ["gaining"],
  practise: ["practice"],
  workout: ["practice", "drill"],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && token.length < 24)
    .map(stem);
}

/** Query tokens plus their aliases, deduplicated. */
function expand(query: string): string[] {
  const base = tokenize(query);
  const out = new Set(base);
  for (const token of base) {
    for (const alias of ALIASES[token] ?? []) {
      for (const part of tokenize(alias)) out.add(part);
    }
  }
  return [...out];
}

const STOP_WORDS = new Set([
  "a", "am", "an", "and", "are", "at", "be", "can", "do", "doe", "for", "from",
  "get", "give", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or",
  "see", "show", "the", "to", "what", "where", "which", "why", "with", "you",
]);

function matches(queryToken: string, entryToken: string): boolean {
  if (queryToken === entryToken) return true;
  // Partial words should still hit: "bunk" finds "bunker", "150" finds "150".
  const shorter = queryToken.length <= entryToken.length ? queryToken : entryToken;
  if (shorter.length < 3) return false;
  return entryToken.startsWith(queryToken) || queryToken.startsWith(entryToken);
}

/**
 * Superlatives ("worst", "biggest", "most") cannot be answered by matching
 * words, because the answer is a ranking rather than a name - and the app
 * already computes that ranking. Detecting the intent routes the question to
 * the weakness list instead of to whichever label happens to share a word.
 */
const SUPERLATIVE = /\b(worst|weakest|biggest|most|main|top|priority|priorities|leak|leaks|focus|improve|fix)\b/i;

const SUPERLATIVE_BONUS = 4;

/**
 * Questions that name the kind of thing they want. "Find a bunker drill" should
 * return the drill, not the bunker statistic that shares the word, so naming a
 * kind lifts that kind. Only unambiguous nouns are listed: "round" is left out
 * because "strokes per round" means something else entirely.
 */
const KIND_INTENT: [RegExp, AskEntryKind][] = [
  [/\b(drills?|exercises?)\b/i, "drill"],
  [/\b(session|today|block)\b/i, "session"],
  [/\b(swing|technique)\b/i, "swing"],
  [/\b(scorecards?|hole by hole)\b/i, "round"],
];

const KIND_BONUS = 2;

export function searchIndex(query: string, entries: AskEntry[], limit = CANDIDATES): AskEntry[] {
  const tokens = expand(query).filter((token) => !STOP_WORDS.has(token));
  if (tokens.length === 0) return [];

  const superlative = SUPERLATIVE.test(query);
  const wantedKind = KIND_INTENT.find(([pattern]) => pattern.test(query))?.[1] ?? null;

  const fields = entries.map((entry) => ({
    title: tokenize(entry.title),
    rest: tokenize([entry.detail, ...entry.keywords].join(" ")),
  }));

  /*
    Inverse document frequency, so a word carries weight in proportion to how
    rare it is here. Without it "shots" - which is in almost every label - beats
    "150", and a question about a yardage returns whatever is alphabetically
    lucky. This self-tunes to the player's own data instead of needing a
    hand-maintained list of golf stop words.
  */
  const idf = new Map<string, number>();
  for (const token of tokens) {
    const seen = fields.filter(
      (field) =>
        field.title.some((t) => matches(token, t)) || field.rest.some((t) => matches(token, t)),
    ).length;
    idf.set(token, Math.log(1 + entries.length / (1 + seen)));
  }

  const scored = entries.map((entry, index) => {
    const field = fields[index]!;
    let score = 0;
    for (const token of tokens) {
      const weight = idf.get(token) ?? 0;
      // A hit in the name is worth more than one in the supporting text.
      if (field.title.some((t) => matches(token, t))) score += weight * 3;
      else if (field.rest.some((t) => matches(token, t))) score += weight;
    }
    // The bonus is flat across weaknesses, so words still discriminate between
    // them - it only lifts the ranked list above untargeted segment noise.
    if (superlative && entry.kind === "weakness") score += SUPERLATIVE_BONUS;
    if (score > 0 && entry.kind === wantedKind) score += KIND_BONUS;
    if (score > 0 && entry.kind === "screen") score += 0.5;
    return { entry, score };
  });

  return scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (b.entry.weight ?? 0) - (a.entry.weight ?? 0))
    .slice(0, limit)
    .map((row) => row.entry);
}

// --------------------------------------------------------------- the agent

export async function askCoach(rawQuestion: string, state: PlayerState): Promise<AskState> {
  const parsed = askQuestionSchema.safeParse(rawQuestion);
  if (!parsed.success) {
    return { ...ASK_IDLE, message: "Ask a question of at least two characters." };
  }
  const question = parsed.data;

  const index = buildAskIndex(state);
  const hits = searchIndex(question, index);

  if (hits.length === 0) {
    return {
      ...ASK_IDLE,
      ok: true,
      question,
      answer:
        "Nothing in your data matches that. Try a club, a distance, a category like putting, or the name of a screen.",
      results: SCREENS.slice(0, 3),
      followUp: ["Where am I losing the most shots?", "What should I practise today?"],
    };
  }

  const byId = new Map(hits.map((hit) => [hit.id, hit]));

  const result = await getProvider().generate({
    name: "ask",
    system: `${COACH_SYSTEM_PROMPT}

You are answering a question by choosing from a list of things already found in this player's data. Extra rules:
- Choose only from the ids listed. Never invent an id, a screen or a statistic.
- Quote a number only if it appears in the entry you are pointing at.
- Answer in one or two short sentences. The app renders the entries themselves underneath you, so do not list them again.
- If nothing listed really answers the question, say so plainly and point at the closest entry.`,
    prompt: `Question: ${question}

Candidates:
${hits.map((hit) => `- id: ${hit.id}\n  name: ${hit.title}\n  facts: ${hit.detail}`).join("\n")}

Reply with JSON: {"answer": string, "result_ids": string[], "follow_up": string[]}`,
    schema: askAnswerSchema,
    maxTokens: 600,
    fallback: () => ({
      answer: ruleBasedAnswer(question, hits),
      result_ids: hits.slice(0, MAX_RESULTS).map((hit) => hit.id),
      follow_up: [],
    }),
  });

  // Ids the model made up are dropped rather than rendered as dead links.
  const chosen = result.data.result_ids
    .map((id) => byId.get(id))
    .filter((entry): entry is AskEntry => entry !== undefined)
    .slice(0, MAX_RESULTS);

  return {
    ok: true,
    question,
    answer: result.data.answer,
    results: chosen.length > 0 ? chosen : hits.slice(0, MAX_RESULTS),
    followUp: result.data.follow_up.slice(0, 3),
    source: result.source,
    ...(result.note ? { note: result.note } : {}),
  };
}

/**
 * The no-model answer. It restates the top hit using only its own computed
 * detail string, which is why it can never disagree with the list below it.
 */
export function ruleBasedAnswer(question: string, hits: AskEntry[]): string {
  const top = hits[0];
  if (!top) return "Nothing in your data matches that.";

  const more = hits.length > 1 ? ` ${hits.length - 1} other match${hits.length === 2 ? "" : "es"} below.` : "";

  switch (top.kind) {
    case "weakness":
      return `Closest match in your data is ${top.title}. ${top.detail}.${more}`;
    case "segment":
      return `${top.title}: ${top.detail}.${more}`;
    case "round":
      return `${top.title} on ${top.detail.split(" · ")[0]}. Open it for the hole-by-hole breakdown.${more}`;
    case "practice":
      return `${top.title} is the tracked drill that matches. ${top.detail}.${more}`;
    case "drill":
      return `${top.title} is the closest drill. ${top.detail}.${more}`;
    case "swing":
      return `Recorded swing finding: ${top.title}. ${top.detail}.${more}`;
    case "session":
      return `Today's session is ${top.title}. ${top.detail}.${more}`;
    default:
      return `${top.title} is where that lives — ${top.detail.toLowerCase()}.${more}`;
  }
}
