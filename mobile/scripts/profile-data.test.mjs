import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeProfile, defaultProfile, normalizeProfile } from '../src/state/profile-data.ts';

test('new install has an editable default identity', () => {
  assert.deepEqual(decodeProfile(null), defaultProfile);
});
test('nickname normalization preserves virtual names and counts Unicode code points', () => {
  assert.equal(normalizeProfile({ nickname: '  晚风🌙  ', avatar: null }).nickname, '晚风🌙');
  assert.equal(normalizeProfile({ nickname: '🌙'.repeat(16), avatar: null }).nickname, '🌙'.repeat(16));
});
test('empty, multiline, and oversized names cannot be saved', () => {
  for (const nickname of ['   ', '留答\n路人', '夜'.repeat(17)]) assert.throws(() => normalizeProfile({ nickname, avatar: null }));
});
test('profile round trip retains a local JPEG and permits removing it', () => {
  const profile = normalizeProfile({ nickname: '晚风', avatar: 'data:image/jpeg;base64,/9j/AA==' });
  assert.deepEqual(decodeProfile(JSON.stringify(profile)), profile);
  assert.equal(normalizeProfile({ ...profile, avatar: null }).avatar, null);
});
test('corrupt records, foreign versions, and nonlocal images are rejected', () => {
  for (const raw of ['{', 'null', '{"version":2,"nickname":"晚风","avatar":null}', '{"version":1,"nickname":12,"avatar":null}']) assert.throws(() => decodeProfile(raw));
  for (const avatar of ['https://example.com/avatar.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/jpeg;base64,not valid!', 'data:image/jpeg;base64,' + 'A'.repeat(350001)]) assert.throws(() => normalizeProfile({ nickname: '晚风', avatar }));
});
