import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile } from '@/types';

export const logAction = async (
  user: UserProfile | null,
  action: string,
  details: string,
  entityId?: string,
  entityType?: string
) => {
  const activeUser = user || {
    id: 'system',
    name: 'Staff / POS System',
    email: 'pos@system.local'
  };

  try {
    await addDoc(collection(db, 'audit_logs'), {
      userId: activeUser.id,
      userName: activeUser.name || 'Staff / POS System',
      userEmail: activeUser.email || '',
      action,
      details,
      entityId: entityId || null,
      entityType: entityType || null,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to log action:', error);
  }
};
