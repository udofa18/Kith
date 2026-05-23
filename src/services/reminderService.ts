import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, collectionGroup } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { toast } from 'react-hot-toast';

const CHECK_INTERVAL = 60000; // Check every minute
const SENT_REMINDERS_KEY = 'ais_sent_event_reminders';

interface SentReminders {
  [eventId: string]: {
    [threshold: string]: boolean;
  };
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ReminderService {
  private intervalId: any = null;
  private sentReminders: SentReminders = {};

  constructor() {
    this.loadSentReminders();
  }

  private loadSentReminders() {
    try {
      const stored = localStorage.getItem(SENT_REMINDERS_KEY);
      if (stored) {
        this.sentReminders = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error loading sent reminders:', e);
    }
  }

  private saveSentReminders() {
    try {
      localStorage.setItem(SENT_REMINDERS_KEY, JSON.stringify(this.sentReminders));
    } catch (e) {
      console.error('Error saving sent reminders:', e);
    }
  }

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.checkReminders(), CHECK_INTERVAL);
    this.checkReminders(); // Initial check
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkReminders() {
    if (!auth.currentUser) return;

    try {
      const uid = auth.currentUser.uid;
      const eventIdsToProcess = new Set<string>();
      const events: any[] = [];

      // 1. Fetch upcoming events where user is Host
      try {
        const qHost = query(
          collection(db, 'events'), 
          where('hostId', '==', uid), 
          where('status', '==', 'upcoming')
        );
        const hostSnap = await getDocs(qHost);
        hostSnap.forEach(d => {
          eventIdsToProcess.add(d.id);
          events.push({ id: d.id, ...d.data() });
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'events-host');
      }

      // 2. Fetch registrations where user is Registered
      try {
        const qReg = query(
          collectionGroup(db, 'registrations'),
          where('userId', '==', uid)
        );
        const regSnap = await getDocs(qReg);
        
        for (const regDoc of regSnap.docs) {
          const eventId = regDoc.ref.parent.parent?.id;
          if (eventId && !eventIdsToProcess.has(eventId)) {
            try {
              const eventDoc = await getDoc(doc(db, 'events', eventId));
              if (eventDoc.exists()) {
                const eventData = eventDoc.data() as any;
                if (eventData.status === 'upcoming') {
                  eventIdsToProcess.add(eventId);
                  events.push({ id: eventId, ...eventData });
                }
              }
            } catch (error) {
              // Individual event read failed, skip it
              console.warn(`Failed to read event ${eventId} for reminder:`, error);
            }
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'registrations-group');
      }

      // Process collected events
      for (const event of events) {
        await this.processEvent(event, uid);
      }
    } catch (error) {
      console.error('Reminder check failed:', error);
    }
  }

  private async processEvent(event: any, uid: string) {
    if (!event.startDate) return;

    const now = new Date();
    const startTime = new Date(event.startDate);
    const diffMs = startTime.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    // 30 minute reminder: between 30 and 25 minutes before
    if (diffMins <= 30 && diffMins > 25) {
      await this.sendReminder(event, uid, '30');
    }
    // 5 minute reminder: between 5 and 0 minutes before
    else if (diffMins <= 5 && diffMins > 0) {
      await this.sendReminder(event, uid, '5');
    }
  }

  private async sendReminder(event: any, uid: string, threshold: string) {
    // Check if already sent in this session/localStorage
    if (this.sentReminders[event.id]?.[threshold]) return;

    // Double check Firestore to be sure (across devices)
    const q = query(
      collection(db, 'notifications'), 
      where('recipientId', '==', uid),
      where('type', '==', 'event_reminder'),
      where('relatedId', '==', event.id)
    );
    const snap = await getDocs(q);
    const alreadyExists = snap.docs.some(doc => doc.data().content.includes(`${threshold} minutes`));
    
    if (alreadyExists) {
      if (!this.sentReminders[event.id]) this.sentReminders[event.id] = {};
      this.sentReminders[event.id][threshold] = true;
      this.saveSentReminders();
      return;
    }

    // Create notification
    const content = `Event Reminder: "${event.title}" starts in ${threshold} minutes!`;
    
    try {
      await addDoc(collection(db, 'notifications'), {
        recipientId: uid,
        type: 'event_reminder',
        category: 'events',
        priority: 'high',
        content,
        relatedId: event.id,
        read: false,
        createdAt: serverTimestamp()
      });

      toast(content, { icon: '⏰', duration: 6000 });

      if (!this.sentReminders[event.id]) this.sentReminders[event.id] = {};
      this.sentReminders[event.id][threshold] = true;
      this.saveSentReminders();
    } catch (e) {
      console.error('Failed to send reminder notification:', e);
    }
  }
}

export const reminderService = new ReminderService();
