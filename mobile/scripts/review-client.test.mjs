// Code-review fixes (a-doc p5-review R1, R4, R7, R8, R10 Author), client side: the pure rules the hooks and screens use,
// each also checked end-to-end against the mock where the defect showed up there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.ts';
import { ApiError } from '../src/api/errors.ts';
import { createMemoryKV } from '../src/api/mock/kv.ts';
import { createMockServer } from '../src/api/mock/server.ts';
import { editAttempt, emptyAttempt, exclusive, renewAttempt } from '../src/domain/attempt.ts';
import { authorLabel } from '../src/domain/author.ts';
import { offsetMeters } from '../src/domain/geo.ts';
import { newRequestId } from '../src/domain/ids.ts';
import { expiryPlan, freshOrWait, REFETCH_LEAD_MS, refetchWhenFresh, usableFix } from '../src/domain/refresh.ts';
import { expireSummary } from '../src/domain/tiers.ts';

const O = { latitude: 39.9786, longitude: 116.4215 };
const JPEG = '/9j/' + 'A'.repeat(400);

function setup() {
  const env = { now: Date.UTC(2026, 10, 12, 4, 0), tokens: {} };
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  env.server = createMockServer({ kv: createMemoryKV(), clock: () => env.now, random });
  env.as = (name) => createApiClient((a, p, t) => env.server.handle(a, p, t), () => env.tokens[name] ?? null);
  env.api = env.as('a');
  env.tick = (ms) => { env.now += ms; };
  env.rid = () => newRequestId(random, env.now);
  env.at = (east, north) => ({ ...offsetMeters(O, east, north), crs: 'wgs84', accuracy: 5, timestamp: env.now, source: 'gps' });
  env.start = async () => {
    env.tokens.a = (await env.api.signIn({ method: 'guest' })).token;
    await env.api.demoUpdateSettings({ simulatedUsers: false });
    return env.api.nearby({ position: env.at(0, 0) });
  };
  return env;
}
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof ApiError && e.code === code);

/** p8 #4: the seed no longer makes the caller a participant of seed-corner — join it with an on-site reply first. */
async function joinCorner(env) {
  const spot = { ...offsetMeters(env.server.peek().posts['seed-corner'], 0, -5), crs: 'wgs84', accuracy: 5, timestamp: env.now, source: 'gps' };
  const { ticket } = await env.api.presence({ purpose: 'comment', postId: 'seed-corner', position: spot });
  await env.api.comment({ requestId: env.rid(), ticket, position: spot, postId: 'seed-corner', text: '上次在这里等朋友。' });
}

test('R1: expiryPlan refetches 3 s before readExpiresAt and collapses only at expiry; no loop on an already-expired read', () => {
  assert.deepEqual(expiryPlan(60_000, 0), { refetchIn: 60_000 - REFETCH_LEAD_MS, collapseIn: 60_050, refetchOnCollapse: true });
  assert.deepEqual(expiryPlan(12_000, 0), { refetchIn: 9_000, collapseIn: 12_050, refetchOnCollapse: true });
  assert.deepEqual(expiryPlan(2_000, 0), { refetchIn: null, collapseIn: 2_050, refetchOnCollapse: true });
  assert.deepEqual(expiryPlan(1_000, 5_000), { refetchIn: null, collapseIn: 0, refetchOnCollapse: false });
  assert.deepEqual(expiryPlan(0, 5_000), { refetchIn: null, collapseIn: null, refetchOnCollapse: false });
});

test('R1: refetching at the planned time replaces the snapshot before it would collapse (participant and on-site)', async () => {
  const env = setup();
  const { posts } = await env.start();
  await joinCorner(env);
  const t0 = env.now;
  const view = await env.api.thread({ postId: 'seed-corner' });           // participant, 60 s read
  env.tick(expiryPlan(view.post.readExpiresAt, t0).refetchIn);
  const next = await env.api.thread({ postId: 'seed-corner' });
  assert.equal(expireSummary(next.post, view.post.readExpiresAt + 50, null).level, 'full');
  assert.equal(expireSummary(view.post, view.post.readExpiresAt + 50, null).level, 'dot', 'old snapshot would have collapsed');
  const bench = posts.find((p) => p.id === 'seed-bench');
  const near = () => ({ ...offsetMeters(bench, 0, -5), crs: 'wgs84', accuracy: 5, timestamp: env.now, source: 'gps' });
  const t1 = env.now;
  const onsite = await env.api.thread({ postId: 'seed-bench', position: near() });
  env.tick(expiryPlan(onsite.post.readExpiresAt, t1).refetchIn);
  const fix = near();                                                      // the watch delivered a new reading meanwhile
  const again = await env.api.thread({ postId: 'seed-bench', position: fix });
  assert.equal(expireSummary(again.post, onsite.post.readExpiresAt + 50, fix).level, 'full');
});

test('R4: a stale GPS fix is never sent; the skipped fetch (or a STALE_LOCATION error) retries once the fix is fresh', async () => {
  const now = 1_000_000;
  const gps = (age) => ({ ...O, crs: 'wgs84', accuracy: 5, timestamp: now - age, source: 'gps' });
  assert.equal(usableFix(gps(16_000), now), false);
  assert.equal(usableFix(gps(2_000), now), true);
  assert.equal(usableFix({ ...gps(60_000), source: 'simulated' }, now), true);
  assert.equal(usableFix(null, now), false);
  assert.equal(refetchWhenFresh({ fresh: true, skipped: true, errorCode: null }), true);
  assert.equal(refetchWhenFresh({ fresh: true, skipped: false, errorCode: 'STALE_LOCATION' }), true);
  assert.equal(refetchWhenFresh({ fresh: false, skipped: true, errorCode: 'STALE_LOCATION' }), false);
  assert.equal(refetchWhenFresh({ fresh: true, skipped: false, errorCode: null }), false);
  assert.equal(refetchWhenFresh({ fresh: true, skipped: false, errorCode: 'NETWORK' }), false);
  // Why: the server answers a stale fix with STALE_LOCATION; the same spot with a fresh fix works.
  const env = setup();
  await env.start();
  await rejects(env.api.nearby({ position: { ...env.at(0, 0), timestamp: env.now - 16_000 } }), 'STALE_LOCATION');
  assert.ok((await env.api.nearby({ position: env.at(0, 0) })).posts.length > 0);
});

test('R7: one submit in flight — a same-frame double tap runs the write once; the flag resets after success or failure', async () => {
  const flag = { current: false };
  let runs = 0;
  let release;
  const task = () => { runs++; return new Promise((resolve) => { release = resolve; }); };
  const first = exclusive(flag, task);
  const second = exclusive(flag, task);                                   // same frame: before any re-render
  assert.equal(runs, 1);
  release('ok');
  assert.deepEqual([await first, await second], ['ok', undefined]);
  await assert.rejects(exclusive(flag, async () => { throw new Error('x'); }));
  assert.equal(await exclusive(flag, async () => 'again'), 'again');
});

test('R7: the requestId is minted when the body changes, so repeated taps and retries reuse it; double submit -> one reply', async () => {
  let n = 0;
  const mint = () => `rid-${++n}-abcdefghijk`;
  const a = editAttempt('你好', mint);
  assert.equal(a.requestId, 'rid-1-abcdefghijk');
  assert.equal(editAttempt('你好呀', mint).requestId, 'rid-2-abcdefghijk');
  assert.deepEqual(editAttempt('   ', mint), { text: '   ', requestId: null });
  assert.deepEqual(renewAttempt(a, mint), { text: '你好', requestId: 'rid-3-abcdefghijk' });
  assert.deepEqual(emptyAttempt, { text: '', requestId: null });
  const env = setup();
  await env.start();
  await joinCorner(env);
  const draft = editAttempt('离场也想接着说');
  const send = () => env.api.continueComment({ requestId: draft.requestId, postId: 'seed-corner', text: draft.text });
  const [x, y] = await Promise.all([send(), send()]);                       // two taps that both got through
  assert.equal(x.id, y.id);
  const { comments } = await env.api.thread({ postId: 'seed-corner' });
  assert.equal(comments.filter((c) => c.text === '离场也想接着说').length, 1);
});

test('R8: freshOrWait keeps a fresh fix, re-reads a stale one (bounded), and never returns a stale fix', async () => {
  const now = 1_000_000;
  const clock = () => now;
  const gps = (age) => ({ ...O, crs: 'wgs84', accuracy: 5, timestamp: now - age, source: 'gps' });
  let reads = 0;
  const fresh = gps(1_000);
  assert.equal(await freshOrWait(fresh, async () => { reads++; return null; }, clock), fresh);
  assert.equal(reads, 0);
  const next = gps(0);
  assert.equal(await freshOrWait(gps(20_000), async () => next, clock), next);
  assert.equal(await freshOrWait(gps(20_000), async () => gps(30_000), clock), null);
  assert.equal(await freshOrWait(gps(20_000), async () => { throw new Error('gps'); }, clock), null);
  assert.equal(await freshOrWait(null, () => new Promise(() => {}), clock, 20), null);
});

test('R8: a slow photo step makes the original fix stale; re-reading before presence `post` publishes instead of STALE_LOCATION', async () => {
  const env = setup();
  await env.start();
  const run = async (refix) => {
    const fix = env.at(30, 30);
    const photoTicket = (await env.api.presence({ purpose: 'photo', position: fix })).ticket;
    const { photoId } = await env.api.uploadPhoto({ requestId: env.rid(), ticket: photoTicket, position: fix, base64: JPEG, contentType: 'image/jpeg' });
    env.tick(16_000);                                                      // slow upload / latency: the fix is now 16 s old
    const position = refix ? await freshOrWait(fix, async () => env.at(31, 30), () => env.now) : fix;
    const ticket = (await env.api.presence({ purpose: 'post', position })).ticket;
    return env.api.post({ requestId: env.rid(), ticket, position, text: '照片留话', name: '测试地点', photoId });
  };
  await rejects(run(false), 'STALE_LOCATION');
  assert.ok((await run(true)).id);
});

test('R10: Author label — other OP = alias + 楼主 badge; a plain 「楼主」 name never gets a second 楼主; me = my nickname', () => {
  const other = { nickname: '路人 3F2A', avatar: null, isMe: false, isOriginalPoster: true, simulated: true };
  assert.deepEqual(authorLabel(other, '我自己'), { name: '路人 3F2A', badges: ['楼主'], simulated: true });
  assert.deepEqual(authorLabel({ ...other, nickname: '楼主' }, '我自己').badges, []);
  assert.deepEqual(authorLabel({ ...other, isMe: true, nickname: 'x' }, '我自己'), { name: '我自己', badges: ['我', '楼主'], simulated: false });
  assert.deepEqual(authorLabel({ ...other, isOriginalPoster: false }, '我自己').badges, []);
});
