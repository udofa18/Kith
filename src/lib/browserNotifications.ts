/**
 * Browser notifications, used for calls so someone in another tab (or another app)
 * can get back to Kith. Service-worker notifications are preferred: they work while
 * the page is hidden and clicking one focuses the app. Browsers without support fall
 * back to a plain Notification; iOS Safari may need the site added to the home screen.
 */

export type BrowserNotificationOptions = {
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
  /** Opened if the app is not already running when the notification is clicked. */
  url?: string;
  requireInteraction?: boolean;
};

const SUPPORTS_NOTIFICATIONS = () => typeof window !== 'undefined' && 'Notification' in window;

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!registration) {
    registration = navigator.serviceWorker
      .register('/sw.js')
      .catch(() => null);
  }
  return registration;
}

export function browserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!SUPPORTS_NOTIFICATIONS()) return 'unsupported';
  return Notification.permission;
}

/** Asks once. Returns whether notifications are allowed afterwards. */
export async function requestBrowserNotifications(): Promise<boolean> {
  if (!SUPPORTS_NOTIFICATIONS()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function showBrowserNotification(options: BrowserNotificationOptions): Promise<boolean> {
  if (!SUPPORTS_NOTIFICATIONS() || Notification.permission !== 'granted') return false;

  const notificationOptions: NotificationOptions = {
    body: options.body,
    tag: options.tag,
    icon: options.icon || '/favicon-192.png',
    badge: '/favicon-192.png',
    requireInteraction: options.requireInteraction,
    data: { url: options.url || '/' },
  };

  const sw = await serviceWorkerRegistration();
  if (sw) {
    try {
      await sw.showNotification(options.title, notificationOptions);
      return true;
    } catch {
      /* fall through to the constructor */
    }
  }

  try {
    const notification = new Notification(options.title, notificationOptions);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** Removes a notification by tag, for example once its call has been answered or cancelled. */
export async function closeBrowserNotifications(tag: string): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const sw = await navigator.serviceWorker.getRegistration();
    const shown = await sw?.getNotifications({ tag });
    shown?.forEach(notification => notification.close());
  } catch {
    /* notifications are best-effort */
  }
}
