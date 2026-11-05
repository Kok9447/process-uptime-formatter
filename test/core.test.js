import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatUptime,
  formatUptimeFromProcess,
  parseDuration,
  UptimeFormatter,
} from '../src/index.js';

test('formats sub-second durations with millisecond precision', () => {
  assert.equal(formatUptime(0, { unit: 'ms' }), '0ms');
  assert.equal(formatUptime(1, { unit: 'ms' }), '1ms');
  assert.equal(formatUptime(999, { unit: 'ms' }), '999ms');
});

test('rounds half away from zero at the chosen unit', () => {
  assert.equal(formatUptime(1499, { unit: 's' }), '1s');
  assert.equal(formatUptime(1500, { unit: 's' }), '2s');
  assert.equal(formatUptime(500, { unit: 's' }), '1s');
});

test('carries rounded remainders into higher units', () => {
  // 59.6 s should become 1m, not "0m 60s".
  assert.equal(formatUptime(59600, { unit: 's', precision: 2 }), '1m');
  // 3599.6 s should become 1h, not "59m 60s".
  assert.equal(formatUptime(3599600, { unit: 's', precision: 2 }), '1h');
});

test('respects precision by truncating lower terms', () => {
  const ms = 3661000; // 1h 1m 1s
  assert.equal(formatUptime(ms, { unit: 's', precision: 1 }), '1h');
  assert.equal(formatUptime(ms, { unit: 's', precision: 2 }), '1h 1m');
  assert.equal(formatUptime(ms, { unit: 's', precision: 3 }), '1h 1m 1s');
});

test('emits a zero term when the duration is zero', () => {
  assert.equal(formatUptime(0), '0s');
  assert.equal(formatUptime(0, { unit: 'm', precision: 3 }), '0m');
});

test('skips zero-valued intermediate units', () => {
  const ms = 3600000 + 1000; // 1h 1s
  assert.equal(formatUptime(ms, { unit: 's', precision: 3 }), '1h 1s');
});

test('rejects invalid inputs', () => {
  assert.throws(() => formatUptime(-1), RangeError);
  assert.throws(() => formatUptime(Number.NaN), TypeError);
  assert.throws(() => formatUptime(Number.POSITIVE_INFINITY), TypeError);
  assert.throws(() => formatUptime(1000, { unit: 'x' }), RangeError);
  assert.throws(() => formatUptime(1000, { precision: 0 }), RangeError);
  assert.throws(() => formatUptime(1000, { precision: 1.5 }), RangeError);
});

test('parses compact durations and round-trips whole values', () => {
  assert.equal(parseDuration('1h30m'), 5400000);
  assert.equal(parseDuration('250ms'), 250);
  assert.equal(parseDuration('2d'), 172800000);
  assert.equal(parseDuration('  1m  '), 60000);
  assert.equal(formatUptime(parseDuration('1h30m'), { unit: 'm', precision: 2 }), '1h 30m');
});

test('rejects malformed duration strings', () => {
  assert.throws(() => parseDuration(''), RangeError);
  assert.throws(() => parseDuration('abc'), RangeError);
  assert.throws(() => parseDuration('1x'), RangeError);
  assert.throws(() => parseDuration('1m1h'), RangeError);
  assert.throws(() => parseDuration('1h 30m'), RangeError);
  assert.throws(() => parseDuration(42), TypeError);
});

test('formatUptimeFromProcess uses the injected clock', () => {
  assert.equal(
    formatUptimeFromProcess({ clock: () => 90, unit: 's', precision: 2 }),
    '1m 30s',
  );
  assert.equal(
    formatUptimeFromProcess({ clock: () => 0, unit: 's' }),
    '0s',
  );
});

test('UptimeFormatter stores defaults and allows per-call overrides', () => {
  const formatter = new UptimeFormatter({ clock: () => 3661, unit: 's', precision: 3 });
  assert.equal(formatter.format(), '1h 1m 1s');
  assert.equal(formatter.format({ precision: 1 }), '1h');
  assert.equal(formatter.format({ unit: 'm', precision: 2 }), '1h 1m');
});

test('UptimeFormatter validates its configuration', () => {
  assert.throws(() => new UptimeFormatter({ unit: 'x' }), RangeError);
  assert.throws(() => new UptimeFormatter({ precision: 0 }), RangeError);
  assert.throws(() => new UptimeFormatter({ clock: 'nope' }), TypeError);
});
