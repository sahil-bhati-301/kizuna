import type { Clock } from './clock.js';

/**
 * Base shape of a domain event. Concrete events are defined in packages/contracts.
 * `id` is a UUIDv7 and the dedup key for idempotent handlers.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly id: string;
  readonly type: TType;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

export interface EventDeps {
  newId: () => string;
  clock: Clock;
}

/** Stamps a new event with an ID from `newId` and the time from `clock`. */
export function createEvent<TType extends string, TPayload>(
  deps: EventDeps,
  type: TType,
  payload: TPayload,
): DomainEvent<TType, TPayload> {
  return { id: deps.newId(), type, occurredAt: deps.clock.now(), payload };
}
