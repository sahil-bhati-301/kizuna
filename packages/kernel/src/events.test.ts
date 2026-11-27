import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createEvent,
  createFakeClock,
  createIdGenerator,
  createSeededRng,
  isUuidV7,
  type DomainEvent,
} from './index.js';

// Public API (AC4): base event types only; concrete events live in packages/contracts.
//   interface DomainEvent<TType extends string = string, TPayload = unknown> {
//     readonly id: string;          // UUIDv7, the dedup key for idempotent handlers
//     readonly type: TType;
//     readonly occurredAt: Date;
//     readonly payload: TPayload;
//   }
//   createEvent<TType extends string, TPayload>(
//     deps: { newId: () => string; clock: Clock }, type: TType, payload: TPayload,
//   ): DomainEvent<TType, TPayload>

describe('base event types', () => {
  const clock = createFakeClock(new Date('2026-03-01T09:00:00.000Z'));
  const newId = createIdGenerator({ clock, rng: createSeededRng(3) });

  it('createEvent stamps a UUIDv7 id and the injected clock time', () => {
    const e = createEvent({ newId, clock }, 'ReviewRecorded', { traceId: 't1' });
    expect(isUuidV7(e.id)).toBe(true);
    expect(e.type).toBe('ReviewRecorded');
    expect(e.occurredAt.toISOString()).toBe('2026-03-01T09:00:00.000Z');
    expect(e.payload).toEqual({ traceId: 't1' });
  });

  it('each event gets a distinct id', () => {
    const a = createEvent({ newId, clock }, 'X', {});
    const b = createEvent({ newId, clock }, 'X', {});
    expect(a.id).not.toBe(b.id);
  });

  it('keeps the literal type and payload type', () => {
    const e = createEvent({ newId, clock }, 'SessionCompleted', { sessionId: 's1' });
    expectTypeOf(e).toEqualTypeOf<DomainEvent<'SessionCompleted', { sessionId: string }>>();
    expectTypeOf(e.id).toBeString();
    expectTypeOf(e.occurredAt).toEqualTypeOf<Date>();
  });
});
