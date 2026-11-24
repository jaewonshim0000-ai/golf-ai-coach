/*
  What the signed-out landing pages say, on desktop and on phones. Every
  number is something the app does, not a result it promises: no yards
  gained, no strokes saved. Check them against the code before changing a
  feature they describe.
*/
export type Chapter = {
  num: string;
  kicker: string;
  title: string;
  em: string;
  lede: string;
  stats: [value: string, label: string][];
};

export const CHAPTERS: Chapter[] = [
  {
    num: "01",
    kicker: "Swing Lab",
    title: "Every swing,",
    em: "scored.",
    lede: "Film a swing on your phone, face on or down the line. Your body is tracked frame by frame right in the browser, the swing is scored out of 10, and you get the one fault to fix first, with drills for it. A trend line shows whether it is getting better.",
    stats: [["5", "swing checks"], ["1", "fix at a time"], ["0", "video sent to AI"]],
  },
  {
    num: "02",
    kicker: "Practice",
    title: "Practice you can",
    em: "measure.",
    lede: "Thirty practice tests for the range, chipping and putting. Your recent rounds decide which come first, and each test's target tightens as you improve. Pick 15, 30 or 60 minutes and the session is built for you.",
    stats: [["30", "practice tests"], ["10", "balls a goal test"], ["15–60", "minute sessions"]],
  },
  {
    num: "03",
    kicker: "Coach",
    title: "Your coach, from",
    em: "your numbers.",
    lede: "Log a round shot by shot or as a live scorecard that saves each hole as you go. See fairways, greens, putts and scrambling, and with Premium, strokes gained by club and distance. Ask the coach anything about your game; it answers from your own data.",
    stats: [["2", "ways to log a round"], ["10", "recent rounds read"], ["1", "priority, worst first"]],
  },
];
