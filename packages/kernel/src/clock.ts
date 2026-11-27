/** A source of the current instant. Inject it; never read the wall clock elsewhere. */
export interface Clock {
  /** Returns a fresh Date each call, so callers cannot move the clock by mutating it. */
  now(): Date;
}

/** A clock whose time moves only when a test tells it to. */
export interface FakeClock extends Clock {
  advance(ms: number): void;
  set(at: Date): void;
}

/** The wall clock. This file is the only place in the repo that reads Date.now(). */
export const systemClock: Clock = {
  now: () => new Date(Date.now()),
};

/** A clock that always returns `at`. */
export function createFixedClock(at: Date): Clock {
  const ms = at.getTime();
  return { now: () => new Date(ms) };
}

/** A clock that starts at `start` and moves only through advance() and set(). */
export function createFakeClock(start: Date): FakeClock {
  let ms = start.getTime();
  return {
    now: () => new Date(ms),
    advance: (delta) => {
      if (!Number.isFinite(delta))
        throw new RangeError(`advance() needs a finite number: ${delta}`);
      ms += delta;
    },
    set: (at) => {
      ms = at.getTime();
    },
  };
}
