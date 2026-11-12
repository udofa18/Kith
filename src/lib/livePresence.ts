/**
 * Host heartbeat timing for live rooms.
 *
 * The host writes a small presence document every `INTERVAL`, and anyone in the
 * room treats a heartbeat older than `STALE` as an abandoned room. The gap is
 * deliberately generous: mobile browsers throttle timers in the background, and
 * a false "host left" is worse than a delayed one.
 */
export const LIVE_HEARTBEAT_INTERVAL_MS = 20_000;
export const LIVE_HEARTBEAT_STALE_MS = 75_000;
