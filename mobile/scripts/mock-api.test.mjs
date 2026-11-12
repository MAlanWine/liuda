import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.ts';
import { ApiError } from '../src/api/errors.ts';
import { createMemoryKV } from '../src/api/mock/kv.ts';
import { createMockServer, createSimulatedTransport } from '../src/api/mock/server.ts';
import { CORRUPT_KEY_PREFIX, CORRUPT_NOTICE, DOC_KEY, PHOTO_KEY_PREFIX } from '../src/api/mock/db.ts';
import { LEGACY_PLACES_KEY } from '../src/api/mock/migrate.ts';
import { distanceMeters, offsetMeters } from '../src/domain/geo.ts';
import { newRequestId } from '../src/domain/ids.ts';
import { heat } from '../src/domain/heat.ts';

const O = { latitude: 39.9786, longitude: 116.4215 };

function setup({ initial, simulatedUsers = false } = {}) {
  const env = { now: Date.UTC(2026, 10, 12, 4, 0), tokens: {} };
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  env.kv = createMemoryKV(initial);
  env.server = createMockServer({ kv: env.kv, clock: () => env.now, random });
  env.as = (name) => createApiClient((a, p, t) => env.server.handle(a, p, t), () => env.tokens[name] ?? null);
  env.api = env.as('a');
  env.tick = (ms) => { env.now += ms; };
  env.rid = () => newRequestId(random, env.now);
  env.at = (east, north, accuracy = 5) => ({ ...offsetMeters(O, east, north), crs: 'wgs84', accuracy, timestamp: env.now, source: 'gps' });
  env.near = (p, metres = 0) => ({ ...offsetMeters(p, 0, -metres), crs: 'wgs84', accuracy: 5, timestamp: env.now, source: 'gps' });
  env.signIn = async (name, method, extra = {}) => {
    const s = await env.as(name).signIn({ method, ...extra });
    env.tokens[name] = s.token;
    return s;
  };
  env.start = async () => {
    await env.signIn('a', 'guest');
    if (!simulatedUsers) await env.api.demoUpdateSettings({ simulatedUsers: false });
    return env.api.nearby({ position: env.at(0, 0) });
  };
  env.ticket = async (api, purpose, position, postId) => (await api.presence({ purpose, postId, position })).ticket;
  env.publish = async (api, position, text = '这里的灯晚上很亮。', extra = {}) => {
    const ticket = await env.ticket(api, 'post', position);
    env.tick(5000);
    return api.post({ requestId: env.rid(), ticket, position: { ...position, timestamp: env.now }, text, name: '测试地点', ...extra });
  };
  env.reply = async (api, postId, position, text) => {
    const ticket = await env.ticket(api, 'comment', position, postId);
    env.tick(1000);
    return api.comment({ requestId: env.rid(), ticket, position: { ...position, timestamp: env.now }, postId, text });
  };
  return env;
}
const rejects = (promise, code) => assert.rejects(promise, (e) => e instanceof ApiError && e.code === code);
const seedPoint = (env, id) => env.server.peek().posts[id];

test('nearby: seeds around the first position; text never leaks below full; no internal ids', async () => {
  const env = setup();
  const { posts } = await env.start();
  const byId = Object.fromEntries(posts.map((p) => [p.id, p]));
  assert.deepEqual([byId['seed-corner'].level, byId['seed-bench'].level, byId['seed-door'].level], ['full', 'preview', 'dot']);
  for (const p of posts.filter((x) => x.level !== 'full')) {
    assert.deepEqual([p.text, p.author, p.hasPhoto], ['', null, false]);
    const raw = seedPoint(env, p.id);
    assert.ok(!JSON.stringify(p).includes(raw.text));
    if (p.level === 'dot') assert.deepEqual([p.teaser, p.clue, p.displayText], ['', '', '这里有人留过话，走近看看。']);
  }
  const json = JSON.stringify(posts);
  assert.ok(!/sim-|acct-|ownerId/.test(json));
  assert.equal(byId['seed-stand'].level, 'dot');
  assert.deepEqual([...new Set(posts.map((p) => heat(p, env.now).tier))].sort(), [1, 2, 3]);
  assert.equal(heat(byId['seed-stand'], env.now).label, '热门');
  await rejects(env.api.thread({ postId: 'seed-bench' }), 'LOCATION_REQUIRED');
  const far = await env.api.thread({ postId: 'seed-bench', position: env.at(0, 0) });
  assert.deepEqual([far.post.level, far.comments.length], ['preview', 0]);
});

test('anonymity: 路人 XXXX per thread (post author flagged isOriginalPoster -> 楼主 badge), own items carry isMe', async () => {
  const env = setup();
  await env.start();
  await env.reply(env.api, 'seed-corner', env.near(seedPoint(env, 'seed-corner'), 5), '上次在这里等朋友。'); // p8 #4: join first
  await env.api.updateProfile({ nickname: '我自己', avatar: null });
  const view = await env.api.thread({ postId: 'seed-corner' });
  assert.equal(view.post.participated, true);
  assert.match(view.post.author.nickname, /^路人 [0-9A-F]{4}$/);
  assert.deepEqual([view.post.author.isOriginalPoster, view.post.author.avatar, view.post.author.simulated], [true, null, true]);
  const other = view.comments.find((c) => !c.mine);
  assert.match(other.author.nickname, /^路人 [0-9A-F]{4}$/);
  const mine = view.comments.find((c) => c.mine);
  assert.deepEqual([mine.author.isMe, mine.author.nickname], [true, '我自己']);
});

test('presence tickets: single use, 30 s expiry, bound to purpose/post, write within 50 m', async () => {
  const env = setup();
  await env.start();
  const here = env.at(0, 0);
  const ticket = await env.ticket(env.api, 'post', here);
  await env.api.post({ requestId: env.rid(), ticket, position: here, text: '第一条', name: '地点' });
  await rejects(env.api.post({ requestId: env.rid(), ticket, position: here, text: '第二条', name: '地点' }), 'PRESENCE_EXPIRED');
  const late = await env.ticket(env.api, 'post', here);
  env.tick(31_000);
  await rejects(env.api.post({ requestId: env.rid(), ticket: late, position: env.at(0, 0), text: '迟到', name: '地点' }), 'PRESENCE_EXPIRED');
  const corner = env.near(seedPoint(env, 'seed-corner'));
  const likeTicket = await env.ticket(env.api, 'like', corner, 'seed-corner');
  await rejects(env.api.comment({ requestId: env.rid(), ticket: likeTicket, position: corner, postId: 'seed-corner', text: '错用' }), 'PRESENCE_EXPIRED');
  const moved = await env.ticket(env.api, 'post', env.at(0, 0));
  await rejects(env.api.post({ requestId: env.rid(), ticket: moved, position: env.at(70, 0), text: '走远了', name: '地点' }), 'NOT_ONSITE');
  await rejects(env.api.presence({ purpose: 'comment', postId: 'seed-bench', position: env.at(0, 0) }), 'NOT_ONSITE');
  await rejects(env.api.presence({ purpose: 'post', position: env.at(0, 0, 40) }), 'WEAK_LOCATION');
  await rejects(env.api.presence({ purpose: 'post', position: { ...env.at(0, 0), timestamp: env.now - 16_000 } }), 'STALE_LOCATION');
  await rejects(env.api.presence({ purpose: 'post', position: { ...env.at(0, 0), crs: 'gcj02' } }), 'INVALID_LOCATION');
});

test('idempotency: same requestId returns the stored receipt (even with the used ticket); changed body conflicts', async () => {
  const env = setup();
  await env.start();
  const corner = env.near(seedPoint(env, 'seed-corner'));
  const ticket = await env.ticket(env.api, 'comment', corner, 'seed-corner');
  const requestId = env.rid();
  const first = await env.api.comment({ requestId, ticket, position: corner, postId: 'seed-corner', text: '再来一句' });
  const count = seedPoint(env, 'seed-corner').commentCount;
  const again = await env.api.comment({ requestId, ticket, position: { ...corner, timestamp: env.now - 60_000 }, postId: 'seed-corner', text: '再来一句' });
  assert.deepEqual(again, first);
  assert.equal(seedPoint(env, 'seed-corner').commentCount, count);
  await rejects(env.api.comment({ requestId, ticket, position: corner, postId: 'seed-corner', text: '改了内容' }), 'REQUEST_CONFLICT');
  // comment + continueComment share one namespace
  const shared = await env.api.continueComment({ requestId, postId: 'seed-corner', text: '再来一句' });
  assert.deepEqual(shared, first);
  await rejects(env.api.continueComment({ requestId, postId: 'seed-corner', text: '别的话' }), 'REQUEST_CONFLICT');
});

test('flaky writes: commit then NETWORK; retry with the same requestId + ticket + position returns the same receipt', async () => {
  const env = setup();
  await env.start();
  await env.api.demoUpdateSettings({ flakyWrites: true, latencyMs: [0, 0] });
  let drop = true;
  const transport = createSimulatedTransport(env.server, { random: () => (drop ? 0.1 : 0.9), sleep: async () => {} });
  const flaky = createApiClient(transport, () => env.tokens.a);
  const here = env.at(0, 0);
  const ticket = await env.ticket(flaky, 'post', here);
  const req = { requestId: env.rid(), ticket, position: here, text: '网络抖了一下', name: '抖动' };
  await rejects(flaky.post(req), 'NETWORK');
  const mine = Object.values(env.server.peek().posts).filter((p) => p.text === '网络抖了一下');
  assert.equal(mine.length, 1);
  drop = false;
  env.tick(2000);
  const retry = await flaky.post(req);
  assert.equal(retry.id, mine[0].id);
  assert.equal(Object.values(env.server.peek().posts).filter((p) => p.text === '网络抖了一下').length, 1);
  // a like retried the same way
  const corner = env.near(seedPoint(env, 'seed-corner'));
  const likeTicket = await env.ticket(flaky, 'like', corner, 'seed-corner');
  const likeReq = { requestId: env.rid(), ticket: likeTicket, position: corner, postId: 'seed-corner', desired: true };
  drop = true;
  await rejects(flaky.like(likeReq), 'NETWORK');
  drop = false;
  const liked = await flaky.like(likeReq);
  assert.deepEqual([liked.liked, liked.likes], [true, 9]);
});

test('continueComment needs a thread row; on-site reply grants it, then works off site', async () => {
  const env = setup();
  await env.start();
  await rejects(env.api.continueComment({ requestId: env.rid(), postId: 'seed-bench', text: '远程接话' }), 'PARTICIPATION_REQUIRED');
  const bench = env.near(seedPoint(env, 'seed-bench'), 10);
  const receipt = await env.reply(env.api, 'seed-bench', bench, '我也坐过');
  assert.equal(receipt.participated, true);
  const off = await env.api.continueComment({ requestId: env.rid(), postId: 'seed-bench', text: '离开后接着聊' });
  const view = await env.api.thread({ postId: 'seed-bench' });
  assert.equal(view.post.level, 'full');
  assert.equal(view.comments.find((c) => c.id === off.id).entry, 'continuation');
  const conv = await env.api.conversations({});
  assert.ok(conv.threads.some((t) => t.id === 'seed-bench' && !t.owned));
});

test('caps: 50 own active posts, 100 replies per thread', async () => {
  const env = setup();
  await env.start();
  let first;
  for (let i = 0; i < 50; i++) { const r = await env.publish(env.api, env.at(0, 0), '第' + (i + 1) + '条'); first ??= r; }
  await rejects(env.publish(env.api, env.at(0, 0), '第51条'), 'POST_LIMIT');
  env.tick(60_000);
  await env.api.delete({ requestId: env.rid(), postId: first.id });
  await env.publish(env.api, env.at(0, 0), '删掉一条后可以再留');
  await env.signIn('b', 'apple');
  const b = env.as('b');
  await b.demoUpdateSettings({ simulatedUsers: false });
  const own = await env.publish(b, env.at(5, 5), 'B 的留话');
  for (let i = 0; i < 100; i++) { env.tick(5000); await b.continueComment({ requestId: env.rid(), postId: own.id, text: '回复' + i }); }
  env.tick(5000);
  await rejects(b.continueComment({ requestId: env.rid(), postId: own.id, text: '第101条' }), 'THREAD_FULL');
});

test('delete: author only, logical, then POST_MISSING everywhere; photo bytes removed', async () => {
  const env = setup();
  await env.start();
  const here = env.at(0, 0);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(60).fill(7)]).toString('base64');
  await rejects(env.api.uploadPhoto({ requestId: env.rid(), ticket: await env.ticket(env.api, 'photo', here), position: here,
    base64: Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(60).fill(1)]).toString('base64'), contentType: 'image/jpeg' }), 'PHOTO_FORMAT');
  const photo = await env.api.uploadPhoto({ requestId: env.rid(), ticket: await env.ticket(env.api, 'photo', here), position: here, base64: jpeg, contentType: 'image/jpeg' });
  const post = await env.publish(env.api, here, '带照片的留话', { photoId: photo.photoId });
  const view = await env.api.thread({ postId: post.id });
  assert.equal(view.post.hasPhoto, true);
  assert.equal((await env.api.photo({ postId: post.id })).dataUri, 'data:image/jpeg;base64,' + jpeg);
  await env.signIn('b', 'apple');
  await rejects(env.as('b').delete({ requestId: env.rid(), postId: post.id }), 'FORBIDDEN');
  await env.api.delete({ requestId: env.rid(), postId: post.id });
  await rejects(env.api.thread({ postId: post.id }), 'POST_MISSING');
  await rejects(env.api.photo({ postId: post.id }), 'POST_MISSING');
  assert.equal(env.kv.data.has(PHOTO_KEY_PREFIX + photo.photoId), false);
  assert.ok(!(await env.api.nearby({ position: here })).posts.some((p) => p.id === post.id));
  assert.ok(!(await env.api.mine({})).posts.some((p) => p.id === post.id));
});

test('report hides the target for the reporter; block filters the author and cancels pending chats', async () => {
  const env = setup();
  await env.start();
  const r = await env.api.report({ requestId: env.rid(), target: { kind: 'post', postId: 'seed-bench' }, reason: 'spam' });
  assert.equal(r.hidden, true);
  assert.ok(!(await env.api.nearby({ position: env.at(0, 0) })).posts.some((p) => p.id === 'seed-bench'));
  await rejects(env.api.thread({ postId: 'seed-bench' }), 'POST_MISSING');
  await env.reply(env.api, 'seed-corner', env.near(seedPoint(env, 'seed-corner'), 5), '上次在这里等朋友。'); // p8 #4: join first
  const before = await env.api.thread({ postId: 'seed-corner' });
  const ashu = before.comments.find((c) => !c.mine);
  await env.api.report({ requestId: env.rid(), target: { kind: 'comment', postId: 'seed-corner', commentId: ashu.id }, reason: 'abuse' });
  assert.ok(!(await env.api.thread({ postId: 'seed-corner' })).comments.some((c) => c.id === ashu.id));
  // block the author of seed-stairs-tip (same simulated person who wrote that comment)
  await env.api.block({ requestId: env.rid(), target: { kind: 'post', postId: 'seed-stairs-tip' }, position: env.at(0, 0) });
  const { blocks } = await env.api.blocks({});
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].label, '在「拐角的第三级台阶」遇到的人');
  assert.ok(!/sim-/.test(JSON.stringify(blocks)));
  const ids = (await env.api.nearby({ position: env.at(0, 0) })).posts.map((p) => p.id);
  assert.ok(!ids.includes('seed-stairs-tip') && !ids.includes('seed-door'));
  await env.api.unblock({ blockId: blocks[0].id });
  assert.ok((await env.api.nearby({ position: env.at(0, 0) })).posts.some((p) => p.id === 'seed-door'));
  await rejects(env.api.block({ requestId: env.rid(), target: { kind: 'comment', postId: 'seed-corner', commentId: before.comments.find((c) => c.mine).id } }), 'FORBIDDEN');
});

test('private chat: request -> accept consumes a credit -> messages -> destroy is terminal', async () => {
  const env = setup();
  await env.start();
  const spot = env.at(10, 10);
  const post = await env.publish(env.api, spot, '有人想聊聊这里吗？');
  await env.signIn('b', 'apple');
  const b = env.as('b');
  const ask = async (greeting = '你好，我也在这里') => {
    const ticket = await env.ticket(b, 'chat', env.near(spot, 5), post.id);
    return b.requestChat({ requestId: env.rid(), ticket, position: env.near(spot, 5), postId: post.id, greeting });
  };
  const chat = await ask();
  assert.deepEqual([chat.state, chat.role, chat.peer.isOriginalPoster], ['pending', 'requester', true]);
  assert.match(chat.peer.nickname, /^路人 [0-9A-F]{4}$/);
  await rejects(ask('再申请一次'), 'CHAT_STATE');
  const authorSide = (await env.api.chats({})).chats[0];
  assert.match(authorSide.peer.nickname, /^路人 [0-9A-F]{4}$/);
  assert.equal(authorSide.role, 'author');
  await rejects(b.respondChat({ requestId: env.rid(), chatId: chat.id, accept: true }), 'FORBIDDEN');
  const active = await env.api.respondChat({ requestId: env.rid(), chatId: chat.id, accept: true });
  assert.equal(active.state, 'active');
  assert.equal((await b.entitlements({})).chatCredits, 2);
  await b.sendChat({ requestId: env.rid(), chatId: chat.id, text: '你常来吗？' });
  env.tick(1000);
  await env.api.sendChat({ requestId: env.rid(), chatId: chat.id, text: '下午常来。' });
  assert.deepEqual((await b.chat({ chatId: chat.id })).messages.map((m) => m.mine), [true, false]);
  const gone = await b.destroyChat({ requestId: env.rid(), chatId: chat.id });
  assert.equal(gone.state, 'destroyed');
  assert.deepEqual((await env.api.chat({ chatId: chat.id })).messages, []);
  assert.equal(Object.values(env.server.peek().chatMessages).filter((m) => m.chatId === chat.id).length, 0);
  await rejects(env.api.sendChat({ requestId: env.rid(), chatId: chat.id, text: '还在吗' }), 'CHAT_STATE');
  await rejects(env.api.destroyChat({ requestId: env.rid(), chatId: chat.id }), 'CHAT_STATE');
  // decline, cancel, and no credits
  const second = await ask('第二次');
  assert.equal((await env.api.respondChat({ requestId: env.rid(), chatId: second.id, accept: false })).state, 'declined');
  const third = await ask('第三次');
  await rejects(env.api.cancelChat({ requestId: env.rid(), chatId: third.id }), 'FORBIDDEN');
  assert.equal((await b.cancelChat({ requestId: env.rid(), chatId: third.id })).state, 'cancelled');
  const fourth = await ask('第四次');
  env.server.peek().credits[Object.values(env.server.peek().sessions).find((s) => s.token === env.tokens.b).accountId] = 0;
  await rejects(env.api.respondChat({ requestId: env.rid(), chatId: fourth.id, accept: true }), 'NO_ENTITLEMENT');
  assert.equal((await b.chat({ chatId: fourth.id })).chat.state, 'pending');
  await env.api.block({ requestId: env.rid(), target: { kind: 'chat', chatId: fourth.id } });
  assert.equal((await b.chat({ chatId: fourth.id })).chat.state, 'cancelled');
  await b.demoGrantCredits({});
  await rejects(ask('被屏蔽后'), 'BLOCKED');
});

test('simulation: jobs fire lazily via runDue on later calls', async () => {
  const env = setup({ simulatedUsers: true });
  await env.start();
  const post = await env.publish(env.api, env.at(0, 0), '模拟的人会来接话吗？');
  assert.equal((await env.api.inbox({})).events.length, 0);
  env.tick(21_000);
  const inbox = await env.api.inbox({});
  assert.ok(inbox.events.some((e) => e.postId === post.id));
  const view = await env.api.thread({ postId: post.id });
  assert.equal(view.comments.length, 1);
  assert.equal(view.comments[0].author.simulated, true);
  env.tick(30_000);
  assert.equal((await env.api.thread({ postId: post.id })).post.likes, 1);
  env.tick(2 * 60_000);
  const chats = (await env.api.chats({})).chats;
  assert.equal(chats.length, 1);
  assert.deepEqual([chats[0].state, chats[0].role, chats[0].peer.simulated], ['pending', 'author', true]);
  // ask a simulated author: auto-accept after 8 s, greeting after 12 s
  const bench = env.near(seedPoint(env, 'seed-bench'), 5);
  const ticket = await env.ticket(env.api, 'chat', bench, 'seed-bench');
  const mine = await env.api.requestChat({ requestId: env.rid(), ticket, position: bench, postId: 'seed-bench', greeting: '你好' });
  env.tick(13_000);
  const opened = await env.api.chat({ chatId: mine.id });
  assert.equal(opened.chat.state, 'active');
  assert.equal(opened.messages.length, 1);
  assert.equal((await env.api.entitlements({})).chatCredits, 2);
  await env.api.sendChat({ requestId: env.rid(), chatId: mine.id, text: '下午三点见' });
  env.tick(11_000);
  assert.equal((await env.api.chat({ chatId: mine.id })).messages.length, 3);
});

test('persistence: corrupt or newer docs are backed up, never silently overwritten', async () => {
  for (const raw of ['{oops', JSON.stringify({ schema: 99, posts: {} })]) {
    const env = setup({ initial: { [DOC_KEY]: raw } });
    await env.signIn('a', 'guest');
    const backups = [...env.kv.data.keys()].filter((k) => k.startsWith(CORRUPT_KEY_PREFIX));
    assert.equal(backups.length, 1);
    assert.equal(env.kv.data.get(backups[0]), raw);
    assert.equal(env.server.notice(), CORRUPT_NOTICE);
    assert.equal(env.server.notice(), '');
    assert.equal(JSON.parse(env.kv.data.get(DOC_KEY)).schema, 1);
  }
  // a valid doc survives a restart with user rows intact (no reseeding over them)
  const env = setup();
  await env.start();
  const post = await env.publish(env.api, env.at(0, 0), '重启后还在');
  const again = createMockServer({ kv: env.kv, clock: () => env.now });
  const api = createApiClient((a, p, t) => again.handle(a, p, t), () => env.tokens.a);
  assert.ok((await api.mine({})).posts.some((p) => p.id === post.id));
  assert.equal(Object.values(again.peek().posts).filter((p) => p.seed).length, 8);
  assert.equal(again.notice(), '');
});

test('legacy import: owned point places -> my posts, my replies kept once, saved -> bookmarks; old key untouched', async () => {
  const legacy = JSON.stringify({
    arrived: [], saved: ['bench', 'local-1762900000000-abc'],
    places: [
      { id: 'local-1762900000000-abc', name: '旧的留话', location: '旧线索', distance: 0, point: offsetMeters(O, 5, 5), teaser: 'x', text: '升级前留下的话。',
        mood: 'blue', likes: 0, liked: false, participated: true, owned: true, replies: [{ id: '1762900100000-0.5', text: '自己补一句', mine: true }] },
      { id: 'local-1762900200000-def', name: '没有坐标', location: '', distance: 0, teaser: 'x', text: '不会被导入', mood: 'sage', likes: 0,
        liked: false, participated: true, owned: true, replies: [] },
      { id: 'corner', name: '风吹得到的角落', location: '', distance: 35, teaser: '', text: '', mood: 'blue', likes: 8, liked: false, participated: true, owned: false,
        replies: [{ id: 'corner-1', text: '上次在这里等朋友。现在离开了，还是想接着聊。', mine: true }] },
      { id: 'stairs', name: '拐角的第三级台阶', location: '', distance: 140, teaser: '', text: '', mood: 'sand', likes: 12, liked: false, participated: true, owned: false,
        replies: [{ id: '1762900300000-0.1', text: '台阶我也滑过', mine: true }] },
    ],
  });
  const env = setup({ initial: { [LEGACY_PLACES_KEY]: legacy } });
  await env.start();
  const mine = (await env.api.mine({})).posts;
  assert.deepEqual(mine.map((p) => [p.name, p.createdAt, p.commentCount]), [['旧的留话', 1762900000000, 1]]);
  const corner = await env.api.thread({ postId: 'seed-corner' });
  assert.equal(corner.comments.filter((c) => c.mine).length, 1);
  const stairs = await env.api.thread({ postId: 'seed-stairs' });
  assert.equal(stairs.post.participated, true);
  assert.ok(stairs.comments.some((c) => c.mine && c.text === '台阶我也滑过'));
  assert.equal(stairs.post.commentCount, 2);
  const saved = (await env.api.bookmarks({})).posts.map((p) => p.id).sort();
  assert.deepEqual(saved, [mine[0].id, 'seed-bench'].sort());
  assert.equal(env.kv.data.get(LEGACY_PLACES_KEY), legacy);
  assert.deepEqual(env.server.peek().migratedFrom, [LEGACY_PLACES_KEY]);
});

test('demoReanchor moves seed rows only, keeping their layout', async () => {
  const env = setup();
  await env.start();
  const mine = await env.publish(env.api, env.at(3, 3), '我的不会被移动');
  const minePoint = { ...env.server.peek().posts[mine.id] };
  const gap = distanceMeters(seedPoint(env, 'seed-bench'), seedPoint(env, 'seed-stand'));
  const center = offsetMeters(O, 1000, 500);
  const s = await env.api.demoReanchor({ center });
  assert.deepEqual(s.anchor, center);
  assert.ok(distanceMeters(seedPoint(env, 'seed-corner'), offsetMeters(center, 0, 30)) < 0.5);
  assert.ok(Math.abs(distanceMeters(seedPoint(env, 'seed-bench'), seedPoint(env, 'seed-stand')) - gap) < 0.5);
  const after = env.server.peek().posts[mine.id];
  assert.deepEqual([after.latitude, after.longitude], [minePoint.latitude, minePoint.longitude]);
});

test('accounts: guest converts to WeChat with data kept; guest again is a new device account; membership gate', async () => {
  const env = setup();
  await env.start();
  const post = await env.publish(env.api, env.at(0, 0), '游客时留下');
  const wx = await env.signIn('a', 'wechat');
  assert.equal(wx.method, 'wechat');
  assert.ok((await env.api.mine({})).posts.some((p) => p.id === post.id));
  assert.equal((await env.api.demoAccounts({})).accounts.find((a) => a.current).method, 'wechat');
  await env.signIn('a', 'guest');
  assert.equal((await env.api.mine({})).posts.length, 0);
  await env.signIn('a', 'wechat');
  assert.equal((await env.api.mine({})).posts.length, 1);
  const account = Object.values(env.server.peek().accounts).find((a) => a.method === 'wechat');
  account.member = false;
  assert.equal((await env.api.status({})).member, false);
  await rejects(env.api.nearby({ position: env.at(0, 0) }), 'INVITE_REQUIRED');
  await rejects(env.api.join({ inviteCode: 'nope' }), 'INVITE_INVALID');
  assert.deepEqual(await env.api.join({ inviteCode: 'LIUDA-DEMO' }), { joined: true, protocol: 2 });
  await env.api.nearby({ position: env.at(0, 0) });
  await env.api.signOut({});
  await rejects(env.api.me({}), 'AUTH_REQUIRED');
  const raw = await env.server.handle('noSuchAction', {}, null);
  assert.deepEqual([raw.ok, raw.error.code], [false, 'INVALID_ACTION']);
});

test('first guest sign-in seeds the profile from the legacy local profile once; moderation and text caps apply', async () => {
  const env = setup();
  await env.signIn('a', 'guest', { profile: { nickname: '晚风🌙', avatar: null } });
  assert.equal((await env.api.me({})).profile.nickname, '晚风🌙');
  await env.signIn('a', 'guest', { profile: { nickname: '不该覆盖', avatar: null } });
  assert.equal((await env.api.me({})).profile.nickname, '晚风🌙');
  await env.api.demoUpdateSettings({ simulatedUsers: false });
  await env.api.nearby({ position: env.at(0, 0) });
  await rejects(env.publish(env.api, env.at(0, 0), '加微信聊'), 'CONTENT_REJECTED');
  await rejects(env.publish(env.api, env.at(0, 0), '电话13812345678'), 'CONTENT_REJECTED');
  await rejects(env.publish(env.api, env.at(0, 0), '字'.repeat(301)), 'INVALID_INPUT');
  const ok = await env.publish(env.api, env.at(0, 0), '🌙'.repeat(300));
  assert.ok(ok.id);
});
