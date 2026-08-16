import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { DataTablePagination } from '@/components/DataTablePagination';
import { 
  History, 
  Search, 
  Eye, 
  Download, 
  Calendar as CalendarIcon,
  Filter,
  ArrowUpDown,
  XCircle,
  Undo2,
  Plus,
  X,
  RotateCcw,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Banknote,
  Users,
  CreditCard,
  Building2,
  DollarSign,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  writeBatch, 
  doc, 
  addDoc,
  increment, 
  Timestamp,
  setDoc,
  getDoc,
  where 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLocations } from '@/contexts/LocationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Sale, PriceTier, PaymentOption } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logAction } from '@/lib/audit';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ReturnForm } from '@/components/ReturnForm';

import { exportToCSV } from '@/lib/export';

export const SalesHistory: React.FC = () => {
  const { user, profile, isAdmin, isManager } = useAuth();
  const { selectedLocationId, locations } = useLocations();
  const { settings } = useSettings();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<{ methodId: string; methodName: string; amount: number; reference?: string }[]>([]);
  const [paymentDetails, setPaymentDetails] = useState({
    methodId: 'cash',
    reference: ''
  });
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [kpiIncludeAll, setKpiIncludeAll] = useState<boolean>(false);

  const parseTimestampDate = (ts: any): Date => {
    if (!ts) return new Date(0);
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds !== undefined && ts.seconds !== null) return new Date(ts.seconds * 1000);
    if (ts instanceof Date) return ts;
    if (typeof ts === 'string' || typeof ts === 'number') {
      const parsed = new Date(ts);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date(0);
  };

  const getTodayDateRange = () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return { start: todayStr, end: todayStr };
  };

  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => getTodayDateRange());
  const [paymentFilter, setPaymentFilter] = useState('cash');
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [isVoidDialogOpen, setIsVoidDialogOpen] = useState(false);
  const [voidAccountId, setVoidAccountId] = useState('');
  const [saleToVoid, setSaleToVoid] = useState<Sale | null>(null);

  const [activeTab, setActiveTab] = useState<'sales' | 'voids' | 'pending' | 'ledger'>('ledger');
  const [ledgerLimit, setLedgerLimit] = useState<number>(300);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rawFinancialTransactions, setRawFinancialTransactions] = useState<any[]>([]);
  const [pendingSales, setPendingSales] = useState<Sale[]>([]);
  const [returnTransactions, setReturnTransactions] = useState<any[]>([]);
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);
  const [returnToReverse, setReturnToReverse] = useState<any | null>(null);
  const [reverseAccountId, setReverseAccountId] = useState<string>('');
  const [isReverseDialogOpen, setIsReverseDialogOpen] = useState(false);
  const [isReversing, setIsReversing] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const unsubscribeTiers = onSnapshot(collection(db, 'priceTiers'), (snapshot) => {
      setPriceTiers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PriceTier)));
    }, (error) => {
      console.warn("SalesHistory: Error listening to priceTiers:", error);
    });

    const unsubscribePayments = onSnapshot(collection(db, 'paymentOptions'), (snapshot) => {
      setPaymentOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentOption)));
    }, (error) => {
      console.warn("SalesHistory: Error listening to paymentOptions:", error);
    });

    let unsubscribeAccounts = () => {};
    const isStaffUser = ['admin', 'manager', 'staff'].includes(profile.role) || 
                        ['vanhuxley24@gmail.com', 'v4peavenue@gmail.com'].includes(user?.email?.toLowerCase() || '');

    if (isStaffUser) {
      unsubscribeAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
        setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        console.warn("SalesHistory: Error listening to accounts:", error);
      });
    }

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsersList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn("SalesHistory: Error listening to users:", error);
    });

    return () => {
      unsubscribeTiers();
      unsubscribePayments();
      unsubscribeAccounts();
      unsubscribeUsers();
    };
  }, [profile?.id, user?.uid]);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'sales'), orderBy('timestamp', 'desc'), limit(300));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let salesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      
      // Filter by global location
      if (selectedLocationId !== 'all') {
        salesList = salesList.filter(s => s.locationId === selectedLocationId);
      }
      
      setSales(salesList);
      setLoading(false);
    }, (error) => {
      console.warn("SalesHistory: Error listening to sales:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedLocationId, profile?.id]);

  useEffect(() => {
    if (!profile) return;
    
    const q = query(
      collection(db, 'sales'), 
      where('status', '==', 'pending')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      if (selectedLocationId !== 'all') {
        list = list.filter(s => s.locationId === selectedLocationId);
      }
      list.sort((a, b) => {
        const timeA = parseTimestampDate(a.timestamp).getTime();
        const timeB = parseTimestampDate(b.timestamp).getTime();
        return timeB - timeA;
      });
      setPendingSales(list);
    }, (err) => {
      console.warn("Failed to query pending sales directly:", err);
    });
    
    return () => unsubscribe();
  }, [selectedLocationId, profile?.id]);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'returnTransactions'), orderBy('timestamp', 'desc'), limit(200));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let returnsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter by global location
      if (selectedLocationId !== 'all') {
        returnsList = returnsList.filter((r: any) => r.locationId === selectedLocationId);
      }
      
      setReturnTransactions(returnsList);
    }, (error) => {
      console.warn("SalesHistory: Error listening to returnTransactions:", error);
    });
    return () => unsubscribe();
  }, [selectedLocationId, profile?.id]);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'financialTransactions'), orderBy('timestamp', 'desc'), limit(ledgerLimit));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter by global location
      if (selectedLocationId !== 'all') {
        list = list.filter((t: any) => t.locationId === selectedLocationId);
      }
      
      setRawFinancialTransactions(list);
    }, (error) => {
      console.warn("Ledger error loading financial transactions:", error);
    });
    return () => unsubscribe();
  }, [selectedLocationId, profile?.id, ledgerLimit]);

  const getPaymentMethodName = React.useCallback((id: string, splits?: any[]) => {
    if (!id) return '';
    const idLower = id.toLowerCase().trim();
    if (idLower === 'cash') return 'Cash';
    if (idLower === 'card') return 'Card';
    if (idLower === 'digital') return 'Digital Payment';
    if (idLower === 'pending') return 'Pending/Unpaid';
    if (idLower === 'split') return 'Split Payment';

    const acc = accounts.find(a => a.id === id || a.name.toLowerCase() === idLower);
    if (acc) return acc.name;

    const opt = paymentOptions.find(o => o.id === id || o.name.toLowerCase() === idLower);
    if (opt) return opt.name;

    if (splits && splits.length > 0) {
      const matchingSplit = splits.find(split => split.methodId === id || split.methodName?.toLowerCase() === idLower);
      if (matchingSplit && matchingSplit.methodName) {
        return matchingSplit.methodName;
      }
    }
    return id.charAt(0).toUpperCase() + id.slice(1);
  }, [accounts, paymentOptions]);

  const financeCashAccount = React.useMemo(() => {
    return accounts.find(a => a.name?.trim().toLowerCase() === 'cash') ||
           paymentOptions.find(o => o.name?.trim().toLowerCase() === 'cash') ||
           accounts.find(a => a.type === 'cash' && !a.name?.toLowerCase().includes('gcash')) ||
           paymentOptions.find(o => o.type === 'cash' && !o.name?.toLowerCase().includes('gcash'));
  }, [accounts, paymentOptions]);

  const financeCashId = financeCashAccount ? financeCashAccount.id : 'cash';

  const getUnifiedMethodId = React.useCallback((id: string) => {
    if (!id) return '';
    const idLower = id.toLowerCase().trim();
    if (id === financeCashId || idLower === 'cash') return financeCashId;
    
    // Find in paymentOptions
    const opt = paymentOptions.find(o => o.id === id || o.name?.toLowerCase().trim() === idLower);
    if (opt) {
      if (opt.id === financeCashId || opt.name?.toLowerCase().trim() === 'cash') {
        return financeCashId;
      }
      return opt.id;
    }

    // Find in accounts
    const acc = accounts.find(a => a.id === id || a.name?.toLowerCase().trim() === idLower);
    if (acc) {
      if (acc.id === financeCashId || acc.name?.toLowerCase().trim() === 'cash') {
        return financeCashId;
      }
      return acc.id;
    }

    return id;
  }, [paymentOptions, accounts, financeCashId]);

  const ledgerTransactions = useMemo(() => {
    // Set of all sale IDs to identify sale-related financial transactions
    const saleIdSet = new Set(sales.map(s => s.id));

    // 1. Transform active completed/returned/voided sales into Sale Record entries (representing the original income sale)
    const saleRecordEntries: any[] = [];
    sales
      .filter(s => s.status !== 'pending' && s.status !== 'pending_promo_approval' && s.status !== 'pending_total_approval')
      .forEach(sale => {
        const sellerName = usersList.find(u => u.id === sale.staffId)?.name || sale.staffName || 'Staff';
        const customerName = sale.customerDetails?.name || 'Walk-In';

        if (sale.paymentSplits && sale.paymentSplits.length > 0) {
          sale.paymentSplits.forEach((split, idx) => {
            const rawId = split.methodId || 'cash';
            const matchedAcc = accounts.find(a => a.id === rawId || a.name.toLowerCase() === rawId.toLowerCase());
            const accName = matchedAcc?.name || split.methodName || getPaymentMethodName(rawId);

            saleRecordEntries.push({
              id: `salerecord_${sale.id}_${idx}`,
              displayId: sale.id,
              saleId: sale.id,
              amount: split.amount || 0,
              type: 'income',
              category: 'Sales',
              description: `Sale Record #${sale.id.substring(0, 8)}: ${customerName} (${split.methodName || 'Split'})`,
              reference: split.reference || sale.id,
              accountId: rawId,
              accountName: accName,
              locationId: sale.locationId || null,
              locationName: locations.find(l => l.id === sale.locationId)?.name || null,
              timestamp: sale.timestamp,
              createdBy: sale.staffId || 'anonymous',
              createdByName: sellerName,
              isSaleRecord: true
            });
          });
        } else {
          let accName = 'Sales Account';
          if (sale.paymentMethod) {
            const matchedAcc = accounts.find(a => a.id === sale.paymentMethod || a.name.toLowerCase() === sale.paymentMethod.toLowerCase());
            accName = matchedAcc?.name || getPaymentMethodName(sale.paymentMethod);
          }

          saleRecordEntries.push({
            id: `salerecord_${sale.id}`,
            displayId: sale.id,
            saleId: sale.id,
            amount: sale.total || 0,
            type: 'income',
            category: 'Sales',
            description: `Sale Record #${sale.id.substring(0, 8)}: ${customerName}`,
            reference: sale.id,
            accountId: sale.paymentMethod || 'cash',
            accountName: accName,
            locationId: sale.locationId || null,
            locationName: locations.find(l => l.id === sale.locationId)?.name || null,
            timestamp: sale.timestamp,
            createdBy: sale.staffId || 'anonymous',
            createdByName: sellerName,
            isSaleRecord: true
          });
        }
      });

    // 2. Filter raw financial transactions to EXCLUDE regular sale income logs, but KEEP void transactions
    const nonSaleFinancials = rawFinancialTransactions.filter(t => {
      const descLower = (t.description || '').toLowerCase();
      const catLower = (t.category || '').toLowerCase();

      // Always include void transactions in the ledger
      const isVoidTx = descLower.includes('void') || catLower === 'returns' || catLower === 'voided sale' || t.isVoidTransaction;
      if (isVoidTx) return true;

      const hasSaleId = !!t.saleId || (!!t.reference && saleIdSet.has(t.reference));
      const isSalesCategory = catLower === 'sales' || catLower === 'sale' || catLower === 'pos sales' || catLower === 'pos' || catLower === 'pos sale';
      const isSaleDesc = descLower.includes('sale payment') || 
                         descLower.includes('approved sale') || 
                         descLower.includes('sale record') || 
                         descLower.includes('payment for sale') ||
                         descLower.includes('sale #');

      const isSaleRelated = hasSaleId || (isSalesCategory && t.type === 'income') || isSaleDesc;
      return !isSaleRelated;
    });

    // 3. For any sale marked as voided, ensure there is a void transaction in the ledger
    const fallbackVoidEntries: any[] = [];
    sales.filter(s => s.status === 'voided').forEach(sale => {
      const existingVoid = rawFinancialTransactions.some(t => 
        (t.isVoidTransaction || (t.description || '').toLowerCase().includes('void')) &&
        (t.saleId === sale.id || t.reference === sale.id || (t.description || '').includes(sale.id))
      );

      if (!existingVoid) {
        let accName = 'Sales Account';
        if (sale.paymentMethod) {
          const matchedAcc = accounts.find(a => a.id === sale.paymentMethod || a.name.toLowerCase() === sale.paymentMethod.toLowerCase());
          accName = matchedAcc?.name || getPaymentMethodName(sale.paymentMethod);
        }

        fallbackVoidEntries.push({
          id: `void_${sale.id}`,
          displayId: `VOID-${sale.id.substring(0, 8)}`,
          saleId: sale.id,
          amount: sale.total || 0,
          type: 'expense',
          category: 'Voided Sale',
          description: `Voided Sale: #${sale.id.substring(0, 8)}`,
          reference: sale.id,
          accountId: sale.paymentMethod || 'cash',
          accountName: accName,
          locationId: sale.locationId || null,
          locationName: locations.find(l => l.id === sale.locationId)?.name || null,
          timestamp: sale.updatedAt || sale.timestamp,
          createdBy: sale.staffId || 'anonymous',
          createdByName: sale.staffName || 'Staff',
          isVoidTransaction: true
        });
      }
    });

    // 4. Combine and sort descending by timestamp
    return [...saleRecordEntries, ...nonSaleFinancials, ...fallbackVoidEntries].sort((a, b) => {
      const timeA = parseTimestampDate(a.timestamp).getTime();
      const timeB = parseTimestampDate(b.timestamp).getTime();
      return timeB - timeA;
    });
  }, [sales, rawFinancialTransactions, usersList, accounts, locations, getPaymentMethodName]);

  const handleOpenVoidDialog = (sale: Sale) => {
    if (!isAdmin && !isManager) {
      toast.error('Only administrators or managers can void sales');
      return;
    }
    setSaleToVoid(sale);
    
    // Find a good default account
    let defaultId = '';
    if (sale.paymentMethod && sale.paymentMethod !== 'split') {
      const matchingAccount = accounts.find(a => 
        a.id === sale.paymentMethod || 
        a.name.toLowerCase() === sale.paymentMethod.toLowerCase()
      );
      if (matchingAccount) {
        defaultId = matchingAccount.id;
      }
    } else if (sale.paymentSplits && sale.paymentSplits.length > 0) {
      const firstSplitId = sale.paymentSplits[0].methodId;
      const matchingAccount = accounts.find(a => a.id === firstSplitId);
      if (matchingAccount) {
        defaultId = matchingAccount.id;
      }
    }
    
    if (!defaultId && accounts.length > 0) {
      const cashAccount = accounts.find(a => a.name.toLowerCase() === 'cash' || a.id === 'cash');
      defaultId = cashAccount?.id || accounts[0]?.id || '';
    }
    
    setVoidAccountId(defaultId);
    setIsVoidDialogOpen(true);
  };

  const [approvingPromoId, setApprovingPromoId] = useState<string | null>(null);

  const handleApprovePromo = async (sale: Sale) => {
    if (!isAdmin && !isManager) {
      toast.error('Only administrators or managers can approve sales');
      return;
    }
    
    setApprovingPromoId(sale.id);
    
    try {
      const batch = writeBatch(db);
      const saleRef = doc(db, 'sales', sale.id);
      
      const nextStatus = sale.paymentMethod === 'pending' ? 'pending' : 'completed';

      // Process financial splits ONLY if the payment is NOT pending
      if (sale.paymentMethod !== 'pending') {
        let splitsToProcess: any[] = [];
        if (sale.paymentMethod === 'split' && sale.paymentSplits && sale.paymentSplits.length > 0) {
          const currentSplitSum = sale.paymentSplits.reduce((acc: number, s: any) => acc + (Number(s.amount) || 0), 0);
          if (currentSplitSum > 0 && Math.abs(currentSplitSum - sale.total) > 0.01) {
            let runningSum = 0;
            splitsToProcess = sale.paymentSplits.map((s: any, idx: number) => {
              if (idx === sale.paymentSplits.length - 1) {
                return { ...s, amount: Math.max(0, sale.total - runningSum) };
              }
              const scaledAmount = Math.round(((Number(s.amount) || 0) / currentSplitSum) * sale.total * 100) / 100;
              runningSum += scaledAmount;
              return { ...s, amount: scaledAmount };
            });
          } else {
            splitsToProcess = sale.paymentSplits;
          }
        } else if (sale.paymentMethod) {
          const matchedAccount = accounts.find(a => 
            a.id === sale.paymentMethod || 
            a.name.toLowerCase() === (sale.paymentSplits?.[0]?.methodName || '').toLowerCase()
          );
          const methodName = matchedAccount?.name || sale.paymentSplits?.[0]?.methodName || (sale.paymentMethod.charAt(0).toUpperCase() + sale.paymentMethod.slice(1));
          splitsToProcess = [{
            methodId: matchedAccount?.id || sale.paymentMethod,
            methodName: methodName,
            amount: sale.total
          }];
        }

        // Process each payment split
        for (const split of splitsToProcess) {
          const account = accounts.find(a => 
            a.id === split.methodId || 
            a.name.toLowerCase() === (split.methodName || '').toLowerCase()
          );
          const targetAccountId = account?.id || split.methodId;
          const accountName = account?.name || split.methodName || 'Sales Account';
          const currentBalance = account?.balance || 0;
          const newBalance = currentBalance + split.amount;

          const accountRef = doc(db, 'accounts', targetAccountId);
          batch.update(accountRef, {
            balance: increment(split.amount),
            lastUpdated: Timestamp.now()
          });

          // Create financial transaction record
          const transRef = doc(collection(db, 'financialTransactions'));
          batch.set(transRef, {
            amount: split.amount,
            type: 'income',
            accountId: targetAccountId,
            accountName: accountName,
            locationId: sale.locationId || null,
            locationName: locations.find(l => l.id === sale.locationId)?.name || null,
            category: 'Sales',
            description: sale.isTotalEdited 
              ? `Approved Sale (Edited Total) #${sale.id.substring(0, 8)}: ${sale.customerDetails?.name || 'Walk-In'}`
              : `Approved Sale Promo #${sale.id.substring(0, 8)}: ${sale.customerDetails?.name || 'Walk-In'}`,
            reference: split.reference || sale.id,
            saleId: sale.id,
            timestamp: Timestamp.now(),
            createdBy: profile?.id || 'anonymous',
            createdByName: profile?.name || 'Staff',
            accountBalance: newBalance
          });
        }
      }

      // Update the sale document status and record approval details
      const isPromo = sale.status === 'pending_promo_approval';
      const updateData: any = {
        status: nextStatus,
        updatedAt: Timestamp.now()
      };

      if (isPromo) {
        updateData.promoApprovedBy = profile?.name || 'Administrator';
        updateData.promoApprovedById = profile?.id || 'admin';
        updateData.promoApprovedAt = Timestamp.now();
      } else {
        updateData.totalApprovedBy = profile?.name || 'Administrator';
        updateData.totalApprovedById = profile?.id || 'admin';
        updateData.totalApprovedAt = Timestamp.now();
      }

      batch.update(saleRef, updateData);

      await batch.commit();

      await logAction(
        profile, 
        isPromo ? 'APPROVE_PROMO_SALE' : 'APPROVE_TOTAL_SALE', 
        isPromo 
          ? `Approved promo for sale ${sale.id} with code ${sale.promoCode}`
          : `Approved edited total of ${settings.currency}${sale.total.toFixed(2)} for sale ${sale.id}`, 
        sale.id, 
        'sale'
      );

      toast.success(isPromo 
        ? `Promo code approved successfully for sale #${sale.id.substring(0, 8)}`
        : `Edited total approved successfully for sale #${sale.id.substring(0, 8)}`
      );
    } catch (error) {
      console.error("Error approving promo sale:", error);
      toast.error('Failed to approve promo sale. Please inspect your database connection.');
      handleFirestoreError(error, OperationType.UPDATE, 'sales');
    } finally {
      setApprovingPromoId(null);
    }
  };

  const handleConfirmVoid = async () => {
    if (!saleToVoid || !voidAccountId) return;
    
    const account = accounts.find(a => a.id === voidAccountId);
    if (!account) {
      toast.error('Selected account not found');
      return;
    }

    setIsVoiding(true);
    try {
      const batch = writeBatch(db);

      // Reverse stock reduction ONLY if stock was actually deducted when sale was made
      const wasStockDeducted = saleToVoid.stockDeducted !== false;
      if (wasStockDeducted) {
        for (const item of saleToVoid.items || []) {
          const prodId = item.productId || (item as any).id;
          if (!prodId) continue;
          
          const returnedQty = item.returnedQuantity || 0;
          const netQtyToReturn = Math.max(0, item.quantity - returnedQty);
          if (netQtyToReturn <= 0) continue;

          const productRef = doc(db, 'products', prodId);
          const stockUpdates: Record<string, any> = {
            stock: increment(netQtyToReturn),
            updatedAt: Timestamp.now()
          };
          if (saleToVoid.locationId) {
            stockUpdates[`stocks.${saleToVoid.locationId}`] = increment(netQtyToReturn);
          }
          batch.update(productRef, stockUpdates);
        }
      }

      // Update sale status
      const saleRef = doc(db, 'sales', saleToVoid.id);
      batch.update(saleRef, {
        status: 'voided',
        stockDeducted: false,
        updatedAt: Timestamp.now()
      });

      // Update chosen financial account
      const currentBalance = account.balance || 0;
      const newBalance = currentBalance - saleToVoid.total;

      const accountRef = doc(db, 'accounts', voidAccountId);
      batch.update(accountRef, {
        balance: increment(-saleToVoid.total),
        lastUpdated: Timestamp.now()
      });

      // Create financial transaction record (reversed income / expense)
      const newTransRef = doc(collection(db, 'financialTransactions'));
      batch.set(newTransRef, {
        amount: saleToVoid.total,
        type: 'expense',
        accountId: voidAccountId,
        accountName: account.name,
        locationId: saleToVoid.locationId || null,
        locationName: locations.find(l => l.id === saleToVoid.locationId)?.name || null,
        category: 'Voided Sale',
        description: `Voided Sale: #${saleToVoid.id.substring(0, 8)}`,
        timestamp: Timestamp.now(),
        createdBy: profile?.id || 'anonymous',
        createdByName: profile?.name || 'Staff',
        accountBalance: newBalance,
        reference: saleToVoid.id,
        saleId: saleToVoid.id,
        isVoidTransaction: true
      });

      await batch.commit();
      await logAction(profile, 'VOID_SALE', `Voided sale: ${saleToVoid.id} (Deducted from ${account.name})`, saleToVoid.id, 'sale');
      
      toast.success('Sale voided successfully. Stock has been returned and payments reversed.');
      setIsVoidDialogOpen(false);
      setSaleToVoid(null);
      setSelectedSale(null);
    } catch (error) {
      console.error("Error voiding sale:", error);
      toast.error('Failed to void sale. Please inspect your database connection.');
      handleFirestoreError(error, OperationType.UPDATE, 'sales');
    } finally {
      setIsVoiding(false);
    }
  };

  const handleConfirmReverseReturn = async () => {
    if (!returnToReverse) return;

    if (returnToReverse.totalRefund > 0 && !reverseAccountId) {
      toast.error('Please select an account to adjust');
      return;
    }

    const account = accounts.find(a => a.id === reverseAccountId);
    if (returnToReverse.totalRefund > 0 && !account) {
      toast.error('Selected account not found');
      return;
    }

    setIsReversing(true);
    try {
      const batch = writeBatch(db);

      // 1. Return refund amount back to selected account (deducting/adjusting from the refund account balance)
      if (returnToReverse.totalRefund > 0 && account) {
        const accountRef = doc(db, 'accounts', reverseAccountId);
        batch.set(accountRef, {
          balance: increment(returnToReverse.totalRefund),
          lastUpdated: Timestamp.now()
        }, { merge: true });

        // Financial transaction representing income (refund cancellation)
        const newTransRef = doc(collection(db, 'financialTransactions'));
        batch.set(newTransRef, {
          amount: returnToReverse.totalRefund,
          type: 'income',
          accountId: reverseAccountId,
          accountName: account.name,
          locationId: returnToReverse.locationId || null,
          locationName: locations.find(l => l.id === returnToReverse.locationId)?.name || null,
          category: 'Sales',
          description: `Reverse Return: Cancelled refund from Return #${returnToReverse.id.substring(0, 8)}`,
          timestamp: Timestamp.now(),
          createdBy: profile?.id || 'anonymous',
          createdByName: profile?.name || 'Staff',
          accountBalance: (account.balance || 0) + returnToReverse.totalRefund
        });
      }

      // 2. Reverse stock levels for restocked items (decrement stock back since they are no longer returned)
      for (const item of returnToReverse.items) {
        const prodId = item.productId || (item as any).id;
        if (item.restock && prodId) {
          const productRef = doc(db, 'products', prodId);
          const stockUpdates: Record<string, any> = {
            stock: increment(-item.quantity),
            updatedAt: Timestamp.now()
          };
          if (returnToReverse.locationId) {
            stockUpdates[`stocks.${returnToReverse.locationId}`] = increment(-item.quantity);
          }
          batch.update(productRef, stockUpdates);
        }
      }

      // 3. Update original sale items returnedQuantity and status
      const saleRef = doc(db, 'sales', returnToReverse.originalSaleId);
      const saleSnap = await getDoc(saleRef);
      if (saleSnap.exists()) {
        const saleData = saleSnap.data() as Sale;
        const updatedItems = (saleData.items || []).map(item => {
          const returnedItem = returnToReverse.items?.find((i: any) => (i.productId || i.id) === (item.productId || (item as any).id));
          if (returnedItem) {
            const currentReturned = item.returnedQuantity || 0;
            return {
              ...item,
              returnedQuantity: Math.max(0, currentReturned - returnedItem.quantity)
            };
          }
          return item;
        });

        const hasAnyReturnsLeft = updatedItems.some(i => (i.returnedQuantity || 0) > 0);
        const newStatus = hasAnyReturnsLeft ? 'partially_returned' : 'completed';

        batch.update(saleRef, {
          items: updatedItems,
          status: newStatus,
          updatedAt: Timestamp.now()
        });
      } else {
        batch.update(saleRef, {
          status: 'completed',
          updatedAt: Timestamp.now()
        });
      }

      // 4. Update return transaction record status to voided
      const returnRef = doc(db, 'returnTransactions', returnToReverse.id);
      batch.update(returnRef, {
        status: 'voided',
        updatedAt: Timestamp.now()
      });

      await batch.commit();

      await logAction(
        profile, 
        'VOID_RETURN', 
        `Voided Return #${returnToReverse.id.substring(0, 8)} for Sale #${returnToReverse.originalSaleId.substring(0, 8)}: Stock decremented & refunded amount of ${settings.currency}${returnToReverse.totalRefund.toFixed(2)} adjusted`, 
        returnToReverse.id, 
        'return'
      );

      toast.success('Return transaction reversed successfully.');
      setIsReverseDialogOpen(false);
      setReturnToReverse(null);
      setSelectedReturn(null);
    } catch (error) {
      console.error("Error reversing return:", error);
      toast.error('Failed to reverse return transaction.');
    } finally {
      setIsReversing(false);
    }
  };

  const handleExportCSV = () => {
    let exportData: any[] = [];
    let filename = 'Sales_History';

    if (activeTab === 'sales') {
      exportData = filteredSales.map(s => ({
        ID: s.id,
        Date: format(parseTimestampDate(s.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        Customer: s.customerDetails?.name || 'Walk-In',
        Location: locations.find(l => l.id === s.locationId)?.name || 'Unknown',
        Items: s.items.map(i => `${i.name} (x${i.quantity})`).join('; '),
        Subtotal: (s.subtotal ?? 0).toFixed(2),
        Discount: (s.discount ?? 0).toFixed(2),
        Tax: (s.tax ?? 0).toFixed(2),
        Total: (s.total ?? 0).toFixed(2),
        Status: s.status || 'completed'
      }));
      filename = 'Sales_Transactions';
    } else if (activeTab === 'voids') {
      exportData = filteredVoids.map(s => ({
        ID: s.id,
        Date: format(parseTimestampDate(s.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        Customer: s.customerDetails?.name || 'Walk-In',
        Staff: usersList.find(u => u.id === s.staffId)?.name || s.staffName || 'Staff',
        Location: locations.find(l => l.id === s.locationId)?.name || s.locationName || 'Main',
        Items: s.items.map(i => `${i.name} (x${i.quantity})`).join('; '),
        Total_Voided: (s.total ?? 0).toFixed(2),
        Status: 'Voided'
      }));
      filename = 'Void_History';
    } else if (activeTab === 'pending') {
      exportData = filteredPendingSales.map(s => ({
        ID: s.id,
        Date: format(parseTimestampDate(s.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        Customer: s.customerDetails?.name || 'Walk-In',
        Location: locations.find(l => l.id === s.locationId)?.name || 'Unknown',
        Items: s.items.map(i => `${i.name} (x${i.quantity})`).join('; '),
        Total: (s.total ?? 0).toFixed(2),
        Status: s.status || 'pending'
      }));
      filename = 'Pending_Payments';
    } else if (activeTab === 'ledger') {
      exportData = displayedLedger.map(t => ({
        ID: t.displayId || t.id,
        Date: format(parseTimestampDate(t.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        Category: t.category || '',
        Description: t.description || '',
        Account: t.accountName || '',
        Amount: (t.amount ?? 0).toFixed(2),
        Type: t.type || ''
      }));
      filename = 'Unified_Ledger';
    }

    if (exportData.length === 0) {
      toast.error('No data available to export.');
      return;
    }

    exportToCSV(exportData, filename);
    toast.success(`${filename.replace('_', ' ')} exported`);
  };

  const handlePrintReceipt = (sale: Sale) => {
    // In a real app, this would open a formatted print window or send to a thermal printer
    // For now, we'll just trigger the window print
    window.print();
  };

  const handleMarkAsPaid = async () => {
    if (!selectedSale) return;

    if (isSplitPayment) {
      const splitTotal = paymentSplits.reduce((sum, s) => sum + (s.amount ?? 0), 0);
      if (Math.abs(splitTotal - selectedSale.total) > 0.01) {
        toast.error(`Split amounts (${settings.currency}${splitTotal.toFixed(2)}) must match total (${settings.currency}${selectedSale.total.toFixed(2)})`);
        return;
      }
    }
    
    setIsPaying(true);
    try {
      const batch = writeBatch(db);
      const saleRef = doc(db, 'sales', selectedSale.id);
      
      let finalPaymentMethod = paymentDetails.methodId;
      let finalSplits = [];

      if (isSplitPayment) {
        finalPaymentMethod = 'split';
        finalSplits = paymentSplits.map(s => ({
          methodId: s.methodId,
          methodName: s.methodName,
          amount: s.amount,
          reference: s.reference || ''
        }));
      } else {
        const method = paymentOptions.find(o => o.id === paymentDetails.methodId);
        const methodName = method?.name || (paymentDetails.methodId.charAt(0).toUpperCase() + paymentDetails.methodId.slice(1));
        finalSplits = [{
          methodId: paymentDetails.methodId,
          methodName,
          amount: selectedSale.total,
          reference: paymentDetails.reference
        }];
      }

      // Update sale
      batch.update(saleRef, {
        status: 'completed',
        paymentMethod: finalPaymentMethod,
        paymentSplits: finalSplits,
        updatedAt: Timestamp.now()
      });

      // Update financial accounts
      for (const split of finalSplits) {
        if (split.methodId) {
          const account = accounts.find(a => 
            a.id === split.methodId || 
            a.name.toLowerCase() === (split.methodName || '').toLowerCase()
          );
          const targetAccountId = account?.id || split.methodId;
          const accountName = account?.name || split.methodName || 'Sales Account';
          const currentBalance = account?.balance || 0;
          const newBalance = currentBalance + split.amount;

          const accountRef = doc(db, 'accounts', targetAccountId);
          batch.update(accountRef, {
            balance: increment(split.amount),
            lastUpdated: Timestamp.now()
          });

          // Create financial transaction record
          const transRef = doc(collection(db, 'financialTransactions'));
          batch.set(transRef, {
            amount: split.amount,
            type: 'income',
            accountId: targetAccountId,
            accountName: accountName,
            locationId: selectedSale.locationId || null,
            locationName: locations.find(l => l.id === selectedSale.locationId)?.name || null,
            category: 'Sales',
            description: selectedSale.isTotalEdited 
              ? `Sale Payment (Edited Total) #${selectedSale.id.substring(0, 8)}: ${selectedSale.customerDetails?.name || 'Walk-In'}`
              : `Sale Payment #${selectedSale.id.substring(0, 8)}: ${selectedSale.customerDetails?.name || 'Walk-In'}`,
            reference: split.reference || selectedSale.id,
            saleId: selectedSale.id,
            timestamp: Timestamp.now(),
            createdBy: profile?.id || 'anonymous',
            createdByName: profile?.name || 'Staff',
            accountBalance: newBalance
          });
        }
      }

      await batch.commit();
      await logAction(profile, 'MARK_SALE_PAID', `Marked sale ${selectedSale.id} as paid via ${isSplitPayment ? 'split' : finalSplits[0].methodName}`, selectedSale.id, 'sale');
      
      toast.success('Sale marked as paid');
      setIsPaymentDialogOpen(false);
      setSelectedSale(null);
    } catch (error) {
      console.error("Error marking sale as paid:", error);
      handleFirestoreError(error, OperationType.UPDATE, 'sales');
    } finally {
      setIsPaying(false);
    }
  };

  const dynamicPaymentOptions = React.useMemo(() => {
    const unifiedMethodsInUse = new Set<string>();
    unifiedMethodsInUse.add(financeCashId);

    sales.forEach(sale => {
      if (sale.paymentMethod) {
        unifiedMethodsInUse.add(getUnifiedMethodId(sale.paymentMethod));
      }
      if (sale.paymentSplits && sale.paymentSplits.length > 0) {
        sale.paymentSplits.forEach(split => {
          if (split.methodId) {
            unifiedMethodsInUse.add(getUnifiedMethodId(split.methodId));
          }
        });
      }
    });

    paymentOptions.forEach(opt => {
      unifiedMethodsInUse.add(getUnifiedMethodId(opt.id));
    });

    const list: { id: string; name: string }[] = [];
    const seenIds = new Set<string>();

    unifiedMethodsInUse.forEach(unifiedId => {
      if (unifiedId === 'split' || unifiedId === 'pending') return;
      if (seenIds.has(unifiedId)) return;
      seenIds.add(unifiedId);

      if (unifiedId === financeCashId) {
        list.push({ id: financeCashId, name: financeCashAccount?.name || 'Cash' });
      } else {
        const name = getPaymentMethodName(unifiedId, sales.flatMap(s => s.paymentSplits || []));
        list.push({ id: unifiedId, name });
      }
    });

    return list;
  }, [sales, paymentOptions, getPaymentMethodName, getUnifiedMethodId, financeCashId, financeCashAccount]);

  const isMethodMatch = React.useCallback((
    mId?: string | null,
    mName?: string | null,
    filterId?: string,
    filterNameStr?: string
  ) => {
    if (!filterId || filterId === 'all') return true;
    if (!mId && !mName) return false;

    const filterUnified = getUnifiedMethodId(filterId);
    const filterNameLower = (filterNameStr || '').toLowerCase().trim();
    const isCashFilter = filterId === financeCashId || filterId === 'cash' || filterNameLower === 'cash';

    const mUnified = mId ? getUnifiedMethodId(mId) : '';
    const mNameLower = (mName || '').toLowerCase().trim();
    const mIdLower = (mId || '').toLowerCase().trim();

    if (isCashFilter) {
      // Must be a cash method/account, and NOT gcash or e-wallet or card
      if (mNameLower.includes('gcash') || mIdLower.includes('gcash')) return false;
      if (mId === financeCashId || mIdLower === 'cash' || mUnified === financeCashId) return true;
      if (mNameLower === 'cash' || mNameLower === 'petty cash' || mNameLower === 'cash on hand' || mNameLower === 'cash account' || mNameLower === 'cash drawer') return true;
      const words = mNameLower.split(/[\s_-]+/);
      if (words.includes('cash') && !mNameLower.includes('gcash')) return true;
      return false;
    }

    // Non-cash filter matching
    if (mId && (mId === filterId || mUnified === filterUnified)) return true;
    if (mNameLower && filterNameLower && mNameLower === filterNameLower) return true;

    return false;
  }, [financeCashId, getUnifiedMethodId]);

  const filteredSales = sales.filter(s => {
    // Search filter
    const searchLower = searchTerm.toLowerCase();
    const sellerName = (usersList.find(u => u.id === s.staffId)?.name || s.staffName || 'Staff').toLowerCase();
    const customerName = (s.customerDetails?.name || '').toLowerCase();
    const matchesSearch = s.id.toLowerCase().includes(searchLower) ||
      customerName.includes(searchLower) ||
      s.items.some(item => item.name.toLowerCase().includes(searchLower)) ||
      sellerName.includes(searchLower);

    // Date range filter
    let matchesDate = true;
    if (dateRange.start) {
      const saleDate = parseTimestampDate(s.timestamp);
      const start = new Date(dateRange.start);
      start.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && saleDate >= start;
    }
    if (dateRange.end) {
      const saleDate = parseTimestampDate(s.timestamp);
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && saleDate <= end;
    }

    // Payment filter
    let matchesPayment = true;
    if (paymentFilter !== 'all') {
      if (paymentFilter === 'split') {
        matchesPayment = s.paymentMethod === 'split';
      } else if (paymentFilter === 'pending') {
        matchesPayment = s.paymentMethod === 'pending' || s.status === 'pending';
      } else {
        const selectedOption = dynamicPaymentOptions.find(opt => opt.id === paymentFilter || opt.id === getUnifiedMethodId(paymentFilter));
        const filterName = (selectedOption ? selectedOption.name : getPaymentMethodName(paymentFilter)).toLowerCase().trim();

        const saleName = getPaymentMethodName(s.paymentMethod || '', s.paymentSplits);
        const matchesMain = isMethodMatch(s.paymentMethod, saleName, paymentFilter, filterName);

        const matchesSplit = s.paymentSplits?.some(split => {
          const splitName = getPaymentMethodName(split.methodId || '', s.paymentSplits);
          return isMethodMatch(split.methodId, splitName || split.methodName, paymentFilter, filterName);
        }) === true;

        matchesPayment = matchesMain || matchesSplit;
      }
    }

    return matchesSearch && matchesDate && matchesPayment;
  });

  const filteredVoids = sales.filter(s => {
    if (s.status !== 'voided') return false;
    const searchLower = searchTerm.toLowerCase();
    const sellerName = (usersList.find(u => u.id === s.staffId)?.name || s.staffName || 'Staff').toLowerCase();
    const customerName = (s.customerDetails?.name || '').toLowerCase();
    const matchesSearch = s.id.toLowerCase().includes(searchLower) ||
      customerName.includes(searchLower) ||
      (s.items && s.items.some(item => item.name.toLowerCase().includes(searchLower))) ||
      sellerName.includes(searchLower);

    let matchesDate = true;
    if (dateRange.start) {
      const saleDate = parseTimestampDate(s.timestamp);
      const start = new Date(dateRange.start);
      start.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && saleDate >= start;
    }
    if (dateRange.end) {
      const saleDate = parseTimestampDate(s.timestamp);
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && saleDate <= end;
    }

    return matchesSearch && matchesDate;
  });

  const filteredPendingSales = pendingSales.filter(s => {
    const searchLower = searchTerm.toLowerCase();
    const pendingSellerName = (usersList.find(u => u.id === s.staffId)?.name || s.staffName || 'Staff').toLowerCase();
    const customerName = (s.customerDetails?.name || '').toLowerCase();
    const matchesSearch = s.id.toLowerCase().includes(searchLower) ||
      customerName.includes(searchLower) ||
      pendingSellerName.includes(searchLower) ||
      (s.items && s.items.some(item => item.name.toLowerCase().includes(searchLower)));

    let matchesDate = true;
    if (dateRange.start) {
      const saleDate = parseTimestampDate(s.timestamp);
      const start = new Date(dateRange.start);
      start.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && saleDate >= start;
    }
    if (dateRange.end) {
      const saleDate = parseTimestampDate(s.timestamp);
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && saleDate <= end;
    }

    return matchesSearch && matchesDate;
  });

  const filteredLedger = ledgerTransactions.filter(t => {
    const searchLower = searchTerm.toLowerCase();
    const createdByLower = (t.createdByName || '').toLowerCase();
    const descLower = (t.description || '').toLowerCase();
    const catLower = (t.category || '').toLowerCase();
    const accLower = (t.accountName || '').toLowerCase();
    const toAccLower = (t.toAccountName || '').toLowerCase();
    const saleIdLower = (t.saleId || '').toLowerCase();
    const refLower = (t.reference || '').toLowerCase();
    const idLower = t.id.toLowerCase();
    const displayIdLower = (t.displayId || '').toLowerCase();

    const matchesSearch = idLower.includes(searchLower) ||
      displayIdLower.includes(searchLower) ||
      saleIdLower.includes(searchLower) ||
      refLower.includes(searchLower) ||
      descLower.includes(searchLower) ||
      catLower.includes(searchLower) ||
      accLower.includes(searchLower) ||
      toAccLower.includes(searchLower) ||
      createdByLower.includes(searchLower);

    let matchesDate = true;
    if (dateRange.start) {
      const tDate = parseTimestampDate(t.timestamp);
      const start = new Date(dateRange.start);
      start.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && tDate >= start;
    }
    if (dateRange.end) {
      const tDate = parseTimestampDate(t.timestamp);
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && tDate <= end;
    }

    let matchesPayment = true;
    if (paymentFilter !== 'all') {
      const selectedOption = dynamicPaymentOptions.find(opt => opt.id === paymentFilter || opt.id === getUnifiedMethodId(paymentFilter));
      const filterName = (selectedOption ? selectedOption.name : getPaymentMethodName(paymentFilter)).toLowerCase().trim();

      const matchesAccount = isMethodMatch(t.accountId, t.accountName, paymentFilter, filterName);
      const matchesToAccount = isMethodMatch(t.toAccountId, t.toAccountName, paymentFilter, filterName);

      let matchesSplit = false;
      if (t.paymentSplits && Array.isArray(t.paymentSplits)) {
        matchesSplit = t.paymentSplits.some((s: any) => isMethodMatch(s.methodId, s.methodName, paymentFilter, filterName));
      }

      matchesPayment = matchesAccount || matchesToAccount || matchesSplit;
    }

    return matchesSearch && matchesDate && matchesPayment;
  });

  const userLedger = useMemo(() => {
    const currentUserId = user?.uid || profile?.id;
    return filteredLedger.filter(t => {
      if (!currentUserId) return false;
      const createdByStr = (t.createdBy || '').toLowerCase();
      const uidStr = currentUserId.toLowerCase();
      const createdByNameStr = (t.createdByName || '').toLowerCase();
      const profileNameStr = (profile?.name || '').toLowerCase();

      return createdByStr === uidStr || (profileNameStr && createdByNameStr === profileNameStr);
    });
  }, [filteredLedger, user?.uid, profile?.id, profile?.name]);

  const displayedLedger = useMemo(() => {
    if (isAdmin || isManager) return filteredLedger;
    return userLedger;
  }, [filteredLedger, userLedger, isAdmin, isManager]);

  const kpiLedger = useMemo(() => {
    return kpiIncludeAll ? filteredLedger : userLedger;
  }, [kpiIncludeAll, filteredLedger, userLedger]);

  const clearFiltersForTab = (_tab = activeTab) => {
    setDateRange(getTodayDateRange());
    setPaymentFilter(financeCashId || 'cash');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const clearFilters = () => clearFiltersForTab(activeTab);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, paymentFilter, dateRange.start, dateRange.end]);

  const activeList = useMemo(() => {
    if (activeTab === 'sales') return filteredSales;
    if (activeTab === 'voids') return filteredVoids;
    if (activeTab === 'ledger') return displayedLedger;
    return filteredPendingSales;
  }, [activeTab, filteredSales, filteredVoids, displayedLedger, filteredPendingSales]);

  const totalPages = Math.ceil(activeList.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return activeList.slice(start, start + pageSize);
  }, [activeList, currentPage, pageSize]);

  useEffect(() => {
    if (paymentFilter === 'cash' && financeCashId !== 'cash') {
      setPaymentFilter(financeCashId);
    }
  }, [financeCashId, paymentFilter]);

  const accountTotals = (() => {
    const totals: { [accountId: string]: { name: string; amount: number; type: string } } = {};
    
    // Initialize with cash account from Finance
    const cashName = financeCashAccount?.name || 'Cash';
    totals[financeCashId] = { name: cashName, amount: 0, type: 'cash' };

    // Initialize configured paymentOptions
    paymentOptions.forEach(opt => {
      const unifiedId = getUnifiedMethodId(opt.id);
      if (unifiedId === financeCashId) {
        return; // Merge/avoid duplicate 'Cash' options in KPI list
      }
      totals[opt.id] = { name: opt.name, amount: 0, type: opt.type };
    });

    const activeSales = filteredSales.filter(s => s.status !== 'voided');

    activeSales.forEach(sale => {
      if (sale.paymentSplits && sale.paymentSplits.length > 0) {
        sale.paymentSplits.forEach(split => {
          const rawId = split.methodId || '';
          if (!rawId) return;
          const mId = getUnifiedMethodId(rawId) || rawId;
          if (!totals[mId]) {
            totals[mId] = { 
              name: mId === financeCashId ? cashName : (split.methodName || mId), 
              amount: 0, 
              type: mId === financeCashId ? 'cash' : 'ewallet' 
            };
          }
          totals[mId].amount += split.amount || 0;
        });
      } else {
        const rawId = sale.paymentMethod || '';
        if (!rawId) return;
        const mId = getUnifiedMethodId(rawId) || rawId;
        if (!totals[mId]) {
          const opt = paymentOptions.find(o => o.id === mId);
          const acc = accounts.find(a => a.id === mId);
          totals[mId] = { 
            name: mId === financeCashId ? cashName : (opt?.name || acc?.name || mId), 
            amount: 0, 
            type: mId === financeCashId ? 'cash' : (opt?.type || acc?.type || 'ewallet') 
          };
        }
        totals[mId].amount += sale.total || 0;
      }
    });

    return Object.values(totals);
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Sales & Void History</h1>
          <p className="text-slate-500">View and manage past sales, voided transactions, and account ledgers.</p>
        </div>
        <Button variant="outline" className="gap-2 bg-white" onClick={handleExportCSV}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            className="pl-10 bg-white" 
            placeholder={
              activeTab === 'sales' ? "Search by Sale ID, Customer, or Product..." : 
              activeTab === 'voids' ? "Search by Sale ID, Customer, Staff, or Product..." : 
              activeTab === 'ledger' ? "Search ledger by description, account, category..." :
              "Search pending payments by Customer or ID..."
            } 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button 
            variant="outline" 
            className={cn(
              "gap-2 bg-white flex-1 sm:flex-none",
              (dateRange.start || dateRange.end) && "border-indigo-600 text-indigo-600"
            )}
            onClick={() => setIsFilterDialogOpen(true)}
          >
            <CalendarIcon className="w-4 h-4" />
            Date Range
          </Button>
          {(activeTab === 'sales' || activeTab === 'ledger') && (
            <Button 
              variant="outline" 
              className={cn(
                "gap-2 bg-white flex-1 sm:flex-none",
                paymentFilter !== 'all' && "border-indigo-600 text-indigo-600"
              )}
              onClick={() => setIsFilterDialogOpen(true)}
            >
              <Filter className="w-4 h-4" />
              Payment
            </Button>
          )}
          {(searchTerm || dateRange.start || dateRange.end || paymentFilter !== 'all') && (
            <Button variant="ghost" className="text-xs text-slate-500 hover:text-rose-600 h-10 px-2" onClick={clearFilters}>
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Payment Method KPIs */}
      {activeTab === 'sales' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          {/* Cash KPI */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Cash Sales
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded">Active Range</span>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900">
                {settings.currency}{accountTotals.filter(a => a.type === 'cash').reduce((sum, a) => sum + a.amount, 0).toFixed(2)}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-1">
              {accountTotals.filter(a => a.type === 'cash').map((acc, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-500">
                  <span>{acc.name}</span>
                  <span className="font-bold text-slate-800">{settings.currency}{acc.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* E-Wallet KPI */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                E-Wallet Sales
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded">Active Range</span>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900">
                {settings.currency}{accountTotals.filter(a => a.type === 'ewallet').reduce((sum, a) => sum + a.amount, 0).toFixed(2)}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-1">
              {accountTotals.filter(a => a.type === 'ewallet').length > 0 ? (
                accountTotals.filter(a => a.type === 'ewallet').map((acc, i) => (
                  <div key={i} className="flex justify-between text-xs text-slate-500">
                    <span>{acc.name}</span>
                    <span className="font-bold text-slate-800">{settings.currency}{acc.amount.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 italic">No e-wallet sales in this range</div>
              )}
            </div>
          </div>

          {/* Bank Transfer KPI */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Bank Sales
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded">Active Range</span>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900">
                {settings.currency}{accountTotals.filter(a => a.type === 'bank' || a.type === 'card').reduce((sum, a) => sum + a.amount, 0).toFixed(2)}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-1">
              {accountTotals.filter(a => a.type === 'bank' || a.type === 'card').length > 0 ? (
                accountTotals.filter(a => a.type === 'bank' || a.type === 'card').map((acc, i) => (
                  <div key={i} className="flex justify-between text-xs text-slate-500">
                    <span>{acc.name}</span>
                    <span className="font-bold text-slate-800">{settings.currency}{acc.amount.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 italic">No bank transfer sales in this range</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-[#1A2B4B]" />
              <span>KPI Summary Mode:</span>
              <span className="text-slate-500 font-normal">
                {kpiIncludeAll 
                  ? 'Showing store-wide totals for all transactions' 
                  : 'Showing totals for my transactions only'}
              </span>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <span className="text-xs font-semibold text-slate-600">
                {kpiIncludeAll ? 'All Transactions' : 'My Totals Only'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={kpiIncludeAll}
                onClick={() => setKpiIncludeAll(!kpiIncludeAll)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#D4AF37]",
                  kpiIncludeAll ? "bg-[#1A2B4B]" : "bg-slate-300"
                )}
                title="Toggle KPI values between All Transactions and My Totals Only"
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    kpiIncludeAll ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>

          {!isAdmin && !isManager && (
            <div className="flex items-center gap-2.5 p-3 bg-indigo-50/90 border border-indigo-100 rounded-2xl text-xs text-indigo-900 font-medium">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                <strong>Staff Access View:</strong> The table below displays transactions created by your account. Use the switch above to toggle the KPI summary between store-wide totals and your personal totals.
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {/* Total Inflow KPI */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/60 shadow-xs p-2.5 sm:p-5 space-y-1 sm:space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-0">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-1">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight sm:tracking-wider flex items-center gap-1 sm:gap-1.5 truncate">
                  <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                    <ArrowDownLeft className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </span>
                  <span className="truncate">Cash In</span>
                </span>
                <span className="text-[9px] sm:text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 sm:px-2 py-0.5 rounded w-fit shrink-0">
                  {kpiIncludeAll ? 'All Store' : 'My Cash In'}
                </span>
              </div>
              <div>
                <span className="text-sm sm:text-2xl font-black text-slate-900 truncate block">
                  {settings.currency}{kpiLedger.filter(t => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0).toFixed(2)}
                </span>
              </div>
              <div className="hidden md:block pt-2 border-t border-slate-100 text-[11px] text-slate-400 truncate">
                Aggregate of sales receipts and reverse return adjustments.
              </div>
            </div>

            {/* Total Outflow KPI */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/60 shadow-xs p-2.5 sm:p-5 space-y-1 sm:space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-0">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-1">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight sm:tracking-wider flex items-center gap-1 sm:gap-1.5 truncate">
                  <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                    <ArrowUpRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </span>
                  <span className="truncate">Cash Out</span>
                </span>
                <span className="text-[9px] sm:text-[10px] bg-rose-50 text-rose-700 font-bold px-1.5 sm:px-2 py-0.5 rounded w-fit shrink-0">
                  {kpiIncludeAll ? 'All Store' : 'My Cash Out'}
                </span>
              </div>
              <div>
                <span className="text-sm sm:text-2xl font-black text-slate-900 truncate block">
                  {settings.currency}{kpiLedger.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0).toFixed(2)}
                </span>
              </div>
              <div className="hidden md:block pt-2 border-t border-slate-100 text-[11px] text-slate-400 truncate">
                Aggregate of sales returns, void deductions, and recorded expenses.
              </div>
            </div>

            {/* Net Balance Change KPI */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/60 shadow-xs p-2.5 sm:p-5 space-y-1 sm:space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-0">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-1">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight sm:tracking-wider flex items-center gap-1 sm:gap-1.5 truncate">
                  <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                    <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </span>
                  <span className="truncate">Net Impact</span>
                </span>
                <span className="text-[9px] sm:text-[10px] bg-indigo-50 text-indigo-700 font-bold px-1.5 sm:px-2 py-0.5 rounded w-fit shrink-0">
                  {kpiIncludeAll ? 'Store Tally' : 'My Tally'}
                </span>
              </div>
              <div>
                {(() => {
                  const inflow = kpiLedger.filter(t => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0);
                  const outflow = kpiLedger.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);
                  const net = inflow - outflow;
                  return (
                    <span className={cn(
                      "text-sm sm:text-2xl font-black truncate block",
                      net >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {net >= 0 ? '+' : '-'}{settings.currency}{Math.abs(net).toFixed(2)}
                    </span>
                  );
                })()}
              </div>
              <div className="hidden md:block pt-2 border-t border-slate-100 text-[11px] text-slate-400 truncate">
                Net movement in and out (transfers neutral to overall cash).
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => {
            setActiveTab('sales');
            clearFiltersForTab('sales');
          }}
          className={cn(
            "pb-3 pt-1 px-4 text-sm font-bold border-b-2 transition-all relative",
            activeTab === 'sales'
              ? "border-indigo-600 text-indigo-600 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          Sales Transactions
        </button>
        <button
          onClick={() => {
            setActiveTab('voids');
            clearFiltersForTab('voids');
          }}
          className={cn(
            "pb-3 pt-1 px-4 text-sm font-bold border-b-2 transition-all relative",
            activeTab === 'voids'
              ? "border-indigo-600 text-indigo-600 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          Void History
        </button>
        {(isAdmin || isManager) && (
          <button
            onClick={() => {
              setActiveTab('pending');
              clearFiltersForTab('pending');
            }}
            className={cn(
              "pb-3 pt-1 px-4 text-sm font-bold border-b-2 transition-all relative flex items-center gap-1.5",
              activeTab === 'pending'
                ? "border-rose-600 text-rose-600 font-extrabold"
                : "border-transparent text-slate-500 hover:text-rose-600"
            )}
          >
            Pending Payments
            {pendingSales.length > 0 && (
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
        )}
        <button
          onClick={() => {
            setActiveTab('ledger');
            clearFiltersForTab('ledger');
          }}
          className={cn(
            "pb-3 pt-1 px-4 text-sm font-bold border-b-2 transition-all relative",
            activeTab === 'ledger'
              ? "border-indigo-600 text-indigo-600 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          Unified Ledger (New)
        </button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden w-full max-w-full">
        <div className="w-full overflow-x-auto min-w-0">
          <Table className="w-full text-xs min-w-[700px]">
            {activeTab === 'sales' ? (
            <>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Sale ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">Loading transactions...</TableCell>
                  </TableRow>
                ) : filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-slate-500">No transactions found.</TableCell>
                  </TableRow>
                ) : (
              (paginatedList as Sale[]).map((sale) => (
                <TableRow key={sale.id} className="hover:bg-slate-50/50">
                  <TableCell className="whitespace-nowrap">
                    <div className="font-medium text-slate-900">
                      {format(sale.timestamp.toDate(), 'MMM dd, yyyy')}
                    </div>
                    <div className="text-xs text-slate-500">
                      {format(sale.timestamp.toDate(), 'HH:mm:ss')}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{sale.id.substring(0, 8)}...</TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-900">{sale.customerDetails?.name || 'Walk-In'}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{sale.customerDetails?.city}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-none">
                      {locations.find(l => l.id === sale.locationId)?.name || 'Unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-slate-600">
                    {usersList.find(u => u.id === sale.staffId)?.name || (sale as any).staffName || 'Staff'}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-900 max-w-[200px] truncate">
                      {sale.items.map(i => i.name).join(', ')}
                    </div>
                    <div className="text-xs text-slate-500">{sale.items.length} items</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className={cn(
                        "capitalize border-slate-200 font-medium w-fit",
                        sale.status === 'voided' ? "bg-rose-50 text-rose-600 border-rose-200" : 
                        sale.status === 'returned' ? "bg-blue-50 text-blue-600 border-blue-200" :
                        sale.status === 'partially_returned' ? "bg-[#EEF2F6] text-[#475569] border-slate-200" :
                        sale.status === 'pending' ? "bg-amber-50 text-amber-600 border-amber-200" :
                        sale.status === 'pending_promo_approval' ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse" :
                        sale.status === 'pending_total_approval' ? "bg-indigo-100 text-indigo-800 border-indigo-300 animate-pulse" :
                        "bg-emerald-50 text-emerald-600 border-emerald-200"
                      )}>
                        {sale.status === 'voided' ? 'Voided' :
                         sale.status === 'returned' ? 'Returned' :
                         sale.status === 'partially_returned' ? 'Partially Returned' :
                         sale.status === 'pending' ? 'Pending' :
                         sale.status === 'pending_promo_approval' ? 'Pending Promo' :
                         sale.status === 'pending_total_approval' ? 'Pending Total' : 'Completed'}
                      </Badge>
                      
                      {sale.paymentSplits?.some(s => s.reference) && (
                        <div className="flex flex-col gap-0.5 mt-0.5 max-w-[150px]">
                          {sale.paymentSplits.filter(s => s.reference).map((s, idx) => (
                            <span key={idx} className="text-[9px] font-mono text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded leading-none border border-indigo-100/30 truncate" title={`${s.methodName}: ${s.reference}`}>
                              Ref: {s.reference}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-slate-900">{settings.currency}{(sale.total ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {(sale.status === 'pending_promo_approval' || sale.status === 'pending_total_approval') && (isAdmin || isManager) && (
                        <Button 
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] h-7 px-2 font-bold uppercase tracking-wider rounded-lg shadow-sm"
                          onClick={() => handleApprovePromo(sale)}
                          disabled={approvingPromoId === sale.id}
                        >
                          {approvingPromoId === sale.id ? 'Approving...' : 'Approve'}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setSelectedSale(sale)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          </>
          ) : activeTab === 'voids' ? (
            <>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Sale / Void ID</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Voided Items</TableHead>
                  <TableHead>Voided Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">Loading void history...</TableCell>
                  </TableRow>
                ) : filteredVoids.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-slate-500">No voided transactions found.</TableCell>
                  </TableRow>
                ) : (
                  (paginatedList as Sale[]).map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-slate-50/50">
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {format(parseTimestampDate(sale.timestamp), 'MMM dd, yyyy')}
                        </div>
                        <div className="text-xs text-slate-500">
                          {format(parseTimestampDate(sale.timestamp), 'HH:mm:ss')}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-[#1A2B4B]">
                        #{sale.id.substring(0, 8)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary" className="bg-indigo-50 text-[#1A2B4B] hover:bg-slate-100 border-none">
                          {locations.find(l => l.id === sale.locationId)?.name || (sale as any).locationName || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-slate-800">
                        {sale.customerDetails?.name || 'Walk-in Customer'}
                      </TableCell>
                      <TableCell className="text-slate-600 text-xs font-medium">
                        {usersList.find(u => u.id === sale.staffId)?.name || (sale as any).staffName || 'Staff'}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-900 max-w-[200px] truncate" title={sale.items?.map(i => `${i.name} (x${i.quantity})`).join(', ')}>
                          {sale.items?.map(i => `${i.name} (x${i.quantity})`).join(', ') || 'No items'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-rose-600 mb-1">{settings.currency}{(sale.total ?? 0).toFixed(2)}</div>
                        <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200 capitalize font-medium text-[10px] py-0 px-1.5">
                          Voided
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" title="View Details" onClick={() => setSelectedSale(sale)}>
                          <Eye className="w-4 h-4 text-slate-500 hover:text-indigo-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </>
          ) : activeTab === 'ledger' ? (
            <>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[14%] px-3 py-3 text-xs font-bold text-slate-700">Date & Time</TableHead>
                  <TableHead className="w-[12%] px-3 py-3 text-xs font-bold text-slate-700">Transaction ID</TableHead>
                  <TableHead className="w-[11%] px-3 py-3 text-xs font-bold text-slate-700">Category</TableHead>
                  <TableHead className="w-[25%] px-3 py-3 text-xs font-bold text-slate-700">Description</TableHead>
                  <TableHead className="w-[14%] px-3 py-3 text-xs font-bold text-slate-700">Account</TableHead>
                  <TableHead className="w-[12%] px-3 py-3 text-right text-xs font-bold text-slate-700">Money In (+)</TableHead>
                  <TableHead className="w-[12%] px-3 py-3 text-right text-xs font-bold text-slate-700">Money Out (-)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-slate-500">Loading transactions...</TableCell>
                  </TableRow>
                ) : displayedLedger.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                      No transactions found for the selected period and payment mode.
                    </TableCell>
                  </TableRow>
                ) : (
                  (paginatedList as any[]).map((t) => {
                    const isIncome = t.type === 'income';
                    const isExpense = t.type === 'expense';
                    const isTransfer = t.type === 'transfer';
                    const date = parseTimestampDate(t.timestamp);

                    return (
                      <TableRow key={t.id} className="hover:bg-slate-50/50">
                        <TableCell className="px-3 py-2.5 text-xs overflow-hidden whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {format(date, 'MMM dd, yyyy')}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {format(date, 'HH:mm:ss')}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500 px-3 py-2.5 truncate" title={t.displayId || t.id}>
                          <div>{(() => {
                            const raw = t.displayId || (t.id.startsWith('salerecord_') ? t.id.replace(/^salerecord_/, '') : t.id);
                            return raw.length > 12 ? `${raw.substring(0, 10)}...` : raw;
                          })()}</div>
                          {t.reference && t.reference !== (t.displayId || t.id) && (
                            <div className="text-[10px] text-indigo-600 truncate" title={t.reference}>Ref: {t.reference}</div>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 overflow-hidden">
                          <Badge variant="outline" className={cn(
                            "capitalize font-bold text-[10px] px-2 py-0.5 truncate max-w-full",
                            isIncome ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            isExpense ? "bg-rose-50 text-rose-700 border-rose-200" :
                            "bg-blue-50 text-blue-700 border-blue-200"
                          )}>
                            {t.category || t.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-slate-800 text-xs font-medium overflow-hidden">
                          <div className="line-clamp-2" title={t.description || 'No description'}>
                            {t.description || 'No description'}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-xs font-semibold text-slate-700 overflow-hidden">
                          {isTransfer ? (
                            <div className="flex items-center gap-1 text-blue-600">
                              <span className="truncate">{t.accountName || 'Unknown'}</span>
                              <ArrowLeftRight className="w-3 h-3 shrink-0" />
                              <span className="truncate">{t.toAccountName || 'Unknown'}</span>
                            </div>
                          ) : (
                            <span className="truncate block">{t.accountName || 'Cash'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600 text-xs px-3 py-2.5 whitespace-nowrap">
                          {isIncome ? `+${settings.currency}${(t.amount || 0).toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-bold text-rose-600 text-xs px-3 py-2.5 whitespace-nowrap">
                          {isExpense ? `-${settings.currency}${(t.amount || 0).toFixed(2)}` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </>
          ) : (
            <>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Sale ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">Loading pending payments...</TableCell>
                  </TableRow>
                ) : filteredPendingSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-slate-500">No pending payments found.</TableCell>
                  </TableRow>
                ) : (
                  (paginatedList as Sale[]).map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-slate-50/50">
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {format(sale.timestamp.toDate(), 'MMM dd, yyyy')}
                        </div>
                        <div className="text-xs text-slate-500">
                          {format(sale.timestamp.toDate(), 'HH:mm:ss')}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{sale.id.substring(0, 8)}...</TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{sale.customerDetails?.name || 'Walk-In'}</div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{sale.customerDetails?.city}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-none">
                          {locations.find(l => l.id === sale.locationId)?.name || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-600">
                        {usersList.find(u => u.id === sale.staffId)?.name || (sale as any).staffName || 'Staff'}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-900 max-w-[200px] truncate">
                          {sale.items.map(i => i.name).join(', ')}
                        </div>
                        <div className="text-xs text-slate-500">{sale.items.length} items</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize border-slate-200 font-medium bg-amber-50 text-amber-600 border-amber-200 animate-pulse">
                          Pending
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold text-slate-900">{settings.currency}{(sale.total ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedSale(sale)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </>
          )}
        </Table>

        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={activeList.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={size => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      </div>
    </div>

    {/* Filter Dialog */}
      <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-indigo-600" />
              Advanced Filters
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <Label className="text-xs uppercase font-black text-slate-400 tracking-widest">Date Range</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] text-slate-500">From</Label>
                  <Input 
                    type="date" 
                    value={dateRange.start} 
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="h-10 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] text-slate-500">To</Label>
                  <Input 
                    type="date" 
                    value={dateRange.end} 
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="h-10 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase font-black text-slate-400 tracking-widest">Payment Method</Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  {dynamicPaymentOptions.map(opt => (
                    <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              <Button onClick={() => setIsFilterDialogOpen(false)} className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 rounded-xl font-bold">
                Apply Filters
              </Button>
              <Button variant="ghost" onClick={clearFilters} className="text-slate-500 font-bold">
                Reset All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sale Detail Dialog */}
      <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Sale Details</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Customer</p>
                  <p className="text-sm font-bold text-indigo-600">{selectedSale.customerDetails?.name || 'Walk-In'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Location</p>
                  <p className="text-sm">{locations.find(l => l.id === selectedSale.locationId)?.name || 'Unknown'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Transaction ID</p>
                  <p className="font-mono text-xs text-slate-700">{selectedSale.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Sold By</p>
                  <p className="text-sm font-medium text-slate-700">
                    {usersList.find(u => u.id === selectedSale.staffId)?.name || selectedSale.staffName || 'Staff'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Order Type</p>
                  <Badge variant="outline" className={cn(
                    "mt-0.5 font-bold uppercase text-[9px] tracking-wide",
                    selectedSale.saleType === 'online' 
                      ? "text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-50" 
                      : "text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-50"
                  )}>
                    {selectedSale.saleType === 'online' ? '🌐 Online' : '🏪 In-Store'}
                  </Badge>
                </div>
                {selectedSale.saleType === 'online' && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Delivery Fee</p>
                    <p className="text-sm font-bold text-slate-800">
                      {settings.currency}{(selectedSale.deliveryFee ?? 0).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Transaction Date</span>
                <span className="text-xs font-semibold text-slate-800">
                  {format(selectedSale.timestamp.toDate(), 'MMM dd, yyyy HH:mm:ss')}
                </span>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSale.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">
                          <div>{item.name}</div>
                          {item.originalPrice !== item.price && (
                            <div className="text-[10px] text-muted-foreground line-through">
                              {settings.currency}{(item.originalPrice ?? 0).toFixed(2)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-[10px] text-slate-500 font-medium">
                          {item.tierId ? priceTiers.find(t => t.id === item.tierId)?.name || 'Custom Tier' : 'Retail'}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <div>{item.quantity}</div>
                          {item.returnedQuantity && item.returnedQuantity > 0 ? (
                            <div className="text-[10px] text-rose-500 font-bold whitespace-nowrap">
                              (-{item.returnedQuantity} returned)
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{settings.currency}{(item.subtotal ?? 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Gross Subtotal</span>
                  <span className="font-bold">{settings.currency}{(selectedSale.subtotal ?? 0).toFixed(2)}</span>
                </div>
                {selectedSale.discount > 0 && (
                  <div className="flex justify-between text-sm text-rose-500">
                    <span className="text-slate-500 font-medium">Promo Discount {selectedSale.promoCode ? `(${selectedSale.promoCode})` : ''}</span>
                    <span className="font-bold">-{settings.currency}{(selectedSale.discount ?? 0).toFixed(2)}</span>
                  </div>
                )}
                {selectedSale.saleType === 'online' && (
                  <div className="flex justify-between text-sm text-slate-600">
                    <span className="text-slate-500 font-medium">Delivery Fee</span>
                    <span className="font-bold">+{settings.currency}{(selectedSale.deliveryFee ?? 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] text-slate-400 italic">
                  <span>VAT Component (12% Included)</span>
                  <span>{settings.currency}{(selectedSale.tax ?? 0).toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-xl font-bold">
                  <span className="text-slate-900">Total Amount Due</span>
                  <span className="text-indigo-600 font-black">{settings.currency}{(selectedSale.total ?? 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-4 pt-4">
                <div className="space-y-3">
                  <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Payment Breakdown</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedSale.paymentSplits?.map((split, i) => (
                      <Badge key={i} variant="secondary" className="gap-1 flex-col items-start p-2 h-auto bg-slate-100 border-none">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#1A2B4B]" />
                          <span className="text-[10px] font-black uppercase text-[#1A2B4B]">{split.methodName}</span>
                        </div>
                        <span className="font-bold text-sm">{settings.currency}{(split.amount ?? 0).toFixed(2)}</span>
                        {split.reference && (
                          <div className="mt-1 px-1.5 py-0.5 bg-white/50 rounded border border-slate-200/50">
                            <span className="text-[9px] font-medium text-slate-500">Ref: {split.reference}</span>
                          </div>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "h-8 px-4 font-bold uppercase tracking-wider",
                      selectedSale.status === 'voided' 
                        ? "text-rose-600 border-rose-200 bg-rose-50" 
                        : selectedSale.status === 'returned'
                        ? "text-blue-600 border-blue-200 bg-blue-50"
                        : selectedSale.status === 'partially_returned'
                        ? "text-indigo-600 border-indigo-200 bg-indigo-50"
                        : selectedSale.status === 'pending'
                        ? "text-amber-600 border-amber-200 bg-amber-50"
                        : selectedSale.status === 'pending_promo_approval'
                        ? "text-amber-800 border-amber-300 bg-amber-100 animate-pulse"
                        : selectedSale.status === 'pending_total_approval'
                        ? "text-indigo-800 border-indigo-300 bg-indigo-100 animate-pulse"
                        : "text-emerald-600 border-emerald-200 bg-emerald-50"
                    )}
                  >
                    {selectedSale.status === 'voided' ? 'Voided' : 
                     selectedSale.status === 'returned' ? 'Returned' :
                     selectedSale.status === 'partially_returned' ? 'Partially Returned' :
                     selectedSale.status === 'pending' ? 'Pending' :
                     selectedSale.status === 'pending_promo_approval' ? 'Pending Promo' :
                     selectedSale.status === 'pending_total_approval' ? 'Pending Total' : 'Completed'}
                  </Badge>
                </div>
                <div className="flex justify-end gap-2">
                  {(selectedSale.status === 'pending_promo_approval' || selectedSale.status === 'pending_total_approval') && (isAdmin || isManager) && (
                    <Button 
                      variant="default"
                      size="sm"
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      onClick={() => {
                        handleApprovePromo(selectedSale);
                        setSelectedSale(null);
                      }}
                      disabled={approvingPromoId === selectedSale.id}
                    >
                      {approvingPromoId === selectedSale.id ? 'Approving...' : 'Approve Transaction'}
                    </Button>
                  )}
                  {selectedSale.status === 'pending' && (
                    <Button 
                      variant="default"
                      size="sm"
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      onClick={() => setIsPaymentDialogOpen(true)}
                    >
                      Collect Payment
                    </Button>
                  )}
                  {(isAdmin || isManager) && selectedSale.status !== 'voided' && selectedSale.status !== 'returned' && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2 border-amber-200 hover:bg-amber-50 text-amber-700 font-bold"
                        onClick={() => setIsReturnOpen(true)}
                      >
                        <Undo2 className="w-4 h-4" />
                        Return/Replace
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="gap-2"
                        onClick={() => handleOpenVoidDialog(selectedSale)}
                        disabled={isVoiding}
                      >
                        {isVoiding ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        Void Sale
                      </Button>
                    </>
                  )}
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrintReceipt(selectedSale)}>
                    <Download className="w-4 h-4" />
                    Receipt
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isPaymentDialogOpen} onOpenChange={(open) => {
        setIsPaymentDialogOpen(open);
        if (open && selectedSale) {
          const hasSplits = selectedSale.paymentSplits && selectedSale.paymentSplits.length > 0;
          const isSplit = hasSplits && (selectedSale.paymentMethod === 'split' || selectedSale.paymentSplits.length > 1);
          
          setIsSplitPayment(isSplit);
          if (hasSplits) {
            setPaymentSplits(selectedSale.paymentSplits.map(s => ({
              methodId: s.methodId,
              methodName: s.methodName,
              amount: s.amount,
              reference: s.reference || ''
            })));
            if (!isSplit) {
              setPaymentDetails({
                methodId: selectedSale.paymentSplits[0].methodId,
                reference: selectedSale.paymentSplits[0].reference || ''
              });
            }
          } else {
            setPaymentSplits([{ methodId: 'cash', methodName: 'Cash', amount: selectedSale.total, reference: '' }]);
            setPaymentDetails({ methodId: 'cash', reference: '' });
          }
        }
      }}>
        <DialogContent className={cn("transition-all duration-300", isSplitPayment ? "sm:max-w-[600px]" : "sm:max-w-[400px]")}>
          <DialogHeader>
            <DialogTitle className="flex justify-between items-center">
              Collect Payment
              <Button 
                variant="ghost" 
                size="sm" 
                className={cn("text-[10px] uppercase font-black tracking-widest", isSplitPayment ? "text-indigo-600 bg-indigo-50" : "text-slate-400")}
                onClick={() => setIsSplitPayment(!isSplitPayment)}
              >
                {isSplitPayment ? 'Single Payment' : 'Split Payment'}
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4 py-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Due</p>
                <p className="text-2xl font-black text-indigo-600 font-heading">{settings.currency}{selectedSale.total.toFixed(2)}</p>
              </div>

              {!isSplitPayment ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">Payment Method</Label>
                    <Select 
                      value={paymentDetails.methodId} 
                      onValueChange={(v) => setPaymentDetails({ ...paymentDetails, methodId: v })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select Method">
                          {paymentDetails.methodId === 'cash' ? 'Cash' : 
                          paymentDetails.methodId === 'card' ? 'Card' : 
                          (paymentOptions.find(o => o.id === paymentDetails.methodId)?.name || 'Select Method')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        {paymentOptions.map(opt => (
                          <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">Reference (Optional)</Label>
                    <Input 
                      placeholder="Ref # / Details" 
                      value={paymentDetails.reference}
                      onChange={(e) => setPaymentDetails({ ...paymentDetails, reference: e.target.value })}
                      className="h-10"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-3">
                    {paymentSplits.map((split, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                        <div className="col-span-4 space-y-1">
                          <Label className="text-[10px]">Method</Label>
                          <Select 
                            value={split.methodId} 
                            onValueChange={(v) => {
                              const opt = paymentOptions.find(o => o.id === v);
                              const newSplits = [...paymentSplits];
                              newSplits[index].methodId = v;
                              newSplits[index].methodName = v === 'cash' ? 'Cash' : v === 'card' ? 'Card' : opt?.name || v;
                              setPaymentSplits(newSplits);
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs bg-white">
                              <SelectValue placeholder="Method">
                                {split.methodId === 'cash' ? 'Cash' : 
                                 split.methodId === 'card' ? 'Card' : 
                                 (paymentOptions.find(o => o.id === split.methodId)?.name || split.methodId)}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="card">Card</SelectItem>
                              {paymentOptions.map(o => (
                                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3 space-y-1">
                          <Label className="text-[10px]">Amount</Label>
                          <Input 
                            type="number" 
                            className="h-9 text-xs bg-white" 
                            value={split.amount}
                            onChange={(e) => {
                              const newSplits = [...paymentSplits];
                              newSplits[index].amount = Number(e.target.value);
                              setPaymentSplits(newSplits);
                            }}
                          />
                        </div>
                        <div className="col-span-4 space-y-1">
                          <Label className="text-[10px]">Reference</Label>
                          <Input 
                            className="h-9 text-xs bg-white" 
                            placeholder="Ref #" 
                            value={split.reference || ''}
                            onChange={(e) => {
                              const newSplits = [...paymentSplits];
                              newSplits[index].reference = e.target.value;
                              setPaymentSplits(newSplits);
                            }}
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-rose-500 hover:bg-rose-50"
                            onClick={() => setPaymentSplits(prev => prev.filter((_, i) => i !== index))}
                            disabled={paymentSplits.length <= 1}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="w-full h-8 text-[10px] uppercase font-black tracking-widest gap-2 bg-white border-dashed"
                      onClick={() => setPaymentSplits([...paymentSplits, { methodId: 'cash', methodName: 'Cash', amount: 0, reference: '' }])}
                    >
                      <Plus className="w-3 h-3" /> Add Method
                    </Button>

                    <div className={cn(
                      "p-3 rounded-lg border text-center transition-colors",
                      Math.abs(paymentSplits.reduce((s, i) => s + (i.amount || 0), 0) - selectedSale.total) < 0.01 
                        ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                        : "bg-rose-50 border-rose-100 text-rose-700"
                    )}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1">Payment Coverage</p>
                      <p className="text-sm font-black">
                        {settings.currency}{paymentSplits.reduce((s, i) => s + (i.amount || 0), 0).toFixed(2)} / {settings.currency}{selectedSale.total.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>Cancel</Button>
                <Button 
                  className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white px-8" 
                  onClick={handleMarkAsPaid}
                  disabled={isPaying || (isSplitPayment && Math.abs(paymentSplits.reduce((s, i) => s + (i.amount || 0), 0) - selectedSale.total) > 0.01)}
                >
                  {isPaying ? 'Processing...' : 'Confirm Payment'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReturnForm 
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        sale={selectedSale}
        paymentOptions={paymentOptions}
        onSuccess={() => {
          setSelectedSale(null);
          setIsReturnOpen(false);
        }}
      />

      <Dialog open={isVoidDialogOpen} onOpenChange={(open) => {
        setIsVoidDialogOpen(open);
        if (!open) {
          setSaleToVoid(null);
          setVoidAccountId('');
        }
      }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <XCircle className="w-5 h-5 text-rose-600" />
              Void Sale & Refund
            </DialogTitle>
          </DialogHeader>
          {saleToVoid && (
            <div className="space-y-4 py-4">
              <div className="bg-rose-50 p-3 rounded-lg border border-rose-100 mb-2">
                <p className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-1">Total Refund Amount</p>
                <p className="text-2xl font-black text-rose-600 font-heading">{settings.currency}{(saleToVoid.total ?? 0).toFixed(2)}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="void-account" className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  Deduct Refund From Account
                </Label>
                <Select
                  value={voidAccountId}
                  onValueChange={(v) => setVoidAccountId(v)}
                >
                  <SelectTrigger id="void-account" className="h-9 text-xs bg-slate-50 border-slate-200">
                    <SelectValue placeholder="Select financial account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(acc => acc.active !== false).map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}{isAdmin ? ` (Balance: ${settings.currency}${(acc.balance ?? 0).toFixed(2)})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-700 pb-1 border-b border-slate-200/60">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">Items Returning to Stock:</span>
                  <span className="text-[11px] text-slate-600">
                    {saleToVoid.locationId ? (locations.find(l => l.id === saleToVoid.locationId)?.name || 'Branch') : 'Assigned Location'}
                  </span>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {(saleToVoid.items || []).map((item, idx) => {
                    const returned = item.returnedQuantity || 0;
                    const net = Math.max(0, item.quantity - returned);
                    return (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-slate-700 truncate max-w-[200px]">{item.name}</span>
                        <span className="font-bold text-emerald-600 shrink-0">+{net} pcs</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                  Voiding marks this sale as <strong>Voided</strong>, returns product units back into live inventory, and deducts the refund from the selected account.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsVoidDialogOpen(false)} disabled={isVoiding}>
              Cancel
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
              onClick={handleConfirmVoid}
              disabled={isVoiding || !voidAccountId}
            >
              {isVoiding ? 'Voiding...' : 'Confirm Void'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedReturn} onOpenChange={() => setSelectedReturn(null)}>
        <DialogContent className="sm:max-w-[550px] bg-slate-50">
          <DialogHeader className="bg-white p-6 pb-4 border-b border-slate-100 rounded-t-xl">
            <div>
              <DialogTitle className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-indigo-600" />
                Return Transaction Details
              </DialogTitle>
              <p className="text-xs text-slate-500 mt-1 font-mono">ID: {selectedReturn?.id}</p>
            </div>
          </DialogHeader>

          {selectedReturn && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Original Sale ID</Label>
                  <p className="font-mono text-xs text-slate-700 mt-0.5">{selectedReturn.originalSaleId}</p>
                </div>
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Return Date</Label>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5">
                    {format(selectedReturn.timestamp.toDate(), 'MM/dd/yyyy HH:mm:ss')}
                  </p>
                </div>
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Processed By</Label>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5">
                    {usersList.find(u => u.id === selectedReturn.staffId)?.name || selectedReturn.staffName || 'Staff'}
                  </p>
                </div>
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Overall Reason</Label>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5">{selectedReturn.reason || 'N/A'}</p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-3">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Returned Items</Label>
                <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
                  {selectedReturn.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-b-0">
                      <div>
                        <p className="font-semibold text-slate-800">{item.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Type: <span className="capitalize font-bold text-indigo-600">{item.returnType}</span>
                          {item.restock && <span className="ml-2 text-emerald-600 font-bold">(Restocked)</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800">x{item.quantity}</p>
                        <p className="text-[10px] text-slate-500">{settings.currency}{item.price.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#1A2B4B] text-white p-4 rounded-xl flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Total Refund Processed</p>
                  <p className="text-3xl font-black mt-0.5">{settings.currency}{(selectedReturn.totalRefund ?? 0).toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-widest">Refund Account</p>
                  <p className="text-xs font-bold mt-1">
                    {accounts.find(a => a.id === selectedReturn.refundAccountId)?.name || selectedReturn.refundMethod || 'N/A'}
                  </p>
                </div>
              </div>

              {selectedReturn.status === 'voided' && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-lg text-xs font-bold flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  This return transaction has been reversed / voided.
                </div>
              )}
            </div>
          )}

          <DialogFooter className="bg-white p-6 border-t border-slate-100 rounded-b-xl gap-2 sm:gap-0">
            {(isAdmin || isManager) && selectedReturn && selectedReturn.status !== 'voided' && (
              <Button 
                variant="destructive"
                className="font-bold gap-2"
                onClick={() => {
                  setReturnToReverse(selectedReturn);
                  let defaultAccId = selectedReturn.refundAccountId || '';
                  if (!defaultAccId && accounts.length > 0) {
                    defaultAccId = accounts[0].id;
                  }
                  setReverseAccountId(defaultAccId);
                  setIsReverseDialogOpen(true);
                }}
              >
                <Undo2 className="w-4 h-4" />
                Reverse Return
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedReturn(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReverseDialogOpen} onOpenChange={(open) => {
        setIsReverseDialogOpen(open);
        if (!open) {
          setReturnToReverse(null);
          setReverseAccountId('');
        }
      }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Undo2 className="w-5 h-5 text-rose-600" />
              Reverse Return Transaction
            </DialogTitle>
          </DialogHeader>
          {returnToReverse && (
            <div className="space-y-4 py-4">
              <div className="bg-rose-50 p-3 rounded-lg border border-rose-100">
                <p className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-1">Total Refund to Retrieve</p>
                <p className="text-2xl font-black text-rose-600 font-heading">{settings.currency}{(returnToReverse.totalRefund ?? 0).toFixed(2)}</p>
              </div>

              {returnToReverse.totalRefund > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="reverse-account" className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Adjust Refund Balance From Account
                  </Label>
                  <Select
                    value={reverseAccountId}
                    onValueChange={(v) => setReverseAccountId(v)}
                  >
                    <SelectTrigger id="reverse-account" className="h-9 text-xs bg-slate-50 border-slate-200">
                      <SelectValue placeholder="Select financial account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.filter(acc => acc.active !== false).map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name}{isAdmin ? ` (Balance: ${settings.currency}${(acc.balance ?? 0).toFixed(2)})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded border border-slate-100">
                Reversing this transaction will restore the original sale status to <strong>Completed</strong>, decrement the restored stock (if any item was restocked), and add the refunded amount back to the selected finance account's balance as a cancellation.
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsReverseDialogOpen(false)} disabled={isReversing}>
              Cancel
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
              onClick={handleConfirmReverseReturn}
              disabled={isReversing || (returnToReverse?.totalRefund > 0 && !reverseAccountId)}
            >
              {isReversing ? 'Reversing...' : 'Confirm Reversal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesHistory;
