import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Postgres enforces owner-only reads, authenticated writes and revision checks', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
    `);
    const sql = await readFile(new URL('../supabase/journal.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql); // Safe to run the setup again without replacing a journal.
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.sup_journals'), /permission denied/);
    await assert.rejects(db.query("select public.sup_save_journal(0, '[]')"), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.query("select public.sup_save_journal(0, '[]')"), /Sign in required/);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", ['11111111-1111-4111-8111-111111111111']);
    assert.equal((await db.query("select public.sup_save_journal(0, '[{\"id\":\"one\"}]') as revision")).rows[0].revision, 1);
    await assert.rejects(db.query("select public.sup_save_journal(0, '[]')"), /another device/);
    await assert.rejects(db.query("update public.sup_journals set trips = '[]'"), /permission denied/);
    await assert.rejects(db.query('delete from public.sup_journals'), /permission denied/);
    await assert.rejects(db.query("select public.sup_save_journal(1, '[{\"id\":\"same\"},{\"id\":\"same\"}]')"), /Invalid trip IDs/);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", ['22222222-2222-4222-8222-222222222222']);
    assert.equal((await db.query('select * from public.sup_journals')).rows.length, 0);
    await assert.rejects(db.query("select public.sup_save_journal(1, '[]')"), /another device/);
    await db.query("select public.sup_save_journal(0, '[{\"id\":\"two\"}]')");
    const own = (await db.query('select user_id, trips from public.sup_journals')).rows;
    assert.deepEqual(own, [{ user_id: '22222222-2222-4222-8222-222222222222', trips: [{ id: 'two' }] }]);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from public.sup_journals')).rows[0].n, 2);
  } finally { await db.close(); }
});
