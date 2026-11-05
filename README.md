# process-uptime-formatter

Formats a Node.js process uptime (or any millisecond duration) as a compact, human-readable string with a configurable unit and precision.

```js
import { formatUptimeFromProcess, UptimeFormatter } from 'process-uptime-formatter';

// One-shot: read process.uptime() and print e.g. "1h 1m".
console.log(formatUptimeFromProcess({ unit: 's', precision: 2 }));

// Reusable formatter with an injected clock (useful in tests).
const formatter = new UptimeFormatter({
  clock: () => 3661, // seconds
  unit: 's',
  precision: 3,
});
console.log(formatter.format()); // "1h 1m 1s"
console.log(formatter.format({ precision: 1 })); // "1h"
```

## Why this exists

`process.uptime()` returns a float in seconds, and turning that into something a human can read usually means a pile of division and modulo. This library packages that conversion behind one call, with two knobs: the smallest unit you care about and how many terms to show. The trade-off is that the output is deliberately terse (`1h 30m`, not `1 hour and 30 minutes`). The unit letters are stable and machine-friendly so the same tokens can be parsed back with `parseDuration`.

## The awkward edge

Rounding happens at the precision unit, and a rounded remainder can overflow the unit above it. `formatUptime(59600, { unit: 's', precision: 2 })` returns `"1m"`, not `"0m 60s"`. The carry is intentional, but it means the number of displayed terms can shrink after rounding. If you need a fixed number of terms, format at a coarser precision and pad yourself.

## API

- `formatUptime(ms, { unit = 's', precision = 1 })` — formats a millisecond duration. `unit` is one of `ms`, `s`, `m`, `h`, `d`; `precision` is the maximum number of terms to include.
- `formatUptimeFromProcess({ clock, ...options })` — reads `clock()` (defaults to `process.uptime()`, seconds) and formats it. The clock is injectable so tests do not depend on wall time.
- `parseDuration(text)` — parses strings like `1h30m` or `250ms` into milliseconds. Units must appear in descending order and at most once.
- `UptimeFormatter` — class holding a clock, a default unit, and a default precision. `format({ unit, precision })` applies per-call overrides.

All exported names are also re-exported from `src/index.js`.
