import assert from 'node:assert/strict';
import test from 'node:test';
import { emit, on } from '../src/state/bus.ts';

test('bus delivers to topic listeners and stops after off', () => {
  const seen = [];
  const off = on('posts', topic => seen.push(topic));
  emit('posts', 'inbox');
  off();
  emit('posts');
  assert.deepEqual(seen, ['posts']);
});

test('bus dedupes topics in one emit and isolates broken listeners', () => {
  let calls = 0;
  const offBroken = on('thread:a', () => { throw new Error('boom'); });
  const offCount = on('thread:a', () => { calls += 1; });
  emit('thread:a', 'thread:a');
  offBroken(); offCount();
  assert.equal(calls, 1);
});

test('a listener removing itself during emit does not skip others', () => {
  const order = [];
  const offA = on('chats', () => { order.push('a'); offA(); });
  const offB = on('chats', () => order.push('b'));
  emit('chats');
  emit('chats');
  offB();
  assert.deepEqual(order, ['a', 'b', 'b']);
});
