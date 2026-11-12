import { describe, expect, it } from 'vitest';
import {
  isLiveInviteNotification,
  parseLiveSessionLink,
} from '../src/lib/liveSessionModal';

const ORIGIN = 'https://kith.example';

describe('parseLiveSessionLink', () => {
  it('reads the room id from a same-origin live link', () => {
    expect(parseLiveSessionLink(`${ORIGIN}/live/room-1`, ORIGIN)).toBe('room-1');
    expect(parseLiveSessionLink('/live/room-1?join=1', ORIGIN)).toBe('room-1');
    expect(parseLiveSessionLink('/live/room-1/', ORIGIN)).toBe('room-1');
  });

  it('accepts the legacy events live route', () => {
    expect(parseLiveSessionLink(`${ORIGIN}/events/room-2/live`, ORIGIN)).toBe('room-2');
  });

  it('leaves event pages, consoles and other sites alone', () => {
    expect(parseLiveSessionLink(`${ORIGIN}/events/room-2`, ORIGIN)).toBeNull();
    expect(parseLiveSessionLink(`${ORIGIN}/live/room-2/console`, ORIGIN)).toBeNull();
    expect(parseLiveSessionLink(`${ORIGIN}/live`, ORIGIN)).toBeNull();
    expect(parseLiveSessionLink('https://elsewhere.example/live/room-2', ORIGIN)).toBeNull();
    expect(parseLiveSessionLink('not a url', ORIGIN)).toBeNull();
  });
});

describe('isLiveInviteNotification', () => {
  it('trusts the explicit invite flag', () => {
    expect(
      isLiveInviteNotification({
        type: 'message',
        content: 'sent you a message',
        relatedId: 'room-1',
        liveInvite: true,
      }),
    ).toBe(true);
  });

  it('recognises older live invites by their wording', () => {
    expect(
      isLiveInviteNotification({
        type: 'event_invite',
        content: 'is live now: Friday hangout',
        relatedId: 'room-1',
      }),
    ).toBe(true);
    expect(
      isLiveInviteNotification({
        type: 'message',
        content: 'invited you to an instant session',
        relatedId: 'room-1',
      }),
    ).toBe(true);
  });

  it('does not treat scheduled events or ordinary notifications as live invites', () => {
    expect(
      isLiveInviteNotification({
        type: 'event_invite',
        content: 'invited you to an event',
        relatedId: 'event-1',
      }),
    ).toBe(false);
    expect(
      isLiveInviteNotification({
        type: 'message',
        content: 'sent you a message',
        relatedId: 'conversation-1',
      }),
    ).toBe(false);
    expect(
      isLiveInviteNotification({
        type: 'event_invite',
        content: 'is live now',
        relatedId: '',
      }),
    ).toBe(false);
  });
});
