import { describe, expect, it } from 'vitest';
import { isEnded, isLive, isSessionEnded } from '../src/lib/eventRanking';

const now = Date.parse('2026-11-12T12:00:00.000Z');
const later = new Date(now + 3 * 3600_000).toISOString();
const sooner = new Date(now + 30 * 60_000).toISOString();
const earlier = new Date(now - 3 * 3600_000).toISOString();

describe('event lifecycle', () => {
  it('does not end a scheduled event just because a room closed early', () => {
    const event = {
      id: 'e1',
      status: 'ended' as const,
      startDate: later,
      endDate: later,
      endedAt: new Date(now - 60_000).toISOString(),
      lastStartedAt: new Date(now - 30 * 60_000).toISOString(),
    };
    expect(isEnded(event, now)).toBe(false);
    expect(isLive(event, now)).toBe(false);
    expect(isSessionEnded(event)).toBe(true);
  });

  it('ends an event once its scheduled end passes', () => {
    expect(isEnded({ id: 'e1', status: 'upcoming', startDate: earlier, endDate: earlier }, now)).toBe(true);
  });

  it('falls back to the stored status when there is no usable schedule', () => {
    expect(isEnded({ id: 'e1', status: 'ended' }, now)).toBe(true);
    expect(isEnded({ id: 'e1', status: 'upcoming' }, now)).toBe(false);
  });

  it('keeps an early-started room live before its start date', () => {
    const event = { id: 'e1', status: 'live' as const, startDate: later, endDate: later };
    expect(isLive(event, now)).toBe(true);
  });

  it('is live inside the scheduled window', () => {
    const event = { id: 'e1', status: 'upcoming' as const, startDate: earlier, endDate: later };
    expect(isLive(event, now)).toBe(true);
  });

  it('stops showing live once the host closes the room', () => {
    const event = {
      id: 'e1',
      status: 'upcoming' as const,
      startDate: earlier,
      endDate: later,
      lastStartedAt: new Date(now - 30 * 60_000).toISOString(),
      endedAt: new Date(now - 5 * 60_000).toISOString(),
    };
    expect(isLive(event, now)).toBe(false);
    expect(isSessionEnded(event)).toBe(true);
  });

  it('revives the room when the host restarts after closing it', () => {
    const event = {
      id: 'e1',
      status: 'live' as const,
      startDate: sooner,
      endDate: later,
      lastStartedAt: new Date(now - 60_000).toISOString(),
      endedAt: new Date(now - 10 * 60_000).toISOString(),
    };
    expect(isSessionEnded(event)).toBe(false);
    expect(isLive(event, now)).toBe(true);
  });

  it('treats an instant room ended at its end date as over', () => {
    const event = {
      id: 'e1',
      type: 'instant',
      status: 'ended' as const,
      startDate: earlier,
      endDate: new Date(now - 60_000).toISOString(),
    };
    expect(isEnded(event, now)).toBe(true);
    expect(isLive(event, now)).toBe(false);
  });
});
