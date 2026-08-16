import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  where,
  Timestamp,
  doc,
  updateDoc,
  increment,
  addDoc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FinancialAccount, AuditLog, Transaction } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Wallet, 
  Building2, 
  CreditCard, 
  Banknote,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  History,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  Trash2,
  Edit,
  AlertCircle
} from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLocations } from '@/contexts/LocationContext';
import { supabaseService } from '@/lib/supabase-service';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
  DialogTrigger
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { logAction } from '@/lib/audit';
import { reconcileSystemData } from '@/lib/reconciliation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ExpensesTab } from '@/components/ExpensesTab';
import { TransfersTab } from '@/components/TransfersTab';

export const Finance: React.FC = () => {
  const { settings } = useSettings();
  const { user, profile, isAdmin, isManager } = useAuth();
  const { locations, selectedLocationId } = useLocations();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  const [newAccount, setNewAccount] = useState({
    name: '',
    type: 'bank' as 'bank' | 'ewallet' | 'cash' | 'card',
    initialBalance: 0
  });

  const [newTransaction, setNewTransaction] = useState({
    amount: 0,
    type: 'expense' as 'income' | 'expense',
    accountId: '',
    locationId: '',
    category: 'General',
    description: ''
  });

  // Tab control state
  const isManagerOrAdmin = isAdmin || isManager || ['admin', 'manager'].includes(profile?.role || '');
  const [activeTab, setActiveTab] = useState<'accounts' | 'expenses' | 'transfers' | 'history'>(
    isAdmin ? 'accounts' : 'expenses'
  );

  useEffect(() => {
    setActiveTab(isAdmin ? 'accounts' : 'expenses');
  }, [isAdmin]);

  // Expense tab form state
  const [transLimit, setTransLimit] = useState<number>(300);
  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseAccountId, setExpenseAccountId] = useState<string>('');
  const [expenseLocationId, setExpenseLocationId] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState<string>('Supplies');
  const [expenseDescription, setExpenseDescription] = useState<string>('');
  const [expenseSearch, setExpenseSearch] = useState<string>('');

  // Fund Transfer state
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [sourceAccountId, setSourceAccountId] = useState<string>('');
  const [destAccountId, setDestAccountId] = useState<string>('');
  const [transferDescription, setTransferDescription] = useState<string>('');

  useEffect(() => {
    if (selectedLocationId && selectedLocationId !== 'all') {
      setNewTransaction(prev => ({ ...prev, locationId: selectedLocationId }));
    }
  }, [selectedLocationId]);

  useEffect(() => {
    if (!profile) return;

    const primaryAdmins = ['vanhuxley24@gmail.com', 'v4peavenue@gmail.com'];
    const userEmail = user?.email?.toLowerCase() || '';

    const isStaffUser = ['admin', 'manager', 'staff'].includes(profile.role) || primaryAdmins.includes(userEmail);
                        
    const isManagerUser = ['admin', 'manager'].includes(profile.role) || primaryAdmins.includes(userEmail) || isAdmin || isManager;

    let unsubAccounts = () => {};
    let unsubTrans = () => {};
    let unsubLogs = () => {};

    if (isStaffUser) {
      unsubAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
        const accountsList = snapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, ...data, active: data.active !== false } as FinancialAccount;
        });
        setAccounts(accountsList);
        if (accountsList.length > 0) {
          setNewTransaction(prev => prev.accountId ? prev : { ...prev, accountId: accountsList[0].id });
          setExpenseAccountId(prev => prev ? prev : accountsList[0].id);
        }
      }, (error) => {
        console.warn("Finance: Error listening to accounts:", error);
      });

      let qTrans;
      if (dateRange?.startDate && dateRange?.endDate) {
        const startTs = Timestamp.fromDate(new Date(`${dateRange.startDate}T00:00:00`));
        const endTs = Timestamp.fromDate(new Date(`${dateRange.endDate}T23:59:59`));
        qTrans = query(
          collection(db, 'financialTransactions'),
          where('timestamp', '>=', startTs),
          where('timestamp', '<=', endTs),
          orderBy('timestamp', 'desc'),
          limit(2000)
        );
      } else {
        qTrans = query(
          collection(db, 'financialTransactions'),
          orderBy('timestamp', 'desc'),
          limit(transLimit)
        );
      }
      unsubTrans = onSnapshot(qTrans, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        
        const deduplicated: Transaction[] = [];
        const seenKeys = new Set<string>();

        for (const t of list as any[]) {
          // Keep all non-sale expense transactions by unique document ID
          if (t.type === 'expense' && !t.saleId) {
            deduplicated.push(t as Transaction);
            continue;
          }

          const refKey = (t.saleId || t.reference || t.description?.match(/#([a-zA-Z0-9]{8})/)?.[1] || '').substring(0, 8);
          const timeMin = t.timestamp?.seconds ? Math.floor(t.timestamp.seconds / 300) : 0;
          
          const key = refKey 
            ? `${refKey}_${t.accountId}_${t.type}_${Number(t.amount || 0).toFixed(2)}`
            : `${(t.description || '').toLowerCase()}_${t.accountId}_${t.type}_${Number(t.amount || 0).toFixed(2)}_${timeMin}`;

          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            deduplicated.push(t as Transaction);
          }
        }

        setTransactions(deduplicated);
        if (!isManagerUser) {
          setLoading(false);
        }
      }, (error) => {
        console.warn("Finance: Error listening to financialTransactions:", error);
        if (!isManagerUser) {
          setLoading(false);
        }
      });
    }

    if (isManagerUser) {
      const qLogs = query(
        collection(db, 'audit_logs'), 
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      unsubLogs = onSnapshot(qLogs, (snapshot) => {
        const financeLogs = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as AuditLog))
          .filter(log => 
            log.action.includes('CREATE_SALE') || 
            log.action.includes('RECEIVE_STOCK') || 
            log.action.includes('ITEM_RETURN') ||
            log.action.includes('UPDATE_ACCOUNT') ||
            log.action.includes('CREATE_PAYMENT')
          )
          .slice(0, 50);
        setLogs(financeLogs);
        setLoading(false);
      }, (error) => {
        console.warn("Finance: Error listening to audit_logs:", error);
        setLoading(false);
      });
    } else if (!isStaffUser) {
      setLoading(false);
    }

    return () => {
      unsubAccounts();
      unsubTrans();
      unsubLogs();
    };
  }, [profile?.id, user?.uid, isAdmin, isManager, transLimit, dateRange]);

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'bank': return <Building2 className="w-5 h-5 text-blue-500" />;
      case 'ewallet': return <Wallet className="w-5 h-5 text-purple-500" />;
      case 'cash': return <Banknote className="w-5 h-5 text-emerald-500" />;
      case 'card': return <CreditCard className="w-5 h-5 text-orange-500" />;
      default: return <Wallet className="w-5 h-5 text-slate-500" />;
    }
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance ?? 0), 0);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccount.name.trim()) return;

    if (accounts.some(a => a.name.toLowerCase() === newAccount.name.trim().toLowerCase())) {
      toast.error('Account with this name already exists');
      return;
    }

    try {
      const paymentRef = await addDoc(collection(db, 'paymentOptions'), {
        name: newAccount.name,
        type: newAccount.type,
        active: true
      });

      await setDoc(doc(db, 'accounts', paymentRef.id), {
        name: newAccount.name,
        type: newAccount.type,
        balance: Number(newAccount.initialBalance),
        lastUpdated: Timestamp.now(),
        active: true
      });

      await logAction(profile, 'CREATE_ACCOUNT', `Added financial account: ${newAccount.name} with initial balance ${newAccount.initialBalance}`, paymentRef.id, 'account');
      
      supabaseService.saveFinancialTransaction({
        account_id: paymentRef.id,
        type: 'income',
        category: 'Initial Balance',
        amount: Number(newAccount.initialBalance),
        description: `Initial balance for ${newAccount.name}`
      }).catch(() => {});
      
      toast.success('Account added successfully');
      setIsAddAccountOpen(false);
      setNewAccount({ name: '', type: 'bank', initialBalance: 0 });
    } catch (error) {
      toast.error('Failed to add account');
      console.error(error);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    try {
      await updateDoc(doc(db, 'paymentOptions', editingAccount.id), {
        name: editingAccount.name,
        type: editingAccount.type
      });

      await updateDoc(doc(db, 'accounts', editingAccount.id), {
        name: editingAccount.name,
        type: editingAccount.type,
        balance: Number(editingAccount.balance),
        lastUpdated: Timestamp.now()
      });

      await logAction(profile, 'UPDATE_ACCOUNT', `Updated financial account: ${editingAccount.name}`, editingAccount.id, 'account');
      
      toast.success('Account updated successfully');
      setEditingAccount(null);
    } catch (error) {
      toast.error('Failed to update account');
      console.error(error);
    }
  };

  const handleToggleAccountActive = async (account: FinancialAccount) => {
    if (!isAdmin) {
      toast.error('Only admins can toggle account status');
      return;
    }

    const newActiveState = account.active === false ? true : false;

    try {
      await updateDoc(doc(db, 'accounts', account.id), {
        active: newActiveState,
        lastUpdated: Timestamp.now()
      });

      // Also update paymentOptions if it exists
      try {
        await updateDoc(doc(db, 'paymentOptions', account.id), {
          active: newActiveState
        });
      } catch (err) {
        console.warn("Could not update matching payment option:", err);
      }

      await logAction(
        profile, 
        'UPDATE_ACCOUNT', 
        `Toggled account active status for ${account.name} to ${newActiveState ? 'active' : 'inactive'}`, 
        account.id, 
        'account'
      );

      toast.success(`Account ${account.name} is now ${newActiveState ? 'active' : 'inactive'}`);
    } catch (error) {
      toast.error('Failed to toggle account status');
      console.error(error);
    }
  };

  const handleDeleteAccount = async (id: string, name: string) => {
    if (!isAdmin && !isManager) {
      toast.error('You do not have permission to delete this');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${name}? This will also remove it as a payment method.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'accounts', id));
      await deleteDoc(doc(db, 'paymentOptions', id));
      await logAction(profile, 'DELETE_ACCOUNT', `Deleted financial account and payment option: ${name}`, id, 'account');
      toast.success('Account deleted successfully');
    } catch (error) {
      toast.error('Failed to delete account');
      console.error(error);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTransaction.amount <= 0 || !newTransaction.accountId) {
      toast.error('Please enter a valid amount and account');
      return;
    }

    const account = accounts.find(a => a.id === newTransaction.accountId);
    if (!account) return;

    const location = locations.find(l => l.id === newTransaction.locationId);

    const balanceAdjustment = newTransaction.type === 'income' ? Number(newTransaction.amount) : -Number(newTransaction.amount);
    
    // Check for insufficient funds if it's an expense
    if (newTransaction.type === 'expense' && (account.balance || 0) < Number(newTransaction.amount)) {
      toast.error(`Insufficient funds in ${account.name}. Available: ${settings.currency}${(account.balance || 0).toLocaleString()}`);
      return;
    }

    const newBalance = (account.balance || 0) + balanceAdjustment;

    try {
      const transRef = await addDoc(collection(db, 'financialTransactions'), {
        amount: Number(newTransaction.amount),
        type: newTransaction.type,
        accountId: newTransaction.accountId,
        accountName: account.name,
        locationId: newTransaction.locationId || null,
        locationName: location?.name || null,
        category: newTransaction.category,
        description: newTransaction.description,
        timestamp: Timestamp.now(),
        createdBy: profile?.id || 'anonymous',
        createdByName: profile?.name || 'Staff',
        accountBalance: newBalance
      });

      await updateDoc(doc(db, 'accounts', newTransaction.accountId), {
        balance: increment(balanceAdjustment),
        lastUpdated: Timestamp.now()
      });

      await logAction(
        profile, 
        'MANUAL_TRANSACTION', 
        `${newTransaction.type === 'income' ? 'Income' : 'Expense'}: ${newTransaction.description} (${settings.currency}${newTransaction.amount}) on ${account.name}`, 
        transRef.id, 
        'transaction'
      );

      supabaseService.saveFinancialTransaction({
        id: transRef.id,
        account_id: newTransaction.accountId,
        type: newTransaction.type,
        category: newTransaction.category,
        amount: Number(newTransaction.amount),
        description: newTransaction.description,
        created_by: profile?.id || 'anonymous',
        location_id: newTransaction.locationId || null
      }).catch(() => {});

      toast.success('Transaction recorded successfully');
      setIsAddTransactionOpen(false);
      setNewTransaction({
        amount: 0,
        type: 'expense',
        accountId: accounts[0]?.id || '',
        locationId: selectedLocationId !== 'all' ? selectedLocationId : '',
        category: 'General',
        description: ''
      });
    } catch (error) {
      toast.error('Failed to record transaction');
      console.error(error);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseAmount <= 0 || !expenseAccountId) {
      toast.error('Please enter a valid amount and select an account');
      return;
    }

    const account = accounts.find(a => a.id === expenseAccountId);
    if (!account) {
      toast.error('Account not found');
      return;
    }

    // Check for insufficient funds
    if ((account.balance || 0) < expenseAmount) {
      toast.error(`Insufficient funds in ${account.name}. Available: ${settings.currency}${(account.balance || 0).toLocaleString()}`);
      return;
    }

    const locationIdResolved = expenseLocationId || profile?.locationId || null;
    const location = locations.find(l => l.id === locationIdResolved);
    const newBalance = (account.balance || 0) - expenseAmount;

    try {
      const transRef = await addDoc(collection(db, 'financialTransactions'), {
        amount: expenseAmount,
        type: 'expense',
        accountId: expenseAccountId,
        accountName: account.name,
        locationId: locationIdResolved,
        locationName: location?.name || 'Central',
        category: expenseCategory,
        description: expenseDescription,
        timestamp: Timestamp.now(),
        createdBy: profile?.id || 'anonymous',
        createdByName: profile?.name || user?.email || 'Staff',
        accountBalance: newBalance
      });

      await updateDoc(doc(db, 'accounts', expenseAccountId), {
        balance: increment(-expenseAmount),
        lastUpdated: Timestamp.now()
      });

      await logAction(
        profile, 
        'MANUAL_TRANSACTION', 
        `Expense: ${expenseDescription} (${settings.currency}${expenseAmount}) on ${account.name}`, 
        transRef.id, 
        'transaction'
      );

      toast.success('Expense recorded successfully!');
      
      // Reset expense form
      setExpenseAmount(0);
      setExpenseDescription('');
      setExpenseCategory('Supplies');
      setExpenseLocationId('');
    } catch (error) {
      toast.error('Failed to record expense');
      console.error(error);
    }
  };

  const handleFundTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferAmount <= 0 || !sourceAccountId || !destAccountId) {
      toast.error('Please enter a valid amount and select both accounts');
      return;
    }
    if (sourceAccountId === destAccountId) {
      toast.error('Source and destination accounts must be different');
      return;
    }

    const sourceAccount = accounts.find(a => a.id === sourceAccountId);
    const destAccount = accounts.find(a => a.id === destAccountId);
    if (!sourceAccount || !destAccount) {
      toast.error('Accounts not found');
      return;
    }

    if ((sourceAccount.balance || 0) < transferAmount) {
      toast.error(`Insufficient funds in ${sourceAccount.name}. Available: ${settings.currency}${(sourceAccount.balance || 0).toLocaleString()}`);
      return;
    }

    try {
      // 1. Deduct from source account
      await updateDoc(doc(db, 'accounts', sourceAccountId), {
        balance: increment(-transferAmount),
        lastUpdated: Timestamp.now()
      });

      // 2. Add to destination account
      await updateDoc(doc(db, 'accounts', destAccountId), {
        balance: increment(transferAmount),
        lastUpdated: Timestamp.now()
      });

      // 3. Record transfer transaction in database
      const transRef = await addDoc(collection(db, 'financialTransactions'), {
        amount: transferAmount,
        type: 'transfer',
        accountId: sourceAccountId,
        accountName: sourceAccount.name,
        toAccountId: destAccountId,
        toAccountName: destAccount.name,
        category: 'Fund Transfer',
        description: transferDescription || `Fund transfer from ${sourceAccount.name} to ${destAccount.name}`,
        timestamp: Timestamp.now(),
        createdBy: profile?.id || 'anonymous',
        createdByName: profile?.name || user?.email || 'Staff',
        accountBalance: (sourceAccount.balance || 0) - transferAmount,
        destAccountBalance: (destAccount.balance || 0) + transferAmount
      });

      await logAction(
        profile,
        'FUND_TRANSFER',
        `Transferred ${settings.currency}${transferAmount} from ${sourceAccount.name} to ${destAccount.name}`,
        transRef.id,
        'transaction'
      );

      toast.success('Funds transferred successfully!');
      
      // Reset transfer form
      setTransferAmount(0);
      setSourceAccountId('');
      setDestAccountId('');
      setTransferDescription('');
    } catch (error) {
      toast.error('Failed to complete transfer');
      console.error(error);
    }
  };

  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  const filteredExpenses = expenseTransactions.filter(t => {
    const searchLower = expenseSearch.toLowerCase();
    return (t.description || '').toLowerCase().includes(searchLower) ||
           (t.category || '').toLowerCase().includes(searchLower) ||
           (t.accountName || '').toLowerCase().includes(searchLower) ||
           (t.createdByName || '').toLowerCase().includes(searchLower);
  });

  const transferTransactions = transactions.filter(t => t.type === 'transfer');

  return (
    <div className="space-y-5 p-1">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1A2B4B] tracking-tight font-heading flex items-center gap-1.5">
            Financial Overview
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Track your banks, e-wallets, and cash on hand balances.</p>
        </div>
        
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={isAddTransactionOpen} onOpenChange={setIsAddTransactionOpen}>
              <DialogTrigger 
                render={
                  <Button className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white gap-1.5 h-8 px-3 rounded-lg shadow-sm text-xs font-bold transition-all">
                    <Plus className="w-3.5 h-3.5" />
                    New Transaction
                  </Button>
                } 
              />
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>New Manual Transaction</DialogTitle>
                  <DialogDescription>
                    Record expenses or income not tracked automatically.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddTransaction} className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Transaction Type</Label>
                      <Select 
                        value={newTransaction.type} 
                        onValueChange={(v: any) => setNewTransaction({ ...newTransaction, type: v })}
                      >
                        <SelectTrigger className="bg-slate-50">
                          <SelectValue>
                            {newTransaction.type === 'income' ? 'Income / Deposit' : 'Expense / Withdrawal'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">Income / Deposit</SelectItem>
                          <SelectItem value="expense">Expense / Withdrawal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount ({settings.currency})</Label>
                      <Input 
                        type="number"
                        step="0.01"
                        value={newTransaction.amount || ''}
                        onChange={(e) => setNewTransaction({ ...newTransaction, amount: Number(e.target.value) })}
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="trans-acc">Source/Destination Account</Label>
                      <Select 
                        required
                        value={newTransaction.accountId} 
                        onValueChange={(v: any) => setNewTransaction({ ...newTransaction, accountId: v })}
                      >
                        <SelectTrigger id="trans-acc" className="bg-slate-50">
                          <SelectValue placeholder="Select account">
                            {accounts.find(a => a.id === newTransaction.accountId)?.name || 'Select account'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.filter(acc => acc.active !== false).map(acc => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name} ({settings.currency}{acc.balance.toLocaleString()})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trans-loc">Location (Optional)</Label>
                      <Select 
                        value={newTransaction.locationId || "central"} 
                        onValueChange={(v: any) => setNewTransaction({ ...newTransaction, locationId: v === "central" ? "" : v })}
                      >
                        <SelectTrigger id="trans-loc" className="bg-slate-50">
                          <SelectValue placeholder="Select branch">
                            {newTransaction.locationId 
                              ? (locations.find(l => l.id === newTransaction.locationId)?.name || 'Select branch') 
                              : 'None / Central'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="central">None / Central</SelectItem>
                          {locations.map(loc => (
                            <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="trans-cat">Category</Label>
                    <Select 
                      required
                      value={newTransaction.category} 
                      onValueChange={(v: any) => setNewTransaction({ ...newTransaction, category: v })}
                    >
                      <SelectTrigger id="trans-cat" className="bg-slate-50">
                        <SelectValue>
                          {newTransaction.category}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="General">General</SelectItem>
                        <SelectItem value="Rent">Rent</SelectItem>
                        <SelectItem value="Utilities">Utilities</SelectItem>
                        <SelectItem value="Salary">Salary</SelectItem>
                        <SelectItem value="Supplies">Supplies</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                        <SelectItem value="Marketing">Marketing</SelectItem>
                        <SelectItem value="Taxes">Taxes</SelectItem>
                        <SelectItem value="Delivery/Shipping Fee">Delivery/Shipping Fee</SelectItem>
                        <SelectItem value="Personal">Personal / Drawings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input 
                      value={newTransaction.description}
                      onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
                      placeholder="Brief details about this transaction"
                      required
                    />
                  </div>

                  <DialogFooter className="pt-4 mt-auto border-t">
                    <Button type="button" variant="outline" onClick={() => setIsAddTransactionOpen(false)}>Cancel</Button>
                    <Button type="submit" className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white">Record Transaction</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isAddAccountOpen} onOpenChange={setIsAddAccountOpen}>
              <DialogTrigger 
                render={
                  <Button variant="outline" className="gap-1.5 h-8 px-3 rounded-lg border-[#D4AF37]/25 hover:bg-[#D4AF37]/5 text-slate-700 text-xs font-semibold">
                    <Plus className="w-3.5 h-3.5" />
                    Add Account
                  </Button>
                } 
              />
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add Financial Account</DialogTitle>
                  <DialogDescription>
                    Add a new bank or e-wallet account to track your money.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddAccount} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="acc-name">Account Name</Label>
                    <Input 
                      id="acc-name" 
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                      placeholder="e.g. BDO Savings, GCash Personal" 
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="acc-type">Type</Label>
                      <Select 
                        required
                        value={newAccount.type} 
                        onValueChange={(v: any) => setNewAccount({ ...newAccount, type: v })}
                      >
                        <SelectTrigger id="acc-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank">Bank</SelectItem>
                          <SelectItem value="ewallet">E-Wallet</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="acc-balance">Initial Balance ({settings.currency})</Label>
                      <Input 
                        id="acc-balance"
                        type="number"
                        value={newAccount.initialBalance}
                        onChange={(e) => setNewAccount({ ...newAccount, initialBalance: Number(e.target.value) })}
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter className="pt-4 mt-auto border-t">
                    <Button type="button" variant="outline" onClick={() => setIsAddAccountOpen(false)}>Cancel</Button>
                    <Button type="submit" className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white">Add Account</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-px scrollbar-none mb-1">
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={cn(
              "px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
              activeTab === 'accounts' 
                ? "border-[#1A2B4B] text-[#1A2B4B] font-extrabold" 
                : "border-transparent text-slate-400 hover:text-slate-600 font-medium"
            )}
          >
            Accounts Overview
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('expenses')}
          className={cn(
            "px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
            activeTab === 'expenses' 
              ? "border-[#1A2B4B] text-[#1A2B4B] font-extrabold" 
              : "border-transparent text-slate-400 hover:text-slate-600 font-medium"
          )}
        >
          Expenses & Claims
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('transfers')}
            className={cn(
              "px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
              activeTab === 'transfers' 
                ? "border-[#1A2B4B] text-[#1A2B4B] font-extrabold" 
                : "border-transparent text-slate-400 hover:text-slate-600 font-medium"
            )}
          >
            Fund Transfers
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={cn(
              "px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
              activeTab === 'history' 
                ? "border-[#1A2B4B] text-[#1A2B4B] font-extrabold" 
                : "border-transparent text-slate-400 hover:text-slate-600 font-medium"
            )}
          >
            Transaction Ledger
          </button>
        )}
      </div>

      {activeTab === 'accounts' && isAdmin && (
        <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1 border-none shadow-md bg-gradient-to-br from-[#1C2D4E] to-[#0D1627] text-white overflow-hidden relative rounded-xl hover:scale-[1.01] transition-all duration-300">
          <div className="absolute top-0 right-0 p-3 opacity-5">
            <TrendingUp className="w-24 h-24" />
          </div>
          <CardHeader className="pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37] opacity-90">Total Liquidity</CardTitle>
          </CardHeader>
          <CardContent className="pb-3.5 px-3.5">
            <p className="text-3xl font-black font-heading mb-1.5 text-white">
              {settings.currency}{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1 text-[9px] font-bold bg-white/10 w-fit px-2 py-0.5 rounded-full border border-white/5 text-white/80">
              <History className="w-2.5 h-2.5" />
              Real-time synchronization active
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2 grid sm:grid-cols-2 gap-3">
          {accounts.map(acc => (
            <Card key={acc.id} className="bg-white border border-slate-200/50 hover:border-[#D4AF37]/50 shadow-sm hover:shadow-md transition-all duration-300 rounded-xl group relative overflow-hidden">
              <CardContent className="p-3.5">
                <div className="flex justify-between items-start mb-2.5">
                  <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-[#1A2B4B]/5 transition-colors">
                    {getAccountIcon(acc.type)}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-slate-400 hover:text-[#1A2B4B] rounded-md"
                      onClick={() => setEditingAccount(acc)}
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-slate-400 hover:text-rose-600 rounded-md"
                      onClick={() => handleDeleteAccount(acc.id, acc.name)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <Badge variant="outline" className="text-[8px] uppercase font-black tracking-tighter opacity-60 border-slate-200">
                    {acc.type}
                  </Badge>
                </div>
                <h3 className="font-bold text-xs text-[#1A2B4B] mb-0.5">{acc.name}</h3>
                <p className="text-xl font-black text-[#1A2B4B] font-heading">
                  {settings.currency}{(acc.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-wider",
                      acc.active !== false ? "text-emerald-600" : "text-slate-400"
                    )}>
                      {acc.active !== false ? "Active" : "Inactive"}
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => handleToggleAccountActive(acc)}
                        className={cn(
                          "relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none",
                          acc.active !== false ? "bg-emerald-500" : "bg-slate-200"
                        )}
                        title="Toggle active status"
                      >
                        <span
                          className={cn(
                            "pointer-events-none block h-3 w-3 rounded-full bg-white shadow ring-0 transition-transform",
                            acc.active !== false ? "translate-x-3.5" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <span>Updated:</span>
                    <span className="font-mono text-slate-500 normal-case font-normal">
                      {acc.lastUpdated ? format(acc.lastUpdated.toDate(), 'MMM dd, HH:mm') : 'N/A'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {accounts.length === 0 && !loading && (
            <div className="col-span-2 p-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">No financial accounts found.</p>
              <p className="text-xs text-slate-400 mt-1">Add accounts to track your money.</p>
            </div>
          )}
        </div>
      </div>
      )}

      {activeTab === 'expenses' && (
        <ExpensesTab 
          accounts={accounts} 
          transactions={transactions} 
          transLimit={transLimit}
          dateRange={dateRange}
          onApplyDateRange={(startDate, endDate) => setDateRange({ startDate, endDate })}
          onResetDateRange={() => {
            setDateRange(null);
            setTransLimit(300);
          }}
          onExpandLimit={() => setTransLimit(1500)}
          onResetLimit={() => {
            setDateRange(null);
            setTransLimit(300);
          }}
        />
      )}

      {activeTab === 'transfers' && isAdmin && (
        <TransfersTab accounts={accounts} transactions={transactions} />
      )}

      {activeTab === 'history' && isAdmin && (
        <div className="grid lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
            <div>
              <CardTitle className="text-xl font-black font-heading text-slate-900">Transaction History</CardTitle>
              <CardDescription>Recent financial records including manual entries and system logs.</CardDescription>
            </div>
            <History className="w-5 h-5 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="hidden md:block w-full overflow-x-auto min-w-0">
              <Table className="w-full table-fixed text-xs min-w-full">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100 bg-slate-50/50">
                  <TableHead className="w-[38%] text-[10px] uppercase font-black tracking-widest text-slate-400 px-3 py-2.5">Transaction</TableHead>
                  <TableHead className="w-[22%] text-[10px] uppercase font-black tracking-widest text-slate-400 px-3 py-2.5">Account / Type</TableHead>
                  <TableHead className="w-[14%] text-[10px] uppercase font-black tracking-widest text-slate-400 px-3 py-2.5">Amount</TableHead>
                  <TableHead className="w-[13%] text-[10px] uppercase font-black tracking-widest text-slate-400 px-3 py-2.5">Ending Balance</TableHead>
                  <TableHead className="w-[13%] text-[10px] uppercase font-black tracking-widest text-slate-400 px-3 py-2.5">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ...transactions.map(t => ({ 
                    id: t.id, 
                    type: 'TRANSACTION', 
                    transType: t.type, 
                    details: t.description, 
                    category: t.category, 
                    accountName: t.accountName, 
                    locationName: t.locationName,
                    amount: t.amount, 
                    timestamp: t.timestamp,
                    accountBalance: t.accountBalance
                  })),
                  ...logs.map(l => ({ 
                    id: l.id, 
                    type: 'LOG', 
                    action: l.action, 
                    details: l.details, 
                    timestamp: l.timestamp,
                    amount: 0 // Logs might not have an intuitive singular amount
                  }))
                ]
                .sort((a, b) => {
                  const getMillis = (ts: any) => {
                    if (!ts) return 0;
                    if (typeof ts.toMillis === 'function') return ts.toMillis();
                    if (ts instanceof Date) return ts.getTime();
                    if (typeof ts === 'number') return ts;
                    if (typeof ts === 'string') return new Date(ts).getTime();
                    return 0;
                  };
                  return getMillis(b.timestamp) - getMillis(a.timestamp);
                })
                .slice(0, 50)
                .map((item) => {
                  const isIncome = item.type === 'TRANSACTION' 
                    ? item.transType === 'income' 
                    : (item.action === 'CREATE_SALE' || item.action === 'ITEM_RETURN');
                  const isExpense = item.type === 'TRANSACTION' 
                    ? item.transType === 'expense' 
                    : (item.action === 'RECEIVE_STOCK');
                  
                  return (
                    <TableRow key={item.id} className="hover:bg-slate-50/50 border-slate-50">
                      <TableCell className="px-3 py-2.5 overflow-hidden">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`p-1.5 rounded-lg shrink-0 ${isIncome ? 'bg-emerald-50 text-emerald-600' : isExpense ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-600'}`}>
                            {isIncome ? <TrendingUp className="w-3.5 h-3.5" /> : isExpense ? <TrendingDown className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
                          </div>
                          <div className="flex flex-col min-w-0 overflow-hidden">
                            <span className="text-xs font-bold text-slate-700 truncate" title={item.details}>{item.details}</span>
                            {item.type === 'TRANSACTION' && <span className="text-[9px] text-slate-400 font-medium uppercase tracking-tighter truncate">{item.category}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 overflow-hidden">
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-[#1A2B4B] truncate">
                            {item.type === 'TRANSACTION' ? item.accountName : 'System Event'}
                            {item.type === 'TRANSACTION' && item.locationName && (
                              <span className="ml-1 text-slate-400 font-normal">
                                • {item.locationName}
                              </span>
                            )}
                          </span>
                          <span className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter truncate">
                            {item.type === 'TRANSACTION' ? item.transType : item.action?.replace('_', ' ')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 whitespace-nowrap">
                        {item.type === 'TRANSACTION' ? (
                          <span className={`font-mono text-xs font-bold ${isIncome ? 'text-emerald-600' : isExpense ? 'text-rose-600' : 'text-slate-600'}`}>
                            {isIncome ? '+' : '-'}{settings.currency}{(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Audit Log</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 whitespace-nowrap">
                        {item.type === 'TRANSACTION' && item.accountBalance !== undefined ? (
                          <span className="font-mono text-xs font-bold text-slate-500">
                            {settings.currency}{(item.accountBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">--</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-[11px] text-slate-500 font-mono whitespace-nowrap">
                        {item.timestamp ? (
                          format(typeof item.timestamp.toDate === 'function' ? item.timestamp.toDate() : new Date(item.timestamp), 'MMM dd, p')
                        ) : (
                          '--:--'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>

            {/* Mobile-optimized dense stacked transaction/event bento items */}
            <div className="block md:hidden space-y-3">
              {[
                ...transactions.map(t => ({ 
                  id: t.id, 
                  type: 'TRANSACTION', 
                  transType: t.type, 
                  details: t.description, 
                  category: t.category, 
                  accountName: t.accountName, 
                  locationName: t.locationName,
                  amount: t.amount, 
                  timestamp: t.timestamp,
                  accountBalance: t.accountBalance
                })),
                ...logs.map(l => ({ 
                  id: l.id, 
                  type: 'LOG', 
                  action: l.action, 
                  details: l.details, 
                  timestamp: l.timestamp,
                  amount: 0
                }))
              ]
              .sort((a, b) => {
                const getMillis = (ts: any) => {
                  if (!ts) return 0;
                  if (typeof ts.toMillis === 'function') return ts.toMillis();
                  if (ts instanceof Date) return ts.getTime();
                  if (typeof ts === 'number') return ts;
                  if (typeof ts === 'string') return new Date(ts).getTime();
                  return 0;
                };
                return getMillis(b.timestamp) - getMillis(a.timestamp);
              })
              .slice(0, 50)
              .map((item, index) => {
                const isIncome = item.type === 'TRANSACTION' 
                  ? item.transType === 'income' 
                  : (item.action === 'CREATE_SALE' || item.action === 'ITEM_RETURN');
                const isExpense = item.type === 'TRANSACTION' 
                  ? item.transType === 'expense' 
                  : (item.action === 'RECEIVE_STOCK');
                
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.012, 0.2) }}
                    className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`p-1.5 rounded-lg shrink-0 ${isIncome ? 'bg-emerald-50 text-emerald-600' : isExpense ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-600'}`}>
                          {isIncome ? <TrendingUp className="w-3.5 h-3.5" /> : isExpense ? <TrendingDown className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{item.details}</p>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                            {item.type === 'TRANSACTION' ? item.category : item.type}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {item.type === 'TRANSACTION' ? (
                          <span className={`font-mono text-sm font-black ${isIncome ? 'text-emerald-600' : isExpense ? 'text-rose-600' : 'text-slate-600'}`}>
                            {isIncome ? '+' : '-'}{settings.currency}{(item.amount || 0).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Audit</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-slate-50/50 p-2 rounded-xl text-[11px] border border-slate-100 font-medium text-slate-600">
                      <div>
                        <span className="block text-[9px] text-slate-400 font-bold uppercase mb-0.5">Origin / Account</span>
                        <span className="font-bold text-slate-700 truncate block">
                          {item.type === 'TRANSACTION' ? item.accountName : 'System Event'}
                          {item.type === 'TRANSACTION' && item.locationName && ` (${item.locationName})`}
                        </span>
                      </div>
                      <div className="border-l border-slate-200 pl-2">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase mb-0.5">Balance / Action</span>
                        <span className="font-bold text-slate-700 truncate block">
                          {item.type === 'TRANSACTION' && item.accountBalance !== undefined ? (
                            `${settings.currency}${(item.accountBalance).toFixed(2)}`
                          ) : (
                            item.action?.replace('_', ' ') || '--'
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 font-semibold text-right">
                      {item.timestamp ? (
                        format(typeof item.timestamp.toDate === 'function' ? item.timestamp.toDate() : new Date(item.timestamp), 'MMM dd, yyyy - p')
                      ) : (
                        '--:--'
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-xl font-black font-heading text-slate-900">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
                <span>By Type</span>
                <span>Balance</span>
              </div>
              {['bank', 'ewallet', 'cash', 'card'].map(type => {
                const balance = accounts.filter(a => a.type === type).reduce((s, a) => s + (a.balance ?? 0), 0);
                if (balance === 0 && !accounts.some(a => a.type === type)) return null;
                return (
                  <div key={type} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-2">
                      {getAccountIcon(type)}
                      <span className="text-sm font-bold capitalize">{type}</span>
                    </div>
                    <span className="font-bold text-slate-900">{settings.currency}{balance.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-[#1A2B4B]/5 rounded-2xl border border-[#1A2B4B]/10">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-[#1A2B4B]" />
                <h4 className="text-sm font-black text-[#1A2B4B] uppercase tracking-tight">System Note</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Accounts are automatically managed based on your payment configuration. Visit System Settings to add or move accounts.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Edit Account Dialog */}
      <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>Update account details or adjust balance.</DialogDescription>
          </DialogHeader>
          {editingAccount && (
            <form onSubmit={handleUpdateAccount} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Account Name</Label>
                <Input 
                  id="edit-name" 
                  value={editingAccount.name}
                  onChange={(e) => setEditingAccount({ ...editingAccount, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-type">Type</Label>
                  <Select 
                    value={editingAccount.type} 
                    onValueChange={(v: any) => setEditingAccount({ ...editingAccount, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {editingAccount.type ? editingAccount.type.charAt(0).toUpperCase() + editingAccount.type.slice(1) : ''}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="ewallet">E-Wallet</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-balance">Balance ({settings.currency})</Label>
                  <Input 
                    id="edit-balance"
                    type="number"
                    step="0.01"
                    value={editingAccount.balance}
                    onChange={(e) => setEditingAccount({ ...editingAccount, balance: Number(e.target.value) })}
                  />
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setEditingAccount(null)}>Cancel</Button>
                <Button type="submit" className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white">Save Changes</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Finance;
