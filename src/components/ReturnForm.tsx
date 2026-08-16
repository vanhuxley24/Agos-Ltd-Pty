import React, { useState, useEffect } from 'react';
import { Sale, ReturnItem, ReturnTransaction, Product, PaymentOption } from '@/types';
import { format } from 'date-fns';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCcw, Undo2, AlertCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, increment, Timestamp, onSnapshot, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { logAction } from '@/lib/audit';

interface ReturnFormProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  paymentOptions: PaymentOption[];
  onSuccess: () => void;
}

export const ReturnForm: React.FC<ReturnFormProps> = ({ isOpen, onClose, sale, paymentOptions, onSuccess }) => {
  const { profile, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<{ [key: string]: { quantity: number, type: 'return' | 'replacement', reason: string, restock: boolean } }>({});
  const [overallReason, setOverallReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<string>('cash');
  const [refundAccountId, setRefundAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [returnDate, setReturnDate] = useState<string>(format(new Date(), "yyyy-MM-dd'T'HH:mm"));

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn("ReturnForm: Error listening to accounts:", error);
    });
    return () => unsub();
  }, []);

  if (!sale) return null;

  const handleToggleItem = (productId: string) => {
    setSelectedItems(prev => {
      const next = { ...prev };
      if (next[productId]) {
        delete next[productId];
      } else {
        const item = sale.items.find(i => i.productId === productId);
        const maxAllowed = item ? (item.quantity - (item.returnedQuantity || 0)) : 1;
        next[productId] = { 
          quantity: maxAllowed > 0 ? maxAllowed : 1, 
          type: 'return', 
          reason: '',
          restock: true
        };
      }
      return next;
    });
  };

  const handleUpdateItem = (productId: string, field: string, value: any) => {
    setSelectedItems(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value }
    }));
  };

  const handleSubmit = async () => {
    if (Object.keys(selectedItems).length === 0) {
      toast.error('Please select at least one item');
      return;
    }

    if (!overallReason.trim()) {
      toast.error('Please provide an overall reason for the return/replacement');
      return;
    }

    // Safety validation checks to ensure return quantities are valid
    for (const item of sale.items) {
      const selection = selectedItems[item.productId];
      if (selection) {
        const maxAllowed = item.quantity - (item.returnedQuantity || 0);
        if (selection.quantity > maxAllowed) {
          toast.error(`Cannot return ${selection.quantity} of ${item.name} (Max remaining returnable: ${maxAllowed})`);
          return;
        }
        if (selection.quantity <= 0) {
          toast.error(`Please specify a quantity greater than 0 for ${item.name}`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const returnItems: ReturnItem[] = sale.items
        .filter(item => selectedItems[item.productId])
        .map(item => {
          const selection = selectedItems[item.productId];
          return {
            ...item,
            quantity: selection.quantity,
            returnType: selection.type,
            reason: selection.reason || overallReason,
            restock: selection.restock || false
          };
        });

      const totalRefund = returnItems
        .filter(i => i.returnType === 'return')
        .reduce((sum, i) => sum + (i.price * i.quantity), 0);

      const hasRefund = returnItems.some(i => i.returnType === 'return');

      // Check for insufficient funds if refunding
      if (hasRefund && refundAccountId) {
        const account = accounts.find(a => a.id === refundAccountId);
        if (account && account.balance < totalRefund) {
          toast.error(`Insufficient funds in ${account.name} for refund. Available: ${(account.balance || 0).toLocaleString()}`);
          setLoading(false);
          return;
        }
      }

      const returnData: Omit<ReturnTransaction, 'id'> = {
        originalSaleId: sale.id,
        items: returnItems,
        totalRefund,
        staffId: profile?.id || 'anonymous',
        staffName: profile?.name || 'Staff',
        locationId: sale.locationId,
        timestamp: Timestamp.fromDate(new Date(returnDate)), // Save as selected date/time
        reason: overallReason,
        ...(hasRefund && refundMethod ? { refundMethod } : {}),
        ...(hasRefund && refundAccountId ? { refundAccountId } : {})
      };

      // 1. Save return transaction
      const returnRef = await addDoc(collection(db, 'returnTransactions'), returnData);

      // 2. Calculate updated items list for the sale keeping track of returnedQuantity
      const updatedSaleItems = sale.items.map(item => {
        const selection = selectedItems[item.productId];
        if (selection) {
          const previouslyReturned = item.returnedQuantity || 0;
          return {
            ...item,
            returnedQuantity: previouslyReturned + selection.quantity
          };
        }
        return item;
      });

      // If all items and their quantities have been returned, status becomes 'returned'
      // Otherwise, status is 'partially_returned'
      const allReturned = updatedSaleItems.every(item => (item.returnedQuantity || 0) >= item.quantity);
      const saleStatus = allReturned ? 'returned' : 'partially_returned';

      const saleRef = doc(db, 'sales', sale.id);
      await updateDoc(saleRef, {
        status: saleStatus,
        items: updatedSaleItems,
        updatedAt: Timestamp.now()
      });
      
      // 3. Update stock and log each item
      for (const item of returnItems) {
        const selection = selectedItems[item.productId];
        
        if (selection.restock) {
          const productRef = doc(db, 'products', item.productId);
          await updateDoc(productRef, {
            stock: increment(item.quantity),
            [`stocks.${sale.locationId}`]: increment(item.quantity),
            updatedAt: Timestamp.now()
          });
        }

        await logAction(
          profile, 
          item.returnType === 'return' ? 'ITEM_RETURN' : 'ITEM_REPLACEMENT',
          `${item.returnType === 'return' ? 'Returned' : 'Replaced'} ${item.quantity}x ${item.name} from Sale #${sale.id.slice(-6)}. Reason: ${item.reason}`,
          item.productId,
          'product'
        );
      }

      await logAction(
        profile,
        'RETURN_TRANSACTION',
        `Processed ${returnData.items.length} items for ${returnData.totalRefund > 0 ? 'refund and/or ' : ''}replacement from Sale #${sale.id.slice(-6)}`,
        returnRef.id,
        'return'
      );

      // 4. Update financial account balance if refunding
      if (hasRefund && refundAccountId) {
        let targetAccount = accounts.find(a => a.id === refundAccountId);
        let resolvedAccountId = refundAccountId;

        if (!targetAccount) {
          const paymentOption = paymentOptions.find(o => o.id === refundAccountId);
          const paymentOptionName = paymentOption?.name || 'Refund Account';
          const paymentOptionType = paymentOption?.type || 'cash';
          
          targetAccount = accounts.find(a => a.name.toLowerCase() === paymentOptionName.toLowerCase());
          if (targetAccount) {
            resolvedAccountId = targetAccount.id;
          } else {
            // Create the account document dynamically!
            await setDoc(doc(db, 'accounts', refundAccountId), {
              name: paymentOptionName,
              type: paymentOptionType,
              balance: 0,
              lastUpdated: Timestamp.now()
            });
            targetAccount = {
              id: refundAccountId,
              name: paymentOptionName,
              type: paymentOptionType,
              balance: 0
            };
          }
        }

        const currentBalance = targetAccount?.balance || 0;
        const newBalance = currentBalance - totalRefund;

        const accountRef = doc(db, 'accounts', resolvedAccountId);
        await updateDoc(accountRef, {
          balance: increment(-totalRefund),
          lastUpdated: Timestamp.now()
        });

        // Create financial transaction record
        await addDoc(collection(db, 'financialTransactions'), {
          amount: totalRefund,
          type: 'expense',
          accountId: resolvedAccountId,
          accountName: targetAccount?.name || 'Unknown',
          locationId: sale.locationId || null,
          locationName: null,
          category: 'Sales Return',
          description: `Refund for Sale #${sale.id.slice(-6)}`,
          timestamp: Timestamp.fromDate(new Date(returnDate)), // Save as selected date/time
          createdBy: profile?.id || 'anonymous',
          createdByName: profile?.name || 'Staff',
          accountBalance: newBalance
        });

        await logAction(profile, 'UPDATE_ACCOUNT', `Deducted ${(totalRefund ?? 0).toFixed(2)} from account for refund on Sale #${sale.id.slice(-6)}`, resolvedAccountId, 'account');
      }

      toast.success('Return/Replacement processed successfully');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error processing return:', error);
      toast.error('Failed to process return');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-[#D4AF37]" />
            Return or Replacement
          </DialogTitle>
          <DialogDescription>
            Sale #{sale.id.slice(-6)} • {new Date(sale.timestamp.toDate()).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Select Items to Process</Label>
            <div className="space-y-3">
              {sale.items.map((item) => {
                const maxAllowed = item.quantity - (item.returnedQuantity || 0);
                const isFullyReturned = maxAllowed <= 0;
                return (
                  <div 
                    key={item.productId} 
                    className={`flex flex-col gap-3 p-3 rounded-lg border ${
                      isFullyReturned 
                        ? 'opacity-65 bg-slate-100 border-slate-200' 
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox 
                        id={`check-${item.productId}`}
                        checked={!!selectedItems[item.productId]}
                        onCheckedChange={() => handleToggleItem(item.productId)}
                        disabled={isFullyReturned}
                      />
                      <div className="flex-1 min-w-0">
                        <Label 
                          htmlFor={`check-${item.productId}`}
                          className={`text-sm font-bold text-[#1A2B4B] ${
                            isFullyReturned ? 'text-slate-400 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          {item.name}
                        </Label>
                        <p className="text-[10px] text-slate-500">
                          Purchased: {item.quantity} @ ₱{(item.price ?? 0).toFixed(2)}
                          {item.returnedQuantity && item.returnedQuantity > 0 ? (
                            <span className="text-rose-600 font-bold ml-1.5">
                              (Already Returned: {item.returnedQuantity})
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    {selectedItems[item.productId] && (
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/50">
                        <div className="space-y-1.5">
                          <Label className="text-[10px]">Type</Label>
                          <Select 
                            value={selectedItems[item.productId].type}
                            onValueChange={(v: 'return' | 'replacement') => handleUpdateItem(item.productId, 'type', v)}
                          >
                            <SelectTrigger className="h-8 text-xs bg-white">
                              <SelectValue>
                                {selectedItems[item.productId].type === 'return' ? 'Return (Refund)' : 'Replacement'}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="return">Return (Refund)</SelectItem>
                              <SelectItem value="replacement">Replacement</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px]">Quantity</Label>
                          <Input 
                            type="number" 
                            max={maxAllowed}
                            min={1}
                            className="h-8 text-xs bg-white"
                            value={selectedItems[item.productId].quantity}
                            onChange={(e) => {
                              const inputVal = Number(e.target.value);
                              const constrainedVal = Math.min(maxAllowed, Math.max(1, inputVal));
                              handleUpdateItem(item.productId, 'quantity', constrainedVal);
                            }}
                          />
                        </div>
                        <div className="col-span-2 flex items-center gap-2">
                          <Checkbox 
                            id={`restock-${item.productId}`}
                            checked={selectedItems[item.productId].restock}
                            onCheckedChange={(checked) => handleUpdateItem(item.productId, 'restock', !!checked)}
                          />
                          <Label htmlFor={`restock-${item.productId}`} className="text-[10px] text-slate-600 cursor-pointer">
                            Add returned item back to stock? (Restock)
                          </Label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refund-acc" className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Refund Account (Money Taken From)</Label>
              <Select 
                required={Object.values(selectedItems).some((i: any) => i.type === 'return')}
                value={refundAccountId} 
                onValueChange={(v) => {
                  setRefundAccountId(v);
                  const selectedAcc = accounts.find(a => a.id === v);
                  if (selectedAcc) {
                    setRefundMethod(selectedAcc.type || 'cash');
                  }
                }}
                disabled={!Object.values(selectedItems).some((i: any) => i.type === 'return')}
              >
                <SelectTrigger id="refund-acc" className="h-9 text-xs bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Select financial account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter(acc => acc.active !== false).map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}{isAdmin ? ` (Balance: ₱${(acc.balance ?? 0).toFixed(2)})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="return-date" className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Return Date & Time (Backdate Return)</Label>
              <Input 
                id="return-date"
                type="datetime-local"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="h-9 text-xs bg-slate-50 border-slate-200"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="return-reason" className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Reason for Return/Replacement</Label>
              <Textarea 
                id="return-reason"
                placeholder="Detailed reason for the admin..."
                value={overallReason}
                onChange={(e) => setOverallReason(e.target.value)}
                className="resize-none h-24"
                required
              />
            </div>
          </div>

          {Object.values(selectedItems).some((i: any) => i.type === 'return') && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-900">Refund Summary</p>
                <p className="text-[10px] text-amber-700">
                  Total refund to customer: ₱{(Object.entries(selectedItems)
                    .filter(([_, opt]: [string, any]) => opt.type === 'return')
                    .reduce((sum, [id, opt]: [string, any]) => {
                      const item = sale.items.find(i => i.productId === id);
                      return sum + ((item?.price || 0) * opt.quantity);
                    }, 0) ?? 0).toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white" 
            onClick={handleSubmit}
            disabled={loading || Object.keys(selectedItems).length === 0}
          >
            {loading ? 'Processing...' : 'Confirm Return'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
