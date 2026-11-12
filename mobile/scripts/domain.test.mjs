import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, offsetMeters, pointToward, distanceLabel } from '../src/domain/geo.ts';
import { gate, level, isFresh, FULL_RADIUS, PREVIEW_RADIUS, MAX_AGE_MS } from '../src/domain/gate.ts';
import { heat } from '../src/domain/heat.ts';
import { rank } from '../src/domain/ranking.ts';
import { groupMarkers, project, zoomFromRegion } from '../src/domain/cluster.ts';
import { inMainlandChina, toMapCoordinate, wgs84ToGcj02 } from '../src/domain/crs.ts';
import { formatRelative } from '../src/domain/time.ts';
import { checkText, codePoints, teaserOf, validateText } from '../src/domain/text.ts';
import { hashString, isRequestId, newRequestId } from '../src/domain/ids.ts';
import { DOT_TEXT, EXPIRED_TEXT, expireSummary, summarize } from '../src/domain/tiers.ts';
import { ApiError } from '../src/api/errors.ts';

const O = { latitude: 39.9786, longitude: 116.4215 };
const NOW = 1_800_000_000_000;
const gps = (north, accuracy = 5, age = 0) => ({ ...offsetMeters(O, 0, north), crs: 'wgs84', accuracy, timestamp: NOW - age, source: 'gps' });
const sim = (north) => ({ ...offsetMeters(O, 0, north), crs: 'wgs84', accuracy: null, timestamp: 0, source: 'simulated' });
const code = (r) => (r.ok ? 'ok' : r.code);

test('geo: offsets, distance and walk-toward helpers agree', () => {
  assert.ok(Math.abs(distanceMeters(O, offsetMeters(O, 30, 40)) - 50) < 0.01);
  const target = offsetMeters(O, 0, 300);
  assert.ok(Math.abs(distanceMeters(pointToward(O, target, 120), target) - 120) < 0.01);
  assert.ok(distanceMeters(pointToward(O, target, 120), O) < 300);
  assert.equal(distanceLabel(1234), '1.2km');
  assert.equal(distanceLabel(86.4), '86m');
  assert.equal(distanceLabel(null), '已参与');
});

test('gate: GPS needs distance + accuracy ≤ 50 m', () => {
  assert.equal(code(gate(gps(19.9, 30), O, NOW)), 'ok');
  assert.equal(code(gate(gps(20.1, 30), O, NOW)), 'NOT_ONSITE');
  assert.equal(code(gate(gps(44.9, 5), O, NOW)), 'ok');
  assert.equal(code(gate(gps(45.1, 5), O, NOW)), 'NOT_ONSITE');
});

test('gate: GPS accuracy ≤ 30 m, age ≤ 15 s, no future fixes', () => {
  assert.equal(code(gate(gps(0, 30), O, NOW)), 'ok');
  assert.equal(code(gate(gps(0, 30.1), O, NOW)), 'WEAK_LOCATION');
  assert.equal(code(gate(gps(0, null), O, NOW)), 'WEAK_LOCATION');
  assert.equal(code(gate(gps(0, 5, MAX_AGE_MS), O, NOW)), 'ok');
  assert.equal(code(gate(gps(0, 5, MAX_AGE_MS + 1), O, NOW)), 'STALE_LOCATION');
  assert.equal(code(gate(gps(0, 5, -5001), O, NOW)), 'STALE_LOCATION');
  assert.equal(code(gate(null, O, NOW)), 'LOCATION_REQUIRED');
  assert.equal(code(gate({ ...gps(0), crs: 'gcj02' }, O, NOW)), 'INVALID_LOCATION');
});

test('gate: simulated bypasses age/accuracy but keeps the 50 m distance rule', () => {
  assert.equal(code(gate(sim(49.9), O, NOW)), 'ok');
  assert.equal(code(gate(sim(50.1), O, NOW)), 'NOT_ONSITE');
  assert.equal(isFresh(sim(0), NOW), true);
  assert.equal(isFresh(gps(0, 5, 16_000), NOW), false);
});

test('level: participant full, on site full, ≤200 m preview, else dot', () => {
  assert.equal(level(null, O, NOW, true), 'full');
  assert.equal(level(null, O, NOW, false), 'dot');
  assert.equal(level(gps(40, 5), O, NOW, false), 'full');
  assert.equal(level(gps(46, 5), O, NOW, false), 'preview');
  assert.equal(level(gps(PREVIEW_RADIUS - 0.1, 5), O, NOW, false), 'preview');
  assert.equal(level(gps(PREVIEW_RADIUS + 0.1, 5), O, NOW, false), 'dot');
  assert.equal(level(sim(FULL_RADIUS - 0.1), O, NOW, false), 'full');
  assert.equal(level(gps(10, 40), O, NOW, false), 'preview'); // weak fix never unlocks full
});

test('heat: (likes + 3 × repliers) × 0.5^(days/7), tiers <5 / 5–20 / ≥20', () => {
  const DAY = 86_400_000;
  const h = (likes, repliers, engagedDaysAgo, createdDaysAgo = engagedDaysAgo) =>
    heat({ likes, replyParticipantCount: repliers, lastEngagedAt: NOW - engagedDaysAgo * DAY, createdAt: NOW - createdDaysAgo * DAY }, NOW);
  assert.equal(h(2, 1, 0).score, 5);
  assert.deepEqual([h(2, 1, 0).tier, h(2, 1, 0).label], [2, '有回应']);
  assert.ok(Math.abs(h(2, 1, 7).score - 2.5) < 1e-9);
  assert.equal(h(2, 1, 7).tier, 1);
  assert.equal(h(4.9, 0, 0).tier, 1);
  assert.deepEqual([h(14, 2, 0).tier, h(14, 2, 0).label], [3, '热门']);
  assert.equal(h(19, 0, 0).tier, 2);
  assert.equal(h(0, 0, 0.5).fresh, true);
  assert.equal(h(0, 0, 1.01).fresh, false);
});

test('ranking: recommended reserves slot 1 and every 4th for fresh ordinary posts; latest by time', () => {
  const H = 3_600_000, DAY = 24 * H;
  const p = (id, likes, createdAgo) => ({ id, likes, replyParticipantCount: 0, lastEngagedAt: NOW - createdAgo, createdAt: NOW - createdAgo });
  const posts = [p('a', 30, 3 * DAY), p('b', 12, 3 * DAY), p('c', 8, 3 * DAY), p('d', 1, 5 * DAY), p('f1', 0, H), p('f2', 1, 2 * H), p('e', 6, 4 * DAY)];
  const rec = rank(posts, 'recommended', NOW).map((x) => x.id);
  assert.equal(rec[0], 'f1');
  assert.equal(rec[4], 'f2');
  assert.deepEqual(rec.slice(1, 4), ['a', 'b', 'c']);
  assert.equal(rec.length, posts.length);
  assert.deepEqual(rank(posts, 'latest', NOW).map((x) => x.id), ['f1', 'f2', 'a', 'b', 'c', 'e', 'd']);
});

test('clustering: same scene joins, 80×60 pt footprint, anchor is a real member', () => {
  const base = { likes: 0, replyParticipantCount: 0, lastEngagedAt: NOW, createdAt: NOW, name: 'x' };
  const zoom = 16;
  const pxPerLon = (256 * 2 ** zoom) / 360;
  const a = { ...base, ...O, id: 'a', sceneId: 's1' };
  const east = (px, id, sceneId = id) => ({ ...base, latitude: O.latitude, longitude: O.longitude + px / pxPerLon, id, sceneId });
  assert.equal(groupMarkers([a, east(79, 'b')], zoom, null, NOW).length, 1);
  assert.equal(groupMarkers([a, east(81, 'b')], zoom, null, NOW).length, 2);
  const yOf = (lat) => project({ latitude: lat, longitude: O.longitude }, zoom).y;
  const latFor = (px) => { let lo = O.latitude, hi = O.latitude + 0.01; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; (yOf(O.latitude) - yOf(mid) < px ? (lo = mid) : (hi = mid)); } return lo; };
  const north = (px, id) => ({ ...base, latitude: latFor(px), longitude: O.longitude, id, sceneId: id });
  assert.equal(groupMarkers([a, north(59, 'n')], zoom, null, NOW).length, 1);
  assert.equal(groupMarkers([a, north(61, 'n')], zoom, null, NOW).length, 2);
  const far = east(5000, 'far', 's1');
  const groups = groupMarkers([a, far, east(10000, 'z')], zoom, 'far', NOW);
  const joined = groups.find((g) => g.postIds.includes('a'));
  assert.deepEqual(joined.postIds.sort(), ['a', 'far']);
  assert.equal(joined.active, true);
  assert.ok([a, far].some((m) => m.latitude === joined.latitude && m.longitude === joined.longitude));
  const many = Array.from({ length: 10 }, (_, i) => ({ ...base, ...offsetMeters(O, i, 0), id: 'm' + i, sceneId: 'same' }));
  const [g] = groupMarkers(many, zoom, null, NOW);
  assert.deepEqual([g.count, g.countLabel, g.sceneCount, g.name], [10, '9+', 1, 'x']);
  assert.ok(Math.abs(zoomFromRegion({ longitudeDelta: 360 }, 256)) < 1e-9);
});

test('CRS: known Beijing sample, identity outside mainland China', () => {
  const g = wgs84ToGcj02({ latitude: 39.915, longitude: 116.404 });
  assert.ok(Math.abs(g.latitude - 39.91640428) < 1e-6 && Math.abs(g.longitude - 116.41024450) < 1e-6);
  assert.equal(inMainlandChina(O), true);
  for (const p of [{ latitude: 35.6812, longitude: 139.7671 }, { latitude: 25.033, longitude: 121.5654 }, { latitude: 22.3193, longitude: 114.1694 }, { latitude: 40.7128, longitude: -74.006 }]) {
    assert.equal(inMainlandChina(p), false);
    assert.deepEqual(toMapCoordinate(p), p);
  }
  assert.notDeepEqual(toMapCoordinate(O), O);
});

test('formatRelative: 刚刚 / 分钟前 / 小时前 / 昨天 / 月日', () => {
  const now = new Date(2026, 10, 12, 15, 0).getTime();
  assert.equal(formatRelative(now - 30_000, now), '刚刚');
  assert.equal(formatRelative(now + 3_000, now), '刚刚');
  assert.equal(formatRelative(now - 5 * 60_000, now), '5 分钟前');
  assert.equal(formatRelative(now - 3 * 3_600_000, now), '3 小时前');
  assert.equal(formatRelative(new Date(2026, 10, 11, 20, 0).getTime(), now), '昨天');
  assert.equal(formatRelative(new Date(2026, 10, 1, 9, 0).getTime(), now), '11月1日');
  assert.equal(formatRelative(new Date(2025, 11, 31, 9, 0).getTime(), now), '2025年12月31日');
  const early = new Date(2026, 10, 12, 0, 30).getTime();
  assert.equal(formatRelative(new Date(2026, 10, 11, 23, 50).getTime(), early), '40 分钟前');
  assert.equal(formatRelative(new Date(2026, 10, 11, 22, 0).getTime(), early), '昨天');
});

test('text caps count code points; teaser = 14 code points + ……', () => {
  assert.equal(codePoints('🌙'.repeat(300)), 300);
  assert.equal(checkText('🌙'.repeat(300), 300).ok, true);
  assert.equal(checkText('🌙'.repeat(301), 300).ok, false);
  assert.equal(checkText('   ', 300).ok, false);
  assert.equal(checkText(' 地点 ', 40).value, '地点');
  assert.throws(() => validateText('x'.repeat(41), 40, '地点名称'), (e) => e instanceof ApiError && e.code === 'INVALID_INPUT' && e.message === '地点名称长度不正确。');
  assert.equal(teaserOf('一二三四五六七八九十一二三四五六'), '一二三四五六七八九十一二三四……');
  assert.equal(teaserOf('短句'), '短句');
});

test('ids: request ids match the server pattern; hash is stable hex', () => {
  for (let i = 0; i < 50; i++) assert.ok(isRequestId(newRequestId()));
  assert.equal(isRequestId('short'), false);
  assert.match(hashString('a'), /^[0-9a-f]{16}$/);
  assert.equal(hashString('post:acct'), hashString('post:acct'));
  assert.notEqual(hashString('a'), hashString('b'));
});

test('tiers: summarize never leaks; expireSummary only tightens', () => {
  const post = { ...offsetMeters(O, 0, 100), id: 'p', sceneId: 's', name: '长椅', text: '全文', teaser: '预览', clue: '线索', hasPhoto: true,
    mood: 'sage', art: null, task: null, demo: true, commentCount: 0, likes: 0, replyParticipantCount: 0, lastEngagedAt: NOW, createdAt: NOW };
  const author = { nickname: '楼主', avatar: null, isMe: false, isOriginalPoster: true, simulated: true };
  const ctx = (position, participated = false) => ({ position, now: NOW, participated, liked: false, saved: false, owned: false, author });
  const preview = summarize(post, ctx(gps(0)));
  assert.deepEqual([preview.level, preview.text, preview.author, preview.hasPhoto, preview.displayText], ['preview', '', null, false, '预览']);
  const dot = summarize(post, ctx(gps(-200)));
  assert.deepEqual([dot.level, dot.teaser, dot.clue, dot.displayText], ['dot', '', '', DOT_TEXT]);
  const full = summarize(post, ctx(gps(95)));
  assert.deepEqual([full.level, full.text, full.accessMode, full.canLike, full.readExpiresAt], ['full', '全文', 'onsite', true, NOW + 12_000]);
  assert.equal(expireSummary(full, NOW + 1000, gps(0)).level, 'preview');
  assert.equal(expireSummary(full, NOW + 1000, gps(0)).text, '');
  assert.equal(expireSummary(full, NOW + 13_000).level, 'preview');
  assert.equal(expireSummary(preview, NOW, gps(-250)).level, 'dot');
  const member = summarize(post, ctx(null, true));
  assert.deepEqual([member.level, member.distance, member.canReply, member.readExpiresAt], ['full', null, true, NOW + 60_000]);
  assert.equal(expireSummary(member, NOW + 1000).distanceLabel, '可离场继续');
  const expired = expireSummary(member, NOW + 60_000);
  assert.deepEqual([expired.level, expired.text, expired.displayText, expired.canReply], ['dot', '', EXPIRED_TEXT, false]);
});
