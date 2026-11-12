// Code-review fixes (a-doc p5-review R1–R10), mock-backend side. Ported from the reviewer's proof tests: each one
// asserted the defect before and asserts the corrected behaviour now.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.ts';
import { ApiError } from '../src/api/errors.ts';
import { createMemoryKV } from '../src/api/mock/kv.ts';
import { AUTHOR_NO_ENTITLEMENT, createMockServer } from '../src/api/mock/server.ts';
import { DOC_KEY } from '../src/api/mock/db.ts';
import { offsetMeters } from '../src/domain/geo.ts';
import { newRequestId } from '../src/domain/ids.ts';
import { summarize } from '../src/domain/tiers.ts';

const O = { latitude: 39.9786, longitude: 116.4215 };

function setup({ kv } = {}) {
  const env = { now: Date.UTC(2026, 10, 12, 4, 0), tokens: {} };
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  env.kv = kv ?? createMemoryKV();
  env.server = createMockServer({ kv: env.kv, clock: () => env.now, random });
  env.as = (name) => createApiClient((a, p, t) => env.server.handle(a, p, t), () => env.tokens[name] ?? null);
  env.api = env.as('a');
  env.tick = (ms) => { env.now += ms; };
  env.rid = () => newRequestId(random, env.now);
  env.at = (east, north, accuracy = 5) => ({ ...offsetMeters(O, east, north), crs: 'wgs84', accuracy, timestamp: env.now, source: 'gps' });
  env.near = (p, m = 0) => ({ ...offsetMeters(p, 0, -m), crs: 'wgs84', accuracy: 5, timestamp: env.now, source: 'gps' });
  env.signIn = async (name, method) => {
    const s = await env.as(name).signIn({ method });
    env.tokens[name] = s.token;
    return s;
  };
  env.accountId = (name) => env.server.peek().sessions[env.tokens[name]].accountId;
  env.start = async () => {
    await env.signIn('a', 'guest');
    await env.api.demoUpdateSettings({ simulatedUsers: false });
    return env.api.nearby({ position: env.at(0, 0) });
  };
  env.ticket = async (api, purpose, position, postId) => (await api.presence({ purpose, postId, position })).ticket;
  env.publish = async (api, position, text) => {
    const ticket = await env.ticket(api, 'post', position);
    return api.post({ requestId: env.rid(), ticket, position, text, name: '测试地点' });
  };
  env.askChat = async (who, post, spot, greeting) => {
    const position = env.near(spot, 5);
    const ticket = await env.ticket(who, 'chat', position, post.id);
    return who.requestChat({ requestId: env.rid(), ticket, position, postId: post.id, greeting });
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
const rejectsOneOf = (p, codes) => assert.rejects(p, (e) => e instanceof ApiError && codes.includes(e.code));

test('R3: deleting a post cancels its pending chat requests; respondChat refuses on an inactive post; no credit used', async () => {
  const env = setup();
  await env.start();
  const spot = env.at(10, 10);
  const post = await env.publish(env.api, spot, '有人想聊吗');
  await env.signIn('b', 'apple');
  const b = env.as('b');
  const chat = await env.askChat(b, post, spot, '你好');
  await env.api.delete({ requestId: env.rid(), postId: post.id });
  assert.equal((await b.chat({ chatId: chat.id })).chat.state, 'cancelled');
  await rejectsOneOf(env.api.respondChat({ requestId: env.rid(), chatId: chat.id, accept: true }), ['CHAT_STATE', 'POST_MISSING']);
  // Even a request still marked pending (e.g. an older doc) cannot be accepted once its post is gone.
  env.server.peek().chats[chat.id].state = 'pending';
  await rejects(env.api.respondChat({ requestId: env.rid(), chatId: chat.id, accept: true }), 'POST_MISSING');
  assert.equal((await b.entitlements({})).chatCredits, 3);
});

test('R2: destroyChat scrubs message text and greeting from every stored receipt (rule 9)', async () => {
  const env = setup();
  await env.start();
  const spot = env.at(10, 10);
  const post = await env.publish(env.api, spot, '有人想聊吗');
  await env.signIn('b', 'apple');
  const b = env.as('b');
  const chat = await env.askChat(b, post, spot, '秘密招呼XYZ');
  await env.api.respondChat({ requestId: env.rid(), chatId: chat.id, accept: true });
  const sendId = env.rid();
  await b.sendChat({ requestId: sendId, chatId: chat.id, text: '私密内容ABC' });
  await env.api.sendChat({ requestId: env.rid(), chatId: chat.id, text: '对方回复DEF' });
  await env.api.destroyChat({ requestId: env.rid(), chatId: chat.id });
  const stored = env.kv.data.get(DOC_KEY);
  for (const secret of ['私密内容ABC', '对方回复DEF', '秘密招呼XYZ']) {
    assert.ok(!stored.includes(secret), `${secret} must not survive destroy on disk`);
    assert.ok(!JSON.stringify(env.server.peek()).includes(secret), `${secret} must not survive destroy in memory`);
  }
  // A late retry of the same send no longer replays the stored message; the chat is terminal.
  await rejects(b.sendChat({ requestId: sendId, chatId: chat.id, text: '私密内容ABC' }), 'CHAT_STATE');
});

test('R6: block needs ≥ preview for a post and returns a fresh opaque blockId per action', async () => {
  const env = setup();
  const { posts } = await env.start();
  assert.equal(posts.find((p) => p.id === 'seed-door').level, 'dot');
  // seed-stairs-tip and seed-door share an author.
  const here = env.at(0, 0);
  const first = await env.api.block({ requestId: env.rid(), target: { kind: 'post', postId: 'seed-stairs-tip' }, position: here });
  await rejects(env.api.block({ requestId: env.rid(), target: { kind: 'post', postId: 'seed-door' }, position: here }), 'FORBIDDEN');
  await rejects(env.api.block({ requestId: env.rid(), target: { kind: 'post', postId: 'seed-stairs-question' } }), 'FORBIDDEN');
  const door = env.server.peek().posts['seed-door'];
  const second = await env.api.block({ requestId: env.rid(), target: { kind: 'post', postId: 'seed-door' }, position: env.near(door, 100) });
  assert.notEqual(second.blockId, first.blockId, 'same author, different places -> unlinkable ids');
  const { blocks } = await env.api.blocks({});
  assert.equal(blocks.length, 2);
  assert.deepEqual(new Set(blocks.map((x) => x.id)), new Set([first.blockId, second.blockId]));
  // Retrying one action (same requestId) is still idempotent.
  const rid = env.rid();
  const quiet = env.server.peek().posts['seed-quiet'];
  const once = await env.api.block({ requestId: rid, target: { kind: 'post', postId: 'seed-quiet' }, position: env.near(quiet, 5) });
  const again = await env.api.block({ requestId: rid, target: { kind: 'post', postId: 'seed-quiet' }, position: env.near(quiet, 5) });
  assert.equal(again.blockId, once.blockId);
});

test('R5: a failed storage write rolls back and returns SERVICE_UNAVAILABLE; the retry really persists', async () => {
  const base = createMemoryKV();
  let failNext = false;
  const kv = { ...base, data: base.data, async setItem(k, v) { if (failNext && k === DOC_KEY) { failNext = false; throw new Error('disk full'); } return base.setItem(k, v); } };
  const env = setup({ kv });
  await env.start();
  const here = env.at(0, 0);
  const ticket = await env.ticket(env.api, 'post', here);
  const req = { requestId: env.rid(), ticket, position: here, text: '会丢的留话', name: '地点' };
  failNext = true;
  await rejects(env.api.post(req), 'SERVICE_UNAVAILABLE');
  assert.ok(!Object.values(env.server.peek().posts).some((p) => p.text === '会丢的留话'), 'rolled back in memory');
  const ok = await env.api.post(req);
  assert.ok(ok.id);
  assert.ok(base.data.get(DOC_KEY).includes('会丢的留话'), 'on disk after the retry');
  const restarted = createMockServer({ kv: base, clock: () => env.now });
  await restarted.handle('status', {}, env.tokens.a);
  assert.ok(Object.values(restarted.peek().posts).some((p) => p.text === '会丢的留话'));
});

test('R9: InboxEvent ids are opaque (no account id), stable across calls', async () => {
  const env = setup();
  await env.start();
  const spot = env.at(10, 10);
  const post = await env.publish(env.api, spot, '有人接话吗');
  await env.signIn('b', 'apple');
  const b = env.as('b');
  const position = env.near(spot, 5);
  const ticket = await env.ticket(b, 'comment', position, post.id);
  await b.comment({ requestId: env.rid(), ticket, position, postId: post.id, text: '我来了' });
  const { events } = await env.api.activity({});
  assert.equal(events.length, 1);
  for (const id of [env.accountId('a'), env.accountId('b')]) assert.ok(!events[0].id.includes(id));
  assert.ok(!events[0].id.includes(':'));
  assert.equal((await env.api.inbox({})).events[0].id, events[0].id);
});

test('R10: a reported comment no longer shows up as a 回应 event for the reporter', async () => {
  const env = setup();
  await env.start();
  const spot = env.at(10, 10);
  const post = await env.publish(env.api, spot, '有人接话吗');
  await env.signIn('b', 'apple');
  const b = env.as('b');
  const position = env.near(spot, 5);
  const receipt = await b.comment({ requestId: env.rid(), ticket: await env.ticket(b, 'comment', position, post.id), position, postId: post.id, text: '广告广告' });
  assert.equal((await env.api.activity({})).events.length, 1);
  await env.api.report({ requestId: env.rid(), target: { kind: 'comment', postId: post.id, commentId: receipt.id }, reason: 'spam' });
  assert.equal((await env.api.activity({})).events.length, 0);
  assert.equal((await env.api.inbox({})).events.length, 0);
});

test('R10: the demo task leaves the server only at preview and full', async () => {
  const env = setup();
  const { posts } = await env.start();
  const task = { title: '演示任务', reward: 5, requirement: '仅演示' };
  const row = { ...O, id: 'p', sceneId: 's', name: 'n', text: 't', teaser: 'te', clue: 'c', hasPhoto: false, mood: 'sage', art: null, task,
    demo: true, commentCount: 0, likes: 0, replyParticipantCount: 0, lastEngagedAt: env.now, createdAt: env.now };
  const ctx = (position) => ({ position, now: env.now, participated: false, liked: false, saved: false, owned: false,
    author: { nickname: '路人 0000', avatar: null, isMe: false, isOriginalPoster: true, simulated: true } });
  assert.equal(summarize(row, ctx(env.at(0, 500))).task, null);
  assert.deepEqual(summarize(row, ctx(env.at(0, 120))).task, task);
  assert.deepEqual(summarize(row, ctx(env.at(0, 5))).task, task);
  for (const p of posts.filter((x) => x.level === 'dot')) assert.equal(p.task, null);
});

test('R10: another person who wrote the post shows as their alias (楼主 is a badge, not the name)', async () => {
  const env = setup();
  await env.start();
  await joinCorner(env);
  const view = await env.api.thread({ postId: 'seed-corner' });
  assert.match(view.post.author.nickname, /^路人 [0-9A-F]{4}$/);
  assert.equal(view.post.author.isOriginalPoster, true);
});

test('R10: Session.accountKey is opaque and per account (a new guest does not inherit seen marks)', async () => {
  const env = setup();
  const guest = await env.signIn('a', 'guest');
  assert.match(guest.accountKey, /^k-[0-9a-f]{16}$/);
  assert.ok(!guest.accountKey.includes(env.accountId('a')));
  assert.equal((await env.api.status({})).accountKey, guest.accountKey);
  const wechat = await env.signIn('a', 'wechat');                       // same account converted: marks kept
  assert.equal(wechat.accountKey, guest.accountKey);
  const newGuest = await env.signIn('a', 'guest');                      // a brand-new device guest
  assert.equal(newGuest.accountLabel, guest.accountLabel);
  assert.notEqual(newGuest.accountKey, guest.accountKey);
});

test('NO_ENTITLEMENT: the author accepting for a requester with 0 credits sees the waiting copy; request stays pending', async () => {
  const env = setup();
  await env.start();
  const spot = env.at(10, 10);
  const post = await env.publish(env.api, spot, '有人想聊吗');
  await env.signIn('b', 'apple');
  const b = env.as('b');
  const chat = await env.askChat(b, post, spot, '你好');
  env.server.peek().credits[env.accountId('b')] = 0;
  await assert.rejects(env.api.respondChat({ requestId: env.rid(), chatId: chat.id, accept: true }),
    (e) => e instanceof ApiError && e.code === 'NO_ENTITLEMENT' && e.message === '对方的演示权益已用完，申请会继续等待。');
  assert.equal(AUTHOR_NO_ENTITLEMENT, '对方的演示权益已用完，申请会继续等待。');
  assert.equal((await b.chat({ chatId: chat.id })).chat.state, 'pending');
});
