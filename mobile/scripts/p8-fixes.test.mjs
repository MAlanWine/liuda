// p8-fix: regressions for the p7 simulator smoke-test findings (logic parts). Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.ts';
import { ApiError } from '../src/api/errors.ts';
import { createMemoryKV } from '../src/api/mock/kv.ts';
import { createMockServer } from '../src/api/mock/server.ts';
import { offsetMeters } from '../src/domain/geo.ts';
import { heat } from '../src/domain/heat.ts';
import { newRequestId } from '../src/domain/ids.ts';
import { chatEntry, myOpenChat } from '../src/domain/chat.ts';
import { placeWantsTracking } from '../src/domain/refresh.ts';
import { NAME_MAX, shortenName } from '../src/domain/text.ts';
import { decodeDraft, emptyDraft, encodeDraft, readDraft, writeDraft } from '../src/state/draft-data.ts';

const O = { latitude: 39.9786, longitude: 116.4215 };

function setup({ simulatedUsers = false } = {}) {
  const env = { now: Date.UTC(2026, 10, 12, 4, 0), tokens: {} };
  let seed = 23;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  env.server = createMockServer({ kv: createMemoryKV(), clock: () => env.now, random });
  env.as = (name) => createApiClient((a, p, t) => env.server.handle(a, p, t), () => env.tokens[name] ?? null);
  env.api = env.as('a');
  env.tick = (ms) => { env.now += ms; };
  env.rid = () => newRequestId(random, env.now);
  env.near = (p, m = 0) => ({ ...offsetMeters(p, 0, -m), crs: 'wgs84', accuracy: 5, timestamp: env.now, source: 'gps' });
  env.start = async () => {
    env.tokens.a = (await env.api.signIn({ method: 'guest' })).token;
    await env.api.demoUpdateSettings({ simulatedUsers });
    return env.api.nearby({ position: env.near(O) });
  };
  env.ticket = async (purpose, position, postId) => (await env.api.presence({ purpose, postId, position })).ticket;
  env.post = (id) => env.server.peek().posts[id];
  return env;
}
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof ApiError && e.code === code);

test('p8 #4: a fresh guest takes part in nothing — no seeded reply or thread (participation only from own post / on-site reply)', async () => {
  const env = setup();
  const { posts } = await env.start();
  const inbox = await env.api.inbox({});
  assert.deepEqual([inbox.threads.length, inbox.mine.length, inbox.events.length], [0, 0, 0]);
  const corner = posts.find((p) => p.id === 'seed-corner');
  assert.equal(corner.participated, false);
  await rejects(env.api.thread({ postId: 'seed-corner' }), 'LOCATION_REQUIRED');
  const onsite = await env.api.thread({ postId: 'seed-corner', position: env.near(env.post('seed-corner'), 5) });
  assert.ok(onsite.comments.length >= 2 && onsite.comments.every((c) => !c.mine));
  assert.equal(heat(corner, env.now).label, '有回应');                                   // demo heat tiers unchanged
  // Me 我参与的 and 消息 我参与的 both read inbox.threads: my own post is in it.
  const spot = env.near(O);
  const ticket = await env.ticket('post', spot);
  await env.api.post({ requestId: env.rid(), ticket, position: spot, text: '这里的灯很亮。', name: '测试地点' });
  const after = await env.api.inbox({});
  assert.deepEqual([after.threads.length, after.mine.length, after.threads[0].owned], [1, 1, true]);
});

test('p8 #9f: a simulated chat request is stamped when it materialises, so a seen mark taken meanwhile cannot swallow the badge', async () => {
  const env = setup({ simulatedUsers: true });
  await env.start();
  const spot = env.near(O);
  const ticket = await env.ticket('post', spot);
  await env.api.post({ requestId: env.rid(), ticket, position: spot, text: '路过的人可以接一句。', name: '测试地点' });
  env.tick(2 * 60_000 + 40_000);                                         // the request was due at +2 min; nobody polled until now
  const { chats } = await env.api.inbox({});
  const incoming = chats.find((c) => c.role === 'author' && c.state === 'pending');
  assert.ok(incoming, 'simulated chat request arrived');
  const seenMeanwhile = env.now - 10_000;                                 // e.g. 消息 › 私聊 was viewed 10 s ago
  assert.equal(incoming.updatedAt, env.now);
  assert.ok(Math.max(incoming.updatedAt, incoming.lastMessageAt ?? 0) > seenMeanwhile, 'counts as unseen');
});

test('p8 #3: place detail offers 已申请 / 打开私聊 for my open request; the server refuses a second request', async () => {
  const env = setup({ simulatedUsers: true });
  await env.start();
  const spot = env.near(env.post('seed-bench'), 5);
  const ask = async (greeting) => env.api.requestChat({ requestId: env.rid(), ticket: await env.ticket('chat', spot, 'seed-bench'), position: spot, postId: 'seed-bench', greeting });
  const first = await ask('你好，想多聊两句。');
  assert.deepEqual(chatEntry((await env.api.inbox({})).chats, 'seed-bench'), { kind: 'pending', chatId: first.id, label: '已申请私聊 · 等待对方同意' });
  await rejects(ask('再申请一次'), 'CHAT_STATE');
  env.tick(9_000);                                                        // simulated author accepts after 8 s
  const { chats } = await env.api.inbox({});
  assert.deepEqual(chatEntry(chats, 'seed-bench'), { kind: 'open', chatId: first.id, label: '打开私聊' });
  assert.equal(chats.filter((c) => c.postId === 'seed-bench').length, 1);
  assert.deepEqual(chatEntry(chats, 'seed-corner'), { kind: 'request' });
  const closed = chats.map((c) => ({ ...c, state: 'declined' }));
  assert.equal(myOpenChat(closed, 'seed-bench'), null);
  assert.equal(myOpenChat(chats.map((c) => ({ ...c, role: 'author' })), 'seed-bench'), null);
  assert.deepEqual(chatEntry(null, 'seed-bench'), { kind: 'request' });
});

test('p8 #5: the 留下 draft is stored per account without photo bytes and restored after a restart', () => {
  const draft = { text: '想在这里留一句', name: '西门梧桐树下', clue: '进门右转', sceneId: null, requestId: 'rid-abcdefghijklmnop',
    photo: { uri: 'file:///cache/ImageManipulator/a.jpg', base64: 'A'.repeat(5000), simulated: true } };
  const stored = encodeDraft(draft);
  assert.deepEqual(stored.photo, { uri: 'file:///cache/ImageManipulator/a.jpg', simulated: true });
  assert.ok(!JSON.stringify(stored).includes('AAAA'));
  let raw = writeDraft(null, 'k-aaaa', draft);
  raw = writeDraft(raw, 'k-bbbb', { ...emptyDraft, text: '另一个账号' });
  assert.deepEqual(readDraft(raw, 'k-aaaa'), { ...draft, photo: { ...draft.photo, base64: '' } });
  assert.equal(readDraft(raw, 'k-bbbb').text, '另一个账号');
  assert.deepEqual(readDraft(raw, 'k-cccc'), emptyDraft);
  assert.deepEqual(readDraft(raw, ''), emptyDraft);                         // signed out: nothing restored
  raw = writeDraft(raw, 'k-aaaa', emptyDraft);                              // cleared after a successful post
  assert.deepEqual(readDraft(raw, 'k-aaaa'), emptyDraft);
  assert.equal(readDraft(raw, 'k-bbbb').text, '另一个账号');
  assert.deepEqual(readDraft('{broken', 'k-aaaa'), emptyDraft);
  assert.deepEqual(decodeDraft({ text: 7, name: 'x'.repeat(99), photo: { uri: 'javascript:alert(1)' }, sceneId: '', requestId: 3 }),
    { ...emptyDraft, name: 'x'.repeat(NAME_MAX) });
});

test('p8 #7: a suggested place name is cut at a word / segment boundary, never mid-word or on a dangling connector', () => {
  const uibe = 'University of International Business and Economics';
  assert.equal(shortenName(uibe, 40), 'University of International Business');
  assert.equal(shortenName('Library West Gate, Wutong Tree Avenue, Chaoyang District', 40), 'Library West Gate, Wutong Tree Avenue');
  assert.equal(shortenName('  图书馆西门  ', 40), '图书馆西门');
  const cjk = '对外经济贸易大学·图书馆西门外那棵很大的梧桐树下面那张长椅旁边的小路口东侧';
  assert.equal(shortenName(cjk, 30), '对外经济贸易大学·图书馆西门外那棵很大的梧桐树下面那张长椅旁边'.slice(0, 30));
  assert.equal(shortenName('惠新东街·对外经济贸易大学图书馆西门梧桐树下的长椅', 20), '惠新东街·对外经济贸易大学图书馆西门梧桐'); // separator too early: per character
  assert.equal(shortenName('对外经济贸易大学图书馆·西门梧桐树下的长椅旁边', 16), '对外经济贸易大学图书馆');
  assert.equal(shortenName('Supercalifragilisticexpialidocious', 10), 'Supercalif');  // one long word: hard cut
  for (const name of [uibe, cjk]) assert.ok(Array.from(shortenName(name, 40)).length <= 40);
});

test('p8 #6: the place screen tracks GPS from the first frame for non-participants, never for (known) participants', () => {
  const base = { updateRequested: false, participated: null, knownParticipant: false, errorCode: null };
  assert.equal(placeWantsTracking(base), true, 'still loading: start tracking at once');
  assert.equal(placeWantsTracking({ ...base, knownParticipant: true }), false);
  assert.equal(placeWantsTracking({ ...base, errorCode: 'POST_MISSING' }), false);
  assert.equal(placeWantsTracking({ ...base, errorCode: 'STALE_LOCATION' }), true);
  assert.equal(placeWantsTracking({ ...base, participated: false, knownParticipant: true }), true, 'loaded thread wins');
  assert.equal(placeWantsTracking({ ...base, participated: true }), false);
  assert.equal(placeWantsTracking({ ...base, participated: true, updateRequested: true }), true, '我在现场，更新位置');
});
