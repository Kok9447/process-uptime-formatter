const UNIT_MS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

const UNIT_ORDER = ['d', 'h', 'm', 's', 'ms'];

/**
 * Round a non-negative millisecond value to the nearest whole unit.
 * We deliberately round half away from zero (Math.round semantics) so that
 * 1500 ms at second precision becomes 2 s rather than 1 s. This is the
 * behaviour most people expect from a duration formatter and keeps the
 * output monotonic as the input grows.
 */
function roundToUnit(ms, unit) {
  const factor = UNIT_MS[unit];
  return Math.round(ms / factor);
}

/**
 * Convert a rounded count of a unit back into milliseconds.
 * Used so that formatting remains stable when a lower unit rounds up into
 * a higher one (e.g. 59.6 s -> 60 s -> 1 m).
 */
function unitCountToMs(count, unit) {
  return count * UNIT_MS[unit];
}

function assertNonNegativeFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  if (value < 0) {
    throw new RangeError(`${name} must not be negative`);
  }
}

function assertUnit(unit, name) {
  if (!Object.prototype.hasOwnProperty.call(UNIT_MS, unit)) {
    throw new RangeError(`${name} must be one of ${Object.keys(UNIT_MS).join(', ')}`);
  }
}

/**
 * Format a duration in milliseconds as a human-readable string.
 *
 * The algorithm works from the most significant unit downwards. At each step
 * we take the whole number of that unit, then round the remainder to the
 * requested precision unit. If that rounding overflows the current unit we
 * carry into the previous term. This keeps the output exact for the chosen
 * precision without ever printing a fractional part.
 *
 * @param {number} ms duration in milliseconds, must be finite and >= 0
 * @param {object} [options]
 * @param {string} [options.unit='s'] smallest unit to display
 * @param {number} [options.precision=1] number of terms to include, >= 1
 * @returns {string}
 */
export function formatUptime(ms, options = {}) {
  assertNonNegativeFinite(ms, 'ms');

  const unit = options.unit === undefined ? 's' : options.unit;
  const precision = options.precision === undefined ? 1 : options.precision;

  assertUnit(unit, 'unit');
  if (!Number.isInteger(precision) || precision < 1) {
    throw new RangeError('precision must be an integer >= 1');
  }

  const startIndex = UNIT_ORDER.indexOf(unit);
  const usableUnits = UNIT_ORDER.slice(0, startIndex + 1);

  let remaining = ms;
  const parts = [];

  for (let i = 0; i < usableUnits.length; i += 1) {
    const currentUnit = usableUnits[i];
    const isLast = i === usableUnits.length - 1;

    if (isLast) {
      // The final unit absorbs whatever is left, rounded to its own scale.
      const count = roundToUnit(remaining, currentUnit);
      if (count > 0 || parts.length === 0) {
        parts.push([count, currentUnit]);
      }
      break;
    }

    const factor = UNIT_MS[currentUnit];
    let count = Math.floor(remaining / factor);
    let rest = remaining - count * factor;

    // Round the remainder to the next smaller unit and carry if it overflows.
    const nextUnit = usableUnits[i + 1];
    const roundedRest = roundToUnit(rest, nextUnit);
    if (unitCountToMs(roundedRest, nextUnit) >= factor) {
      count += 1;
      rest = 0;
    }

    if (count > 0) {
      parts.push([count, currentUnit]);
    }

    remaining -= count * factor;
    if (remaining < 0) {
      remaining = 0;
    }
  }

  // If the duration is zero we still emit a single zero term in the chosen unit.
  if (parts.length === 0) {
    parts.push([0, unit]);
  }

  const selected = parts.slice(0, precision);
  return selected.map(([count, u]) => `${count}${u}`).join(' ');
}

/**
 * Convenience wrapper that reads `process.uptime()` for you.
 * `process.uptime()` returns seconds as a float, so we scale to milliseconds
 * before delegating. The clock is injectable so tests never depend on wall time.
 *
 * @param {object} [options] passed through to formatUptime
 * @param {() => number} [options.clock] returns uptime in seconds
 * @returns {string}
 */
export function formatUptimeFromProcess(options = {}) {
  const clock = options.clock === undefined
    ? () => (typeof process !== 'undefined' && typeof process.uptime === 'function'
      ? process.uptime()
      : 0)
    : options.clock;

  if (typeof clock !== 'function') {
    throw new TypeError('clock must be a function');
  }

  const seconds = clock();
  assertNonNegativeFinite(seconds, 'clock result');

  return formatUptime(seconds * 1000, options);
}

/**
 * Parse a compact duration string such as "1h30m" or "250ms" into milliseconds.
 * We accept the same unit letters that formatUptime emits, which makes the
 * pair round-trippable for whole values. Units must appear in descending order
 * and each unit may appear at most once; this is a deliberate restriction that
 * keeps the parser small and unambiguous rather than trying to accept every
 * conceivable spelling.
 *
 * @param {string} input
 * @returns {number} milliseconds
 */
export function parseDuration(input) {
  if (typeof input !== 'string') {
    throw new TypeError('input must be a string');
  }
  const text = input.trim();
  if (text === '') {
    throw new RangeError('input must not be empty');
  }

  const pattern = /(\d+)(ms|s|m|h|d)/g;
  let total = 0;
  let lastIndex = 0;
  let lastUnitIndex = -1;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index !== lastIndex) {
      throw new RangeError(`unexpected characters in duration: ${text}`);
    }
    const value = Number(match[1]);
    const unit = match[2];
    const unitIndex = UNIT_ORDER.indexOf(unit);
    if (unitIndex === -1) {
      throw new RangeError(`unknown unit: ${unit}`);
    }
    if (unitIndex <= lastUnitIndex) {
      throw new RangeError(`units must appear in descending order: ${text}`);
    }
    lastUnitIndex = unitIndex;
    total += value * UNIT_MS[unit];
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex !== text.length) {
    throw new RangeError(`unexpected characters in duration: ${text}`);
  }

  return total;
}

/**
 * Class wrapper around the formatting helpers. The clock is injected at
 * construction time so callers can supply a deterministic source in tests.
 */
export class UptimeFormatter {
  /**
   * @param {object} [options]
   * @param {() => number} [options.clock] returns uptime in seconds
   * @param {string} [options.unit='s'] default smallest unit
   * @param {number} [options.precision=1] default number of terms
   */
  constructor(options = {}) {
    const clock = options.clock === undefined
      ? () => (typeof process !== 'undefined' && typeof process.uptime === 'function'
        ? process.uptime()
        : 0)
      : options.clock;
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function');
    }
    this.clock = clock;
    this.unit = options.unit === undefined ? 's' : options.unit;
    this.precision = options.precision === undefined ? 1 : options.precision;

    assertUnit(this.unit, 'unit');
    if (!Number.isInteger(this.precision) || this.precision < 1) {
      throw new RangeError('precision must be an integer >= 1');
    }
  }

  /**
   * Format the current uptime, optionally overriding unit or precision.
   * @param {object} [overrides]
   * @returns {string}
   */
  format(overrides = {}) {
    const seconds = this.clock();
    assertNonNegativeFinite(seconds, 'clock result');
    return formatUptime(seconds * 1000, {
      unit: overrides.unit === undefined ? this.unit : overrides.unit,
      precision: overrides.precision === undefined ? this.precision : overrides.precision,
    });
  }
}
