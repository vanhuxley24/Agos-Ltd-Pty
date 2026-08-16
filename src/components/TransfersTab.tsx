import React, { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeftRight } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, increment, Timestamp } from 'firebase/firestore';
import { logAction } from '@/lib/audit';
import { supabaseService } from '@/lib/supabase-service';
import { toast } from 'sonner';
import { FinancialAccount, Transaction } from '@/types';

interface TransfersTabProps {
  accounts: FinancialAccount[];
  transactions: Transaction[];
}

export const TransfersTab: React.FC<TransfersTabProps> = ({ accounts, transactions }) => {
  const { settings } = useSettings();
  const { user, profile } = useAuth();

  // Form states
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [sourceAccountId, setSourceAccountId] = useState<string>('');
  const [destAccountId, setDestAccountId] = useState<string>('');
  const [transferDescription, setTransferDescription] = useState<string>('');

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

      supabaseService.saveFinancialTransaction({
        id: transRef.id,
        account_id: sourceAccountId,
        type: 'transfer',
        category: 'Fund Transfer',
        amount: transferAmount,
        description: transferDescription || `Fund transfer from ${sourceAccount.name} to ${destAccount.name}`,
        created_by: profile?.id || 'anonymous'
      }).catch(() => {});

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

  const transferTransactions = transactions.filter(t => t.type === 'transfer');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* New Fund Transfer Form */}
      <Card className="lg:col-span-4 border border-slate-200/80 shadow-xs bg-white rounded-xl overflow-hidden h-fit">
        <CardHeader className="bg-slate-50/60 pb-4 border-b border-slate-100 rounded-t-xl">
          <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-indigo-500" />
            Transfer Funds
          </CardTitle>
          <CardDescription className="text-xs">
            Move cash reserves or balances between banks, cash-on-hand, or GCash.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5">
          <form onSubmit={handleFundTransfer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="transfer-amount" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Amount to Transfer ({settings.currency})</Label>
              <Input 
                id="transfer-amount"
                type="number"
                step="0.01"
                min="0.01"
                className="h-10 text-lg font-black bg-slate-50 border-slate-200 text-[#1A2B4B]"
                placeholder="0.00"
                value={transferAmount || ''}
                onChange={(e) => setTransferAmount(Number(e.target.value))}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="source-account" className="text-xs font-bold text-slate-700 uppercase tracking-wider">From Account</Label>
                <Select 
                  required
                  value={sourceAccountId} 
                  onValueChange={setSourceAccountId}
                >
                  <SelectTrigger id="source-account" className="h-10 bg-slate-50 border-slate-200 text-xs">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(acc => acc.active !== false).map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({settings.currency}{(acc.balance || 0).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dest-account" className="text-xs font-bold text-slate-700 uppercase tracking-wider">To Account</Label>
                <Select 
                  required
                  value={destAccountId} 
                  onValueChange={setDestAccountId}
                >
                  <SelectTrigger id="dest-account" className="h-10 bg-slate-50 border-slate-200 text-xs">
                    <SelectValue placeholder="Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(acc => acc.active !== false).map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({settings.currency}{(acc.balance || 0).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-description" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Transfer Description / Memo</Label>
              <Input 
                id="transfer-description"
                className="h-10 bg-slate-50 border-slate-200"
                placeholder="e.g. Deposit GCash to Bank, Replenish cash drawer"
                value={transferDescription}
                onChange={(e) => setTransferDescription(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/10 transition-all mt-2 flex items-center justify-center gap-1.5">
              <ArrowLeftRight className="w-4 h-4" />
              Transfer Funds Now
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Transfer History Table */}
      <Card className="lg:col-span-8 border border-slate-200/80 shadow-xs bg-white rounded-xl overflow-hidden">
        <CardHeader className="bg-slate-50/60 pb-4 border-b border-slate-100 rounded-t-xl">
          <CardTitle className="text-lg font-bold text-slate-800">Transfer History Ledger</CardTitle>
          <CardDescription className="text-xs">Recent internal transfers recorded between financial accounts.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100 bg-slate-50/30">
                  <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Transfer Description</TableHead>
                  <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Routing (From → To)</TableHead>
                  <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Amount</TableHead>
                  <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Recorded By</TableHead>
                  <TableHead className="text-[10px] uppercase font-black tracking-widest text-slate-400">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transferTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-slate-400">
                      No internal fund transfer records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  transferTransactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-slate-50/50 border-slate-50">
                      <TableCell className="font-bold text-slate-700 text-xs">
                        {tx.description || 'Internal Fund Transfer'}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-600">
                        <span className="text-rose-600 font-bold">{tx.accountName}</span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="text-emerald-600 font-bold">{tx.toAccountName || 'Destination'}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-black text-[#1A2B4B]">
                        {settings.currency}{(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-500">
                        {tx.createdByName || 'System'}
                      </TableCell>
                      <TableCell className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
                        {tx.timestamp ? format(typeof tx.timestamp.toDate === 'function' ? tx.timestamp.toDate() : new Date(tx.timestamp), 'MMM dd, yyyy p') : '--'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
