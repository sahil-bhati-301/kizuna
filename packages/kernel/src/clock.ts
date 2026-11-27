import type { Clock } from './domain/clock.js';

/** The wall clock. This file is the only place in the repo that reads the wall clock. */
export const systemClock: Clock = {
  now: () => new Date(Date.now()),
};
