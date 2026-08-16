import { collection, getDocs, doc, writeBatch, Timestamp, addDoc, deleteDoc, increment, deleteField } from 'firebase/firestore';
import { db, auth } from './firebase';

export interface ReconciliationResult {
  repairedSales: number;
  repairedFinancials: number;
  repairedAudits: number;
  repairedInventory?: number;
  message: string;
}

let isReconcilingInProgress = false;

export const reconcileSystemData = async (): Promise<ReconciliationResult> => {
  if (isReconcilingInProgress) {
    return {
      repairedSales: 0,
      repairedFinancials: 0,
      repairedAudits: 0,
      message: 'Reconciliation deferred: Already in progress'
    };
  }

  if (!auth.currentUser) {
    return {
      repairedSales: 0,
      repairedFinancials: 0,
      repairedAudits: 0,
      message: 'Reconciliation deferred: User not authenticated yet'
    };
  }

  isReconcilingInProgress = true;

  try {
    const [salesSnap, finSnap, auditSnap, accountsSnap, locsSnap, poSnap, returnsSnap, productsSnap] = await Promise.all([
      getDocs(collection(db, 'sales')),
      getDocs(collection(db, 'financialTransactions')),
      getDocs(collection(db, 'audit_logs')),
      getDocs(collection(db, 'accounts')),
      getDocs(collection(db, 'locations')),
      getDocs(collection(db, 'purchaseOrders')),
      getDocs(collection(db, 'returnTransactions')),
      getDocs(collection(db, 'products'))
    ]);

    let financials = finSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const audits = auditSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const locations = locsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const purchaseOrders = poSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const returns = returnsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    let repairedSales = 0;
    let repairedFinancials = 0;
    let repairedAudits = 0;
    let duplicatesRemoved = 0;

    // Helper for finding accounts
    const defaultAccount = accounts[0] || { id: 'cash', name: 'Cash' };

    // 0. Clean up duplicate financial transactions in Firestore
    const duplicateIdsToDelete: string[] = [];
    const seenFinKeys = new Set<string>();

    // Sort financials so those with full saleId/reference come first
    const sortedFins = [...financials].sort((a, b) => {
      const aScore = (a.saleId ? 2 : 0) + (a.reference ? 1 : 0);
      const bScore = (b.saleId ? 2 : 0) + (b.reference ? 1 : 0);
      return bScore - aScore;
    });

    for (const fin of sortedFins) {
      const refKey = (fin.saleId || fin.reference || fin.description?.match(/#([a-zA-Z0-9]{8})/)?.[1] || '').substring(0, 8);
      const timeMin = fin.timestamp?.seconds ? Math.floor(fin.timestamp.seconds / 300) : 0; // 5-min window for unreferenced
      
      const key = refKey 
        ? `${refKey}_${fin.accountId}_${fin.type}_${Number(fin.amount || 0).toFixed(2)}`
        : `${(fin.description || '').toLowerCase()}_${fin.accountId}_${fin.type}_${Number(fin.amount || 0).toFixed(2)}_${timeMin}`;

      if (seenFinKeys.has(key)) {
        duplicateIdsToDelete.push(fin.id);
      } else {
        seenFinKeys.add(key);
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      // Perform batch deletions
      for (let i = 0; i < duplicateIdsToDelete.length; i += 450) {
        const batch = writeBatch(db);
        const chunk = duplicateIdsToDelete.slice(i, i + 450);
        for (const id of chunk) {
          batch.delete(doc(db, 'financialTransactions', id));
        }
        await batch.commit();
      }
      duplicatesRemoved = duplicateIdsToDelete.length;
      // Filter out deleted docs from local array
      financials = financials.filter(f => !duplicateIdsToDelete.includes(f.id));
    }

    // 1. Backtrack & Sync Sales -> Financial Transactions & Audit Logs
    for (const sale of sales) {
      // Process valid completed/returned/partially_returned sales or sales without explicit status
      const isCompleted = !sale.status || sale.status === 'completed' || sale.status === 'returned' || sale.status === 'partially_returned';
      if (!isCompleted) continue;

      // Check if financial transaction exists for this sale
      const existingFin = financials.find(f => 
        (f.saleId && f.saleId === sale.id) || 
        (f.reference && f.reference === sale.id) || 
        (f.description && (f.description.includes(sale.id) || f.description.includes(sale.id.substring(0, 8))))
      );

      if (!existingFin) {
        // Need to create financial transaction
        let splitsToProcess: any[] = [];
        if (sale.paymentMethod === 'split' && sale.paymentSplits && sale.paymentSplits.length > 0) {
          splitsToProcess = sale.paymentSplits;
        } else {
          const matchedAcc = accounts.find(a => 
            a.id === sale.paymentMethod || 
            a.name.toLowerCase() === (sale.paymentMethod || '').toLowerCase()
          );
          splitsToProcess = [{
            methodId: matchedAcc?.id || sale.paymentMethod || defaultAccount.id,
            methodName: matchedAcc?.name || defaultAccount.name,
            amount: sale.total || 0
          }];
        }

        const saleLocation = locations.find(l => l.id === sale.locationId);

        for (const split of splitsToProcess) {
          const matchedAcc = accounts.find(a => 
            a.id === split.methodId || 
            a.name.toLowerCase() === (split.methodName || '').toLowerCase()
          ) || defaultAccount;

          const desc = sale.isTotalEdited
            ? `Sale Payment (Edited Total) #${sale.id.substring(0, 8)}: ${sale.customerDetails?.name || 'Walk-In'}`
            : `Sale Payment #${sale.id.substring(0, 8)}: ${sale.customerDetails?.name || 'Walk-In'}`;

          const newDocRef = await addDoc(collection(db, 'financialTransactions'), {
            amount: split.amount || sale.total || 0,
            type: 'income',
            accountId: matchedAcc.id,
            accountName: matchedAcc.name,
            locationId: sale.locationId || null,
            locationName: saleLocation?.name || null,
            category: 'Sales',
            description: desc,
            reference: sale.id,
            saleId: sale.id,
            timestamp: sale.timestamp || Timestamp.now(),
            createdBy: sale.staffId || auth.currentUser?.uid || 'system',
            createdByName: sale.staffName || 'Staff'
          });

          // Add to local financials list to avoid duplicate creation in same loop
          financials.push({
            id: newDocRef.id,
            saleId: sale.id,
            reference: sale.id,
            description: desc,
            amount: split.amount || sale.total || 0,
            accountId: matchedAcc.id,
            type: 'income'
          });

          repairedFinancials++;
        }
      }

      // Check if audit log exists for this sale
      const existingAudit = audits.find(a => 
        a.entityId === sale.id || 
        (a.details && (a.details.includes(sale.id) || a.details.includes(sale.id.substring(0, 8))))
      );

      if (!existingAudit) {
        const itemSummary = (sale.items || []).map((i: any) => `${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ''}`).join(', ');
        await addDoc(collection(db, 'audit_logs'), {
          userId: sale.staffId || auth.currentUser?.uid || 'system',
          userName: sale.staffName || 'Staff',
          userEmail: 'pos@system.local',
          action: 'CREATE_SALE',
          details: `Processed sale #${sale.id.substring(0, 8)}: Total ${(sale.total || 0).toFixed(2)} [${itemSummary}]`,
          entityId: sale.id,
          entityType: 'sale',
          timestamp: sale.timestamp || Timestamp.now()
        });

        repairedAudits++;
      }

      repairedSales++;
    }

    // 2. Backtrack & Sync Purchase Orders -> Financial Transactions & Audit Logs
    for (const po of purchaseOrders) {
      if (po.status === 'received' || po.status === 'partially_received') {
        const existingFin = financials.find(f => 
          f.reference === po.id || 
          (f.description && (f.description.includes(po.id) || f.description.includes(po.poNumber || '')))
        );

        if (!existingFin && po.totalAmount) {
          const poLocation = locations.find(l => l.id === po.locationId);
          await addDoc(collection(db, 'financialTransactions'), {
            amount: po.totalAmount,
            type: 'expense',
            accountId: defaultAccount.id,
            accountName: defaultAccount.name,
            locationId: po.locationId || null,
            locationName: poLocation?.name || null,
            category: 'Inventory Purchase',
            description: `Inventory Stock Receipt PO #${po.poNumber || po.id.substring(0, 8)}`,
            reference: po.id,
            timestamp: po.receivedAt || po.createdAt || Timestamp.now(),
            createdBy: po.createdBy || 'system',
            createdByName: po.createdByName || 'Staff'
          });
          repairedFinancials++;
        }

        const existingAudit = audits.find(a => 
          a.entityId === po.id || 
          (a.details && (a.details.includes(po.id) || a.details.includes(po.poNumber || '')))
        );

        if (!existingAudit) {
          await addDoc(collection(db, 'audit_logs'), {
            userId: po.createdBy || 'system',
            userName: po.createdByName || 'Staff',
            userEmail: 'inventory@system.local',
            action: 'RECEIVE_STOCK',
            details: `Received inventory PO #${po.poNumber || po.id.substring(0, 8)}: Total ${(po.totalAmount || 0).toFixed(2)}`,
            entityId: po.id,
            entityType: 'purchaseOrder',
            timestamp: po.receivedAt || po.createdAt || Timestamp.now()
          });
          repairedAudits++;
        }
      }
    }

    // 3. Backtrack & Sync Returns -> Audit Logs & Financials
    for (const ret of returns) {
      const existingAudit = audits.find(a => 
        a.entityId === ret.id || 
        (a.details && a.details.includes(ret.id))
      );

      if (!existingAudit) {
        await addDoc(collection(db, 'audit_logs'), {
          userId: ret.createdBy || 'system',
          userName: ret.createdByName || 'Staff',
          userEmail: 'returns@system.local',
          action: 'PROCESS_RETURN',
          details: `Processed return #${ret.id.substring(0, 8)} for Sale #${(ret.originalSaleId || '').substring(0, 8)}: Total Refund ${(ret.totalRefund || 0).toFixed(2)}`,
          entityId: ret.id,
          entityType: 'return',
          timestamp: ret.timestamp || Timestamp.now()
        });
        repairedAudits++;
      }
    }

    // 4. Backtrack & Sync Sales Stock Deductions
    let repairedInventory = 0;
    const invBatch = writeBatch(db);
    let invOps = 0;

    for (const sale of sales) {
      // Case A: Active sales that were marked as stockDeducted: false -> deduct inventory
      if ((!sale.status || sale.status === 'completed' || sale.status === 'returned' || sale.status === 'partially_returned') && sale.stockDeducted === false) {
        for (const item of sale.items || []) {
          const prodId = item.productId || item.id;
          if (!prodId) continue;
          const returnedQty = item.returnedQuantity || 0;
          const netQty = Math.max(0, item.quantity - returnedQty);
          if (netQty <= 0) continue;

          const productRef = doc(db, 'products', prodId);
          const stockUpdates: Record<string, any> = {
            stock: increment(-netQty),
            updatedAt: Timestamp.now()
          };
          if (sale.locationId) {
            stockUpdates[`stocks.${sale.locationId}`] = increment(-netQty);
          }
          invBatch.update(productRef, stockUpdates);
          invOps++;
        }
        const saleRef = doc(db, 'sales', sale.id);
        invBatch.update(saleRef, {
          stockDeducted: true,
          updatedAt: Timestamp.now()
        });
        invOps++;
        repairedInventory++;
      }
      
      // Case B: Voided sales that still have stockDeducted !== false -> restore inventory
      if (sale.status === 'voided' && sale.stockDeducted !== false) {
        for (const item of sale.items || []) {
          const prodId = item.productId || item.id;
          if (!prodId) continue;
          const returnedQty = item.returnedQuantity || 0;
          const netQty = Math.max(0, item.quantity - returnedQty);
          if (netQty <= 0) continue;

          const productRef = doc(db, 'products', prodId);
          const stockUpdates: Record<string, any> = {
            stock: increment(netQty),
            updatedAt: Timestamp.now()
          };
          if (sale.locationId) {
            stockUpdates[`stocks.${sale.locationId}`] = increment(netQty);
          }
          invBatch.update(productRef, stockUpdates);
          invOps++;
        }
        const saleRef = doc(db, 'sales', sale.id);
        invBatch.update(saleRef, {
          stockDeducted: false,
          updatedAt: Timestamp.now()
        });
        invOps++;
        repairedInventory++;
      }
    }

    // 5. Clean up and restore any corrupted orphaned 'stocks.<locId>' root fields on product documents
    for (const prodDoc of productsSnap.docs) {
      const prodData = prodDoc.data();
      const corruptedKeys = Object.keys(prodData).filter(k => k.startsWith('stocks.'));
      if (corruptedKeys.length > 0) {
        const prodRef = doc(db, 'products', prodDoc.id);
        const fixPayload: Record<string, any> = {
          updatedAt: Timestamp.now()
        };
        const currentStocks = { ...(prodData.stocks || {}) };
        let hasStocksChange = false;

        for (const badKey of corruptedKeys) {
          const locId = badKey.replace('stocks.', '');
          const orphanVal = Number(prodData[badKey]) || 0;
          if (locId && orphanVal > 0) {
            currentStocks[locId] = (Number(currentStocks[locId]) || 0) + orphanVal;
            hasStocksChange = true;
          }
          fixPayload[badKey] = deleteField();
        }

        if (hasStocksChange) {
          fixPayload.stocks = currentStocks;
        }

        invBatch.update(prodRef, fixPayload);
        invOps++;
        repairedInventory++;
      }
    }

    if (invOps > 0) {
      await invBatch.commit();
    }

    let msg = `System reconciliation completed successfully! Rechecked ${repairedSales} sales.`;
    if (duplicatesRemoved > 0) {
      msg += ` Removed ${duplicatesRemoved} duplicate transaction line(s).`;
    }
    if (repairedInventory > 0) {
      msg += ` Re-aligned inventory stock for ${repairedInventory} un-deducted sale(s).`;
    }
    if (repairedFinancials > 0 || repairedAudits > 0) {
      msg += ` Added ${repairedFinancials} missing financial transaction(s) and ${repairedAudits} missing audit record(s).`;
    } else if (duplicatesRemoved === 0 && repairedInventory === 0) {
      msg += ` All financial transactions and ledgers are fully aligned and balanced.`;
    }

    return {
      repairedSales,
      repairedFinancials,
      repairedAudits,
      repairedInventory,
      message: msg
    };

  } catch (error: any) {
    console.error('Error during system reconciliation:', error);
    return {
      repairedSales: 0,
      repairedFinancials: 0,
      repairedAudits: 0,
      message: `Reconciliation error: ${error?.message || 'Unknown error'}`
    };
  } finally {
    isReconcilingInProgress = false;
  }
};

