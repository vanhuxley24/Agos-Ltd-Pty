import React, { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useLocations } from '../contexts/LocationContext';
import { format, subDays, startOfMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DataTablePagination } from '@/components/DataTablePagination';
import { TrendingDown, Trash2, Database, AlertTriangle, RotateCcw, Calendar, Calculator, Loader2, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, increment, Timestamp, deleteDoc, getCountFromServer, query, where } from 'firebase/firestore';
import { logAction } from '@/lib/audit';
import { supabaseService } from '@/lib/supabase-service';
import { toast } from 'sonner';
import { FinancialAccount, Transaction } from '@/types';

interface ExpensesTabProps {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  transLimit?: number;
  dateRange?: { startDate: string; endDate: string } | null;
  onApplyDateRange?: (startDate: string, endDate: string) => void;
  onResetDateRange?: () => void;
  onExpandLimit?: () => void;
  onResetLimit?: () => void;
}

export const ExpensesTab: React.FC<ExpensesTabProps> = ({ 
  accounts, 
  transactions,
  transLimit = 300,
  dateRange,
  onApplyDateRange,
  onResetDateRange,
  onExpandLimit,
  onResetLimit
}) => {
  const { settings } = useSettings();
  const { user, profile, isAdmin, isManager } = useAuth();
  const { locations } = useLocations();
  const [showGuardrailModal, setShowGuardrailModal] = useState(false);

  // Date Range Read Estimator state
  const [filterStartDate, setFilterStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterEndDate, setFilterEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isCalculatingCount, setIsCalculatingCount] = useState<boolean>(false);
  const [exactReadCount, setExactReadCount] = useState<number | null>(null);

  const handleCalculateReadCost = async (sDate?: string, eDate?: string) => {
    const startStr = sDate || filterStartDate;
    const endStr = eDate || filterEndDate;

    if (!startStr || !endStr) {
      toast.error('Please select both Start Date and End Date');
      return;
    }

    if (new Date(startStr) > new Date(endStr)) {
      toast.error('Start Date cannot be after End Date');
      return;
    }

    setIsCalculatingCount(true);
    try {
      const startTs = Timestamp.fromDate(new Date(`${startStr}T00:00:00`));
      const endTs = Timestamp.fromDate(new Date(`${endStr}T23:59:59`));

      const countQuery = query(
        collection(db, 'financialTransactions'),
        where('timestamp', '>=', startTs),
        where('timestamp', '<=', endTs)
      );

      const snapshot = await getCountFromServer(countQuery);
      const count = snapshot.data().count;

      setExactReadCount(count);
      setShowGuardrailModal(true);
    } catch (error) {
      console.error('Error calculating document reads:', error);
      toast.error('Failed to calculate document count. Please verify date range.');
    } finally {
      setIsCalculatingCount(false);
    }
  };

  const handleApplyPreset = (presetKey: string) => {
    const now = new Date();
    let s = '';
    let e = format(now, 'yyyy-MM-dd');

    if (presetKey === 'today') {
      s = format(now, 'yyyy-MM-dd');
    } else if (presetKey === 'this_month') {
      s = format(startOfMonth(now), 'yyyy-MM-dd');
    } else if (presetKey === 'last_30_days') {
      s = format(subDays(now, 30), 'yyyy-MM-dd');
    } else if (presetKey === 'august_2026') {
      s = '2026-08-01';
      e = '2026-08-31';
    }

    setFilterStartDate(s);
    setFilterEndDate(e);
    handleCalculateReadCost(s, e);
  };

  const handleDeleteExpense = async (id: string, amount: number, accountId: string, description: string) => {
    if (!isAdmin) {
      toast.error('Only administrators are allowed to delete expenses');
      return;
    }

    const isConfirmed = window.confirm(`Are you sure you want to delete the expense: "${description}"? This will refund ${settings.currency}${amount} to the original account.`);
    if (!isConfirmed) return;

    try {
      // 1. Delete the transaction doc
      await deleteDoc(doc(db, 'financialTransactions', id));

      // 2. Refund original account balance
      await updateDoc(doc(db, 'accounts', accountId), {
        balance: increment(amount),
        lastUpdated: Timestamp.now()
      });

      // 3. Log action
      await logAction(
        profile, 
        'DELETE_TRANSACTION', 
        `Deleted expense: ${description} (${settings.currency}${amount}) and refunded to account.`, 
        id, 
        'transaction'
      );

      toast.success('Expense deleted and funds refunded successfully');
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete expense');
    }
  };

  // Form states
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseAccountId, setExpenseAccountId] = useState<string>(accounts[0]?.id || '');
  const [expenseLocationId, setExpenseLocationId] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState<string>('Supplies');
  const [expenseDescription, setExpenseDescription] = useState<string>('');
  const [expenseSearch, setExpenseSearch] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  React.useEffect(() => {
    if (accounts.length > 0 && !expenseAccountId) {
      setExpenseAccountId(accounts[0].id);
    }
  }, [accounts, expenseAccountId]);

  React.useEffect(() => {
    if (!isAdmin && profile?.locationId) {
      setExpenseLocationId(profile.locationId);
    }
  }, [profile, isAdmin]);

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
    if (!locationIdResolved) {
      toast.error('Please select a branch/location for this expense');
      return;
    }

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

      supabaseService.saveFinancialTransaction({
        id: transRef.id,
        account_id: expenseAccountId,
        type: 'expense',
        category: expenseCategory,
        amount: expenseAmount,
        description: expenseDescription,
        created_by: profile?.id || 'anonymous',
        location_id: locationIdResolved
      }).catch(() => {});

      toast.success('Expense recorded successfully!');
      
      // Reset expense form
      setExpenseAmount(0);
      setExpenseDescription('');
      setExpenseCategory('Supplies');
      setExpenseLocationId(!isAdmin && profile?.locationId ? profile.locationId : '');
    } catch (error) {
      toast.error('Failed to record expense');
      console.error(error);
    }
  };

  const expenseTransactions = transactions.filter(t => {
    if (t.type !== 'expense') return false;
    
    // Admins and Managers can view all store/location expenses
    if (isAdmin || isManager) {
      if (profile?.locationId) {
        return !t.locationId || t.locationId === profile.locationId;
      }
      return true;
    }

    // Staff view their own entries or location entries
    const isMyEntry = 
      (!!t.createdBy && (
        t.createdBy === profile?.id || 
        t.createdBy === user?.uid || 
        t.createdBy === profile?.email || 
        t.createdBy === user?.email
      )) ||
      (!!t.createdByName && (
        (!!profile?.name && t.createdByName.toLowerCase().trim() === profile.name.toLowerCase().trim()) ||
        (!!user?.displayName && t.createdByName.toLowerCase().trim() === user.displayName.toLowerCase().trim()) ||
        (!!user?.email && t.createdByName.toLowerCase().trim() === user.email.toLowerCase().trim()) ||
        (!!profile?.email && t.createdByName.toLowerCase().trim() === profile.email.toLowerCase().trim())
      ));

    if (profile?.locationId) {
      return !t.locationId || t.locationId === profile.locationId;
    }

    return isMyEntry;
  });
  const filteredExpenses = expenseTransactions.filter(t => {
    const searchLower = expenseSearch.toLowerCase();
    return (t.description || '').toLowerCase().includes(searchLower) ||
           (t.category || '').toLowerCase().includes(searchLower) ||
           (t.accountName || '').toLowerCase().includes(searchLower) ||
           (t.createdByName || '').toLowerCase().includes(searchLower);
  });

  return (
    <div className="space-y-6">
      {/* Date Range Query Guardrail & Estimator Card */}
      <Card className="w-full border border-slate-200/80 shadow-xs bg-gradient-to-r from-slate-50 via-white to-amber-50/20 rounded-xl">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Date Range Query Guardrail</h4>
                <Badge variant="outline" className="text-[10px] font-semibold bg-amber-100 text-amber-900 border-amber-200">
                  Firestore Cost Protection
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500">
                Filter expenses by date range. Before running the query, the system calculates exact matching document reads to prevent unexpected database charges.
              </p>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Presets:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyPreset('today')}
                className="h-7 text-[11px] px-2.5 py-0 border-slate-200 hover:bg-slate-100"
              >
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyPreset('this_month')}
                className="h-7 text-[11px] px-2.5 py-0 border-slate-200 hover:bg-slate-100"
              >
                This Month
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyPreset('last_30_days')}
                className="h-7 text-[11px] px-2.5 py-0 border-slate-200 hover:bg-slate-100"
              >
                Last 30 Days
              </Button>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-200/60 flex flex-col sm:flex-row items-end sm:items-center gap-3">
            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
              <div className="space-y-1 w-full sm:w-36">
                <Label className="text-[10px] font-bold uppercase text-slate-500">From Date</Label>
                <Input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="h-8 text-xs bg-white border-slate-200 rounded-lg"
                />
              </div>
              <div className="space-y-1 w-full sm:w-36">
                <Label className="text-[10px] font-bold uppercase text-slate-500">To Date</Label>
                <Input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="h-8 text-xs bg-white border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto ml-auto">
              <Button
                type="button"
                size="sm"
                disabled={isCalculatingCount}
                onClick={() => handleCalculateReadCost()}
                className="h-8 text-xs font-bold bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-lg gap-1.5 shadow-sm"
              >
                {isCalculatingCount ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Calculating Reads...
                  </>
                ) : (
                  <>
                    <Calculator className="w-3.5 h-3.5 text-amber-400" />
                    Estimate Read Cost & Query
                  </>
                )}
              </Button>

              {(dateRange || transLimit > 300) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResetDateRange}
                  className="h-8 text-xs font-bold text-slate-600 hover:bg-slate-100 border-slate-200 gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  Reset to Default
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Containers: Form + History Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Record Expense Form */}
        <Card className="lg:col-span-4 border border-slate-200/80 shadow-xs bg-white rounded-xl overflow-hidden h-fit">
          <CardHeader className="bg-slate-50/60 pb-4 border-b border-slate-100 rounded-t-xl">
            <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-rose-500" />
              Record New Expense
            </CardTitle>
            <CardDescription className="text-xs">
              Log purchases, utilities, or operating expenses directly.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="expense-amount" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Amount ({settings.currency})</Label>
                <Input 
                  id="expense-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="h-10 text-lg font-black bg-slate-50 border-slate-200 text-[#1A2B4B]"
                  placeholder="0.00"
                  value={expenseAmount || ''}
                  onChange={(e) => setExpenseAmount(Number(e.target.value))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense-account" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Source of Funds (Paid From)</Label>
                <Select 
                  required
                  value={expenseAccountId} 
                  onValueChange={setExpenseAccountId}
                >
                  <SelectTrigger id="expense-account" className="h-10 bg-slate-50 border-slate-200">
                    <SelectValue placeholder="Select account">
                      {accounts.find(a => a.id === expenseAccountId)?.name || 'Select account'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(acc => acc.active !== false).map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}{isAdmin ? ` (${settings.currency}${(acc.balance || 0).toLocaleString()})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="expense-category" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Category</Label>
                  <Select 
                    required
                    value={expenseCategory} 
                    onValueChange={setExpenseCategory}
                  >
                    <SelectTrigger id="expense-category" className="h-10 bg-slate-50 border-slate-200 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Supplies">Supplies</SelectItem>
                      <SelectItem value="Utilities">Utilities</SelectItem>
                      <SelectItem value="Rent">Rent</SelectItem>
                      <SelectItem value="Salary">Salary</SelectItem>
                      <SelectItem value="Maintenance">Maintenance</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Taxes">Taxes</SelectItem>
                      <SelectItem value="Delivery/Shipping Fee">Delivery/Shipping Fee</SelectItem>
                      <SelectItem value="General">General / Others</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expense-location" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Branch / Location</Label>
                  <Select 
                    disabled={!isAdmin && !!profile?.locationId}
                    value={expenseLocationId || "central"} 
                    onValueChange={(v) => setExpenseLocationId(v === "central" ? "" : v)}
                  >
                    <SelectTrigger id="expense-location" className="h-10 bg-slate-50 border-slate-200 text-xs">
                      <SelectValue placeholder="Select location">
                        {expenseLocationId 
                          ? (locations.find(l => l.id === expenseLocationId)?.name || 'Central') 
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
                <Label htmlFor="expense-description" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Description / Purpose</Label>
                <Input 
                  id="expense-description"
                  className="h-10 bg-slate-50 border-slate-200"
                  placeholder="Brief details about this expense"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full h-11 bg-[#1A2B4B] hover:bg-[#2C3E50] text-white font-bold rounded-xl shadow-lg shadow-[#1A2B4B]/10 transition-all mt-2">
                Record Expense
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Expense History Table */}
        <Card className="lg:col-span-8 border border-slate-200/80 shadow-xs bg-white rounded-xl overflow-hidden">
          <CardHeader className="bg-slate-50/60 pb-4 border-b border-slate-100 rounded-t-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold text-slate-800">Expense History Ledger</CardTitle>
              <CardDescription className="text-xs">
                {isAdmin ? "Verified logs of outgoing cash and expense entries across all staff." : "Verified logs of your submitted outgoing cash and expense entries."}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Input
                className="h-8 text-xs pl-3.5 bg-white border-slate-200 rounded-lg"
                placeholder="Search description, category..."
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-slate-100 bg-slate-50/30">
                    <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Expense / Memo</TableHead>
                    <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Category</TableHead>
                    <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Paid From</TableHead>
                    <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Amount</TableHead>
                    <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Recorded By</TableHead>
                    <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Date</TableHead>
                    {isAdmin && <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 7 : 6} className="h-32 text-center text-slate-400">
                        No matching expense records found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredExpenses
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map((exp) => (
                      <TableRow key={exp.id} className="hover:bg-slate-50/50 border-slate-50">
                        <TableCell className="font-bold text-slate-700 text-xs">
                          {exp.description}
                          {exp.locationName && (
                            <span className="block text-[10px] text-slate-400 font-normal">
                              • {exp.locationName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[9px] font-black uppercase px-2 py-0.5 border-slate-200 text-slate-500 bg-slate-50">
                            {exp.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-slate-600">
                          {exp.accountName}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-black text-rose-600">
                          -{settings.currency}{(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-500">
                          {exp.createdByName || 'System'}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
                          {exp.timestamp ? format(typeof exp.timestamp.toDate === 'function' ? exp.timestamp.toDate() : new Date(exp.timestamp), 'MMM dd, yyyy p') : '--'}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                              onClick={() => handleDeleteExpense(exp.id, exp.amount, exp.accountId, exp.description)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <DataTablePagination
                currentPage={currentPage}
                totalPages={Math.ceil(filteredExpenses.length / pageSize) || 1}
                pageSize={pageSize}
                totalItems={filteredExpenses.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={size => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Firestore Read Guardrail Notice & Status */}
      <div className="w-full p-4 rounded-xl border border-slate-200/80 bg-white shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${dateRange ? 'bg-indigo-100 text-indigo-800' : transLimit > 300 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            <Database className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">
              {dateRange
                ? `Custom Date Range Active (${dateRange.startDate} to ${dateRange.endDate})`
                : transLimit > 300
                ? `Extended History Active (${transLimit.toLocaleString()} Records Loaded)`
                : 'Default Read Cap Active (300 Most Recent Records)'}
            </p>
            <p className="text-[11px] text-slate-500">
              {dateRange
                ? `Filtered query active. Loaded ${transactions.length} matching transactions from Firestore.`
                : transLimit > 300
                ? 'Showing deep historical expense records from Firestore.'
                : 'Queries default to 300 documents to optimize database read costs. Use the Date Range Estimator above to fetch specific historical periods with exact read cost verification.'}
            </p>
          </div>
        </div>

        {(dateRange || transLimit > 300) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetDateRange}
            className="text-xs font-bold text-slate-600 hover:bg-slate-100 h-8 gap-1.5 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset to 300 Default
          </Button>
        )}
      </div>

      {/* Guardrail Confirmation Dialog */}
      <Dialog open={showGuardrailModal} onOpenChange={setShowGuardrailModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 text-base font-bold">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              Confirm Firestore Database Query
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-2 leading-relaxed">
              Before running this query, the system calculated the exact document count for your selected date range.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 my-1 space-y-2.5">
            <div className="flex items-center justify-between text-xs border-b border-slate-200/60 pb-2">
              <span className="text-slate-500 font-medium">Selected Date Range:</span>
              <span className="font-bold font-mono text-slate-800">
                {filterStartDate} &rarr; {filterEndDate}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs border-b border-slate-200/60 pb-2">
              <span className="text-slate-500 font-medium">Matching Documents Found:</span>
              <span className="font-bold text-slate-800">
                {exactReadCount !== null ? exactReadCount.toLocaleString() : '--'} records
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-0.5">
              <span className="font-bold text-slate-700">Exact Firestore Read Cost:</span>
              <Badge className="font-mono text-xs font-black bg-amber-100 text-amber-900 border-amber-300 px-2 py-0.5">
                {exactReadCount !== null ? `${exactReadCount.toLocaleString()} Reads` : '0 Reads'}
              </Badge>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-normal">
            Proceeding will perform exactly {exactReadCount !== null ? exactReadCount.toLocaleString() : '0'} document reads from your Firestore database to populate your live expense ledger.
          </p>

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowGuardrailModal(false)}
              className="text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setShowGuardrailModal(false);
                if (onApplyDateRange) {
                  onApplyDateRange(filterStartDate, filterEndDate);
                  toast.success(`Loaded ${exactReadCount} records for ${filterStartDate} to ${filterEndDate}`);
                }
              }}
              className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Confirm & Read {exactReadCount !== null ? exactReadCount.toLocaleString() : '0'} Documents
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
