import { describe, expect, it } from 'vitest';
import { createFakeClock, createFixedClock, systemClock, type Clock } from './index.js';

// Public API (AC2):
//   interface Clock { now(): Date }
//   const systemClock: Clock                       — the only reader of Date.now() in the repo
//   createFixedClock(at: Date): Clock              — always returns `at`
//   createFakeClock(start: Date): FakeClock        — FakeClock extends Clock with
//     advance(ms: number): void and set(at: Date): void; time moves only when told.

describe('Clock', () => {
  it('systemClock returns the current wall-clock time', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('fixed clock always returns the same instant', () => {
    const at = new Date('2026-01-02T03:04:05.678Z');
    const clock: Clock = createFixedClock(at);
    expect(clock.now().toISOString()).toBe('2026-01-02T03:04:05.678Z');
    expect(clock.now().getTime()).toBe(at.getTime());
  });

  it('fake clock does not advance on its own', () => {
    const clock = createFakeClock(new Date('2026-01-01T00:00:00.000Z'));
    const a = clock.now().getTime();
    const b = clock.now().getTime();
    expect(b).toBe(a);
    expect(a).toBe(Date.UTC(2026, 0, 1));
  });

  it('fake clock advances by exactly the given milliseconds', () => {
    const clock = createFakeClock(new Date('2026-01-01T00:00:00.000Z'));
    clock.advance(1500);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:01.500Z');
    clock.advance(86_400_000);
    expect(clock.now().toISOString()).toBe('2026-01-02T00:00:01.500Z');
  });

  it('fake clock can be set to an instant', () => {
    const clock = createFakeClock(new Date('2026-01-01T00:00:00.000Z'));
    clock.set(new Date('2030-06-15T12:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2030-06-15T12:00:00.000Z');
  });

  it('returned dates are copies, so callers cannot move the clock', () => {
    const clock = createFakeClock(new Date('2026-01-01T00:00:00.000Z'));
    clock.now().setTime(0);
    const fixed = createFixedClock(new Date('2026-01-01T00:00:00.000Z'));
    fixed.now().setTime(0);
    expect(clock.now().getTime()).toBe(Date.UTC(2026, 0, 1));
    expect(fixed.now().getTime()).toBe(Date.UTC(2026, 0, 1));
  });
});
