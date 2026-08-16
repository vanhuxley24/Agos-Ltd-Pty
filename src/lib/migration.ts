import { supabase } from './supabase';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';

/**
 * Utility to sync/migrate existing Firestore documents over to Supabase PostgreSQL
 */
export async function migrateFirestoreToSupabase(): Promise<{
  success: boolean;
  counts: Record<string, number>;
  errors: string[];
}> {
  const counts: Record<string, number> = {};
  const errors: string[] = [];

  const collectionsToMigrate = [
    { firestore: 'locations', supabaseTable: 'locations' },
    { firestore: 'categories', supabaseTable: 'categories' },
    { firestore: 'brands', supabaseTable: 'brands' },
    { firestore: 'products', supabaseTable: 'products' },
    { firestore: 'sales', supabaseTable: 'sales' },
    { firestore: 'customers', supabaseTable: 'customers' },
    { firestore: 'loyalty_cards', supabaseTable: 'loyalty_cards' },
    { firestore: 'suppliers', supabaseTable: 'suppliers' },
    { firestore: 'purchase_orders', supabaseTable: 'purchase_orders' },
    { firestore: 'accounts', supabaseTable: 'accounts' },
    { firestore: 'financial_transactions', supabaseTable: 'financial_transactions' },
    { firestore: 'attendance', supabaseTable: 'attendance' },
    { firestore: 'attendanceRequests', supabaseTable: 'attendance_requests' },
    { firestore: 'invites', supabaseTable: 'invites' },
    { firestore: 'audit_logs', supabaseTable: 'audit_logs' },
    { firestore: 'users', supabaseTable: 'users' },
  ];

  for (const item of collectionsToMigrate) {
    try {
      const snap = await getDocs(collection(db, item.firestore));
      if (snap.empty) {
        counts[item.supabaseTable] = 0;
        continue;
      }

      const records = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        };
      });

      const { error } = await supabase.from(item.supabaseTable).upsert(records, { onConflict: 'id' });
      if (error) {
        console.warn(`Error migrating table ${item.supabaseTable}:`, error);
        errors.push(`${item.supabaseTable}: ${error.message}`);
      } else {
        counts[item.supabaseTable] = records.length;
      }
    } catch (err: any) {
      console.warn(`Failed reading firestore collection ${item.firestore}:`, err);
      errors.push(`${item.firestore}: ${err.message || err}`);
    }
  }

  return {
    success: errors.length === 0,
    counts,
    errors
  };
}
