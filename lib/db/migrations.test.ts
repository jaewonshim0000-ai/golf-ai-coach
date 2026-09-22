import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("live schema: atomic practice, persistent results, and cross-user isolation", async () => {
  const db = new PGlite();
  try {
    // Minimal Supabase-owned schemas; execute the app's actual migrations and seed.
    await db.exec(`
      create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id text primary key, bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
    `);
    for (const path of ["supabase/migrations/0001_init.sql", "supabase/migrations/0002_live_practice.sql", "supabase/migrations/0003_swing_vision.sql", "supabase/migrations/0004_swing_clips.sql", "supabase/migrations/0005_delete_account.sql", "supabase/seed/seed.sql"]) {
      const sql = (await readFile(path, "utf8")).replace('create extension if not exists "pgcrypto";', "");
      await db.exec(sql);
    }
    const user = "00000000-0000-0000-0000-000000000001";
    const other = "00000000-0000-0000-0000-000000000002";
    await db.exec(`insert into auth.users values ('${user}', 'a@example.test', '{}'), ('${other}', 'b@example.test', '{}');
      grant usage on schema public, auth to authenticated;
      grant select, insert, update, delete on all tables in schema public to authenticated;
      set role authenticated;
      set request.jwt.claim.sub = '${user}';`);
    const session = { id: "practice_test", user_id: user, title: "Wedges", focus: "start_line", planned_duration: 10, status: "in_progress", scheduled_for: "2026-09-20", created_at: new Date().toISOString() };
    const item = { id: "item_test", session_id: session.id, drill_id: "drill_wedge_accuracy", block: "skill", order_index: 0, duration: 10, target_reps: 10, target_value: 0.7, objective: "7 of 10" };
    await assert.rejects(db.query("select create_practice($1, $2)", [{ ...session, id: "failed" }, [{ ...item, session_id: "failed", drill_id: "missing" }]]));
    assert.equal((await db.query("select * from practice_sessions where id = 'failed'")).rows.length, 0);
    await db.query("select create_practice($1, $2)", [session, [item]]);
    assert.equal((await db.query("select * from practice_items")).rows.length, 1);
    await db.query(`insert into drill_attempts(id,user_id,session_id,practice_item_id,drill_id,attempts,successes,score,shot_offsets)
      values ('result', $1, 'practice_test', 'item_test', 'drill_wedge_accuracy', 10, 7, 0.7, '[0,1,-1,2,-2,4,-4,6,-8,10]')`, [user]);
    await db.query(`insert into drill_attempts(id,user_id,session_id,practice_item_id,drill_id,attempts,successes,score)
      values ('updated', $1, 'practice_test', 'item_test', 'drill_wedge_accuracy', 10, 8, 0.8)
      on conflict(session_id,drill_id) do update set successes=excluded.successes, score=excluded.score`, [user]);
    assert.equal((await db.query<{ successes: number }>("select successes from drill_attempts")).rows[0]!.successes, 8);
    await db.exec(`set request.jwt.claim.sub = '${other}'`);
    assert.equal((await db.query("select * from practice_sessions")).rows.length, 0);
    assert.equal((await db.query("select * from drill_attempts")).rows.length, 0);
    await assert.rejects(db.query(`insert into drill_attempts(id,user_id,session_id,practice_item_id,drill_id,attempts,successes,score)
      values ('attack', $1, 'practice_test', 'item_test', 'drill_wedge_accuracy', 10, 10, 1)`, [other]));
    await assert.rejects(db.query("select create_practice($1, $2)", [{ ...session, id: "spoof" }, [item]]));
    await db.exec(`set request.jwt.claim.sub = '${user}'; update practice_sessions set status = 'complete' where id = 'practice_test';`);
    await assert.rejects(db.exec("update drill_attempts set successes = 9 where id = 'result'"));

    // A model estimate may never be stored as if a person had measured it.
    await db.exec(`insert into swing_sessions(id,user_id,camera_angle,club,shot_type,swing_pattern,analysis_status)
      values ('swing_test', '${user}', 'down_the_line', '7_iron', 'full swing', 'unknown', 'manual');`);
    await db.exec(`insert into swing_measurements(id,swing_session_id,phase,metric,value,unit,confidence,source)
      values ('m_vision', 'swing_test', 'impact', 'pelvis_sway_impact', 0.8, 'in', 0.5, 'vision');`);
    await assert.rejects(db.exec(`insert into swing_measurements(id,swing_session_id,phase,metric,value,unit,confidence,source)
      values ('m_overconfident', 'swing_test', 'top', 'chest_turn_top', 88, 'deg', 0.95, 'vision');`));
    await assert.rejects(db.exec(`insert into swing_measurements(id,swing_session_id,phase,metric,value,unit,confidence,source)
      values ('m_bogus', 'swing_test', 'top', 'chest_turn_top', 88, 'deg', 0.5, 'guessed');`));
    assert.equal(
      (await db.query<{ source: string }>("select source from swing_measurements")).rows[0]!.source,
      "vision",
    );

    // A trim is a range or it is nothing: no inverted or hairline clips.
    await db.exec("update swing_sessions set clip_start = 0.4, clip_end = 2.1 where id = 'swing_test'");
    await assert.rejects(db.exec("update swing_sessions set clip_start = 3, clip_end = 1 where id = 'swing_test'"));
    await assert.rejects(db.exec("update swing_sessions set clip_start = 1, clip_end = 1.05 where id = 'swing_test'"));
    await db.exec("update swing_sessions set clip_start = null, clip_end = null where id = 'swing_test'");

    // Leaving takes everything with it, and only ever the caller's own row.
    await db.query("select delete_my_account()");
    assert.equal((await db.query("select * from swing_sessions")).rows.length, 0);
    // auth.users is not readable by the app role, so check it as the owner.
    await db.exec("reset role");
    assert.equal((await db.query(`select * from auth.users where id = '${user}'`)).rows.length, 0);
    assert.equal((await db.query(`select * from auth.users where id = '${other}'`)).rows.length, 1);
    assert.equal((await db.query(`select * from public.users where id = '${user}'`)).rows.length, 0);
  } finally { await db.close(); }
});
