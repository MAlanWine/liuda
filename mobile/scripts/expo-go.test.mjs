// Merge of upstream da0ae2e: react-native-maps must stay out of every module Expo Go loads eagerly. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = sources(SRC).map(path => ({ path: relative(SRC, path), code: readFileSync(path, 'utf8') }));
const staticImport = (code, target) => new RegExp(`^import[^;]*from '[^']*${target}';`, 'm').test(code);

test('only the lazily required Apple map modules import react-native-maps', () => {
  const importers = files.filter(f => staticImport(f.code, 'react-native-maps')).map(f => f.path).sort();
  assert.deepEqual(importers, ['components/AppleRealPlaceMap.tsx', 'components/map/AppleDiscoverMap.tsx', 'components/map/CommaMarker.tsx']);
});

test('Apple map modules are reached only through the Expo Go guard', () => {
  for (const target of ['AppleRealPlaceMap', 'AppleDiscoverMap']) {
    assert.deepEqual(files.filter(f => staticImport(f.code, target)).map(f => f.path), [], `${target} imported statically`);
  }
  assert.deepEqual(files.filter(f => staticImport(f.code, 'CommaMarker')).map(f => f.path), ['components/map/AppleDiscoverMap.tsx']);
  for (const wrapper of ['components/RealPlaceMap.native.tsx', 'components/map/DiscoverMap.native.tsx']) {
    const code = files.find(f => f.path === wrapper).code;
    assert.match(code, /nativeMapsAvailable \? require\('\.\/Apple\w+'\)\.default : null/, wrapper);
  }
});

test('API routes import helpers that exist', () => {
  for (const f of files.filter(f => f.path.startsWith('app/api/'))) {
    assert.doesNotMatch(f.code, /location\/geo'/, `${f.path} imports the removed location/geo`);
  }
});
