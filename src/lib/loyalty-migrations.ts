import { collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { Sale, Customer } from '@/types';
import { handleFirestoreError, OperationType } from './firestore-utils';

export interface MigrationResult {
  totalCustomers: number;
  updatedCustomersCount: number;
  totalItemsMigrated: number;
  details: Array<{
    customerId: string;
    customerName: string;
    previousTotalItems: number;
    newTotalItems: number;
    newLoyaltyCount: number;
  }>;
}

/**
 * Migration function to scan all historical sales and safely initialize / recalculate
 * every customer's totalItemsPurchased and loyaltyItemCount in the Firestore database.
 */
export async function migrateCustomerLoyaltyCounts(): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalCustomers: 0,
    updatedCustomersCount: 0,
    totalItemsMigrated: 0,
    details: []
  };

  try {
    // 1. Fetch all completed sales
    const salesSnapshot = await getDocs(collection(db, 'sales'));
    const sales = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));

    // Calculate item counts per customer
    const customerItemTotals: { [customerId: string]: number } = {};

    for (const sale of sales) {
      if (sale.status === 'completed' && sale.customerId && sale.customerId !== 'walk-in') {
        const saleItemCount = sale.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
        customerItemTotals[sale.customerId] = (customerItemTotals[sale.customerId] || 0) + saleItemCount;
      }
    }

    // 2. Fetch all customers
    const customersSnapshot = await getDocs(collection(db, 'customers'));
    const customers = customersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));

    result.totalCustomers = customers.length;

    // Use Firestore WriteBatch for efficient and atomic multi-document updates
    const batch = writeBatch(db);
    let batchOperationsCount = 0;

    for (const customer of customers) {
      const calculatedTotal = customerItemTotals[customer.id] || 0;
      const calculatedLoyaltyCount = calculatedTotal % 10;

      const previousTotal = customer.totalItemsPurchased ?? 0;
      const previousLoyalty = customer.loyaltyItemCount ?? 0;

      // Update if fields are missing or if total differs from historical sales
      if (
        customer.totalItemsPurchased === undefined ||
        customer.loyaltyItemCount === undefined ||
        previousTotal !== calculatedTotal ||
        previousLoyalty !== calculatedLoyaltyCount
      ) {
        const customerRef = doc(db, 'customers', customer.id);
        batch.update(customerRef, {
          totalItemsPurchased: calculatedTotal,
          loyaltyItemCount: calculatedLoyaltyCount
        });

        batchOperationsCount++;
        result.updatedCustomersCount++;
        result.totalItemsMigrated += calculatedTotal;

        result.details.push({
          customerId: customer.id,
          customerName: customer.name,
          previousTotalItems: previousTotal,
          newTotalItems: calculatedTotal,
          newLoyaltyCount: calculatedLoyaltyCount
        });
      }
    }

    if (batchOperationsCount > 0) {
      await batch.commit();
    }

    return result;
  } catch (error) {
    console.error('Error executing customer loyalty migration:', error);
    handleFirestoreError(error, OperationType.UPDATE, 'customers');
    throw error;
  }
}
