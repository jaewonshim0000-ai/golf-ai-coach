import assert from "node:assert/strict";
import { it } from "node:test";
import { retryReads } from "./supabase";

function server(statuses: number[]) {
  const calls: string[] = [];
  const fetcher = retryReads(async (_input, init) => {
    calls.push(init?.method ?? "GET");
    return new Response(null, { status: statuses.shift() ?? 200 });
  }, 0);
  return { fetcher, calls };
}

it("retries a read that hits a gateway error with an empty body, as one did in production", async () => {
  const { fetcher, calls } = server([502, 504, 200]);
  assert.equal((await fetcher("https://db.example/rest/v1/swing_sessions")).status, 200);
  assert.equal(calls.length, 3);
});

it("gives up after three tries and never repeats writes or client errors", async () => {
  const down = server([500, 500, 500, 500]);
  assert.equal((await down.fetcher("https://db.example/rest/v1/rounds")).status, 500);
  assert.equal(down.calls.length, 3);
  const write = server([502]);
  assert.equal((await write.fetcher("https://db.example/rest/v1/rounds", { method: "POST" })).status, 502);
  assert.equal(write.calls.length, 1);
  const missing = server([404]);
  assert.equal((await missing.fetcher("https://db.example/rest/v1/rounds")).status, 404);
  assert.equal(missing.calls.length, 1);
});
