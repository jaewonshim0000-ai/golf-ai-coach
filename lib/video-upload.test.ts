import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVideo, privateVideoPath, MAX_VIDEO_BYTES } from "./video-upload";

test("videos must be supported, nonempty, and within the upload limit", () => {
  const file = { name: "swing.mov", type: "video/quicktime", size: 1000 };
  assert.equal(validateVideo(file), null);
  assert.ok(validateVideo({ ...file, size: 0 }));
  assert.ok(validateVideo({ ...file, size: MAX_VIDEO_BYTES + 1 }));
  assert.ok(validateVideo({ ...file, name: "swing.html", type: "text/html" }));
});

test("video paths belong to the signed-in player and cannot traverse folders", () => {
  assert.equal(privateVideoPath("supabase://swing-videos/player/abc-123.mov", "player"), "player/abc-123.mov");
  assert.equal(privateVideoPath("supabase://swing-videos/other/abc.mov", "player"), null);
  assert.equal(privateVideoPath("supabase://swing-videos/player/../other/abc.mov", "player"), null);
  assert.equal(privateVideoPath("https://example.com/swing.mp4", "player"), null);
});
