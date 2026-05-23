import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const updateEventStatus = async (event: any) => {
  const now = new Date();
  const startDate = event.startDate ? new Date(event.startDate) : null;
  const endDate = event.endDate ? new Date(event.endDate) : null;
  
  if (!startDate) return event.status;

  // If no explicit end date, assume 1 hour after start
  const eventEndTime = endDate || new Date(startDate.getTime() + 3600000);

  if (now > eventEndTime && event.status !== 'ended') {
    await updateDoc(doc(db, 'events', event.id), { status: 'ended' });
    return 'ended';
  }
  
  return event.status;
};
