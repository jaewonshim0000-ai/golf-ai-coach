import { readFileSync } from "node:fs";
import { evaluateSwingCaptures } from "../lib/swing/evaluation";
import { faceOnSwing } from "../lib/golf/__fixtures__/face-on";
import { packFrames } from "../lib/golf/pose";

const path = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const input = path ? JSON.parse(readFileSync(path, "utf8")) : [{
  id: "synthetic-smoke", origin: "synthetic", split: "development", view: "face_on", handedness: "right",
  sourceFps: 25, occluded: false, shouldAbstain: false, acceptableIssues: [],
  phases: { address: 0.24, top: 1.44, impact: 1.76 },
  tracks: { swing_session_id: "evaluation", ...packFrames(faceOnSwing().map((frame) => ({ ...frame, landmarks: [] }))),
    frames: packFrames(faceOnSwing()).imageFrames, aspect: 9 / 16 },
}];
const report = evaluateSwingCaptures(input);
console.log(JSON.stringify({ dataset: path ?? "Synthetic smoke fixture; no real-video accuracy evidence", ...report }, null, 2));
if (process.argv.includes("--release") && report.gate !== "eligible_for_review") process.exitCode = 2;
