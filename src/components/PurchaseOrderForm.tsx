import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Product, Location, Supplier, POItem, PaymentOption } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { logAction } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { Plus, Trash2, ShoppingBag, X } from 'lucide-react';
import { Separator } from './ui/separator';
import { Switch } from './ui/switch';

interface PurchaseOrderFormProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  locations: Location[];
  suppliers: Supplier[];
  paymentOptions: PaymentOption[];
}

interface POFormData {
  poNumber: string;
  supplierId: string;
  locationId: string;
  paymentAccountId: string;
  paymentMethod: string;
  paymentCategory: 'Cash' | 'Digital' | 'Card';
  paymentReference: string;
  isSplitPayment: boolean;
  paymentSplits: {
    methodId: string;
    methodName: string;
    amount: number;
    reference?: string;
  }[];
  notes: string;
  items: {
    productId: string;
    quantity: number;
    cost: number;
  }[];
}

export const PurchaseOrderForm: React.FC<PurchaseOrderFormProps> = ({ 
  isOpen, 
  onClose,
  products,
  locations,
  suppliers,
  paymentOptions
}) => {
  const { profile, isAdmin } = useAuth();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(false);
  
  const { register, handleSubmit, reset, control, watch, setValue } = useForm<POFormData>({
    defaultValues: {
      poNumber: `PO-${Date.now().toString().slice(-6)}`,
      supplierId: '',
      locationId: '',
      paymentAccountId: '',
      paymentMethod: 'cash',
      paymentCategory: 'Cash',
      paymentReference: '',
      isSplitPayment: false,
      paymentSplits: [],
      notes: '',
      items: [{ productId: '', quantity: 1, cost: 0 }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const { fields: splitFields, append: appendSplit, remove: removeSplit } = useFieldArray({
    control,
    name: "paymentSplits"
  });

  const watchSupplierId = watch('supplierId');
  const watchLocationId = watch('locationId');
  const watchAccountId = watch('paymentAccountId');
  const watchItems = watch('items');
  const watchSplits = watch('paymentSplits');
  const isSplitPayment = watch('isSplitPayment');
  const totalAmount = watchItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.cost || 0)), 0);
  const totalSplitAmount = watchSplits?.reduce((sum, split) => sum + Number(split.amount || 0), 0) || 0;

  useEffect(() => {
    if (watchAccountId) {
      const account = paymentOptions.find(opt => opt.id === watchAccountId);
      if (account) {
        setValue('paymentMethod', account.type);
        
        // Also map to Category for display/logic if needed
        if (account.type === 'cash') setValue('paymentCategory', 'Cash');
        else if (account.type === 'card') setValue('paymentCategory', 'Card');
        else setValue('paymentCategory', 'Digital');
      }
    }
  }, [watchAccountId, paymentOptions, setValue]);

  const onSubmit = async (data: POFormData) => {
    if (data.items.some(i => !i.productId)) {
      toast.error('Each item must have a product selected');
      return;
    }

    if (data.isSplitPayment) {
      if (Math.abs(totalSplitAmount - totalAmount) > 0.01) {
        toast.error(`Split amounts (${settings.currency}${totalSplitAmount.toFixed(2)}) must equal total (${settings.currency}${totalAmount.toFixed(2)})`);
        return;
      }
    }

    setLoading(true);
    try {
      const supplier = suppliers.find(s => s.id === data.supplierId);
      
      const poData = {
        poNumber: data.poNumber,
        supplierId: data.supplierId,
        supplierName: supplier?.name || 'Unknown',
        locationId: data.locationId,
        paymentAccountId: data.isSplitPayment ? null : data.paymentAccountId,
        paymentMethod: data.isSplitPayment ? 'split' : data.paymentMethod,
        paymentCategory: data.paymentCategory,
        paymentReference: data.paymentReference,
        isSplitPayment: data.isSplitPayment,
        paymentSplits: data.isSplitPayment ? data.paymentSplits : null,
        notes: data.notes,
        status: 'ordered', // Default to ordered for this simplified workflow
        totalAmount,
        items: data.items.map((item: any) => {
          const product = products.find(p => p.id === item.productId);
          return {
            productId: item.productId,
            name: product?.name || 'Unknown',
            sku: product?.sku || 'N/A',
            quantity: Number(item.quantity),
            cost: Number(item.cost),
            receivedQuantity: 0
          };
        }),
        createdBy: profile?.id || 'Unknown',
        orderedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      const docRef = await addDoc(collection(db, 'purchaseOrders'), poData);
      await logAction(profile, 'CREATE_PO', `Created Purchase Order: ${poData.poNumber}`, docRef.id, 'purchaseOrder');
      
      toast.success('Purchase order created and items ordered');
      reset();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'purchaseOrders');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] md:min-h-[700px] max-h-[95vh] flex flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-indigo-600" />
            Create Purchase Order
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 py-4 px-1">
            <div className="space-y-2">
              <Label htmlFor="poNumber">PO Number</Label>
              <Input id="poNumber" {...register('poNumber', { required: true })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierId">Supplier</Label>
              <Select required value={watchSupplierId} onValueChange={(val: string) => setValue('supplierId', val)}>
                <SelectTrigger id="supplierId">
                  <SelectValue placeholder="Select supplier">
                    {suppliers.find(s => s.id === watchSupplierId)?.name || 'Select supplier'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="locationId">Destination Location</Label>
              <Select required value={watchLocationId} onValueChange={(val: string) => setValue('locationId', val)}>
                <SelectTrigger id="locationId">
                  <SelectValue placeholder="Select location">
                    {locations.find(l => l.id === watchLocationId)?.name || 'Select location'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between py-2 border-y border-slate-100 mb-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold">Split Payment</Label>
                <p className="text-[10px] text-slate-400">Pay using multiple accounts</p>
              </div>
              <Switch 
                checked={isSplitPayment}
                onCheckedChange={(checked) => {
                  setValue('isSplitPayment', checked);
                  if (checked && splitFields.length === 0) {
                    appendSplit({ methodId: 'cash', methodName: 'Cash', amount: totalAmount });
                  }
                }}
              />
            </div>

            {!isSplitPayment ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="paymentAccountId">Payment Source Account</Label>
                  <Select required={!isSplitPayment} value={watchAccountId} onValueChange={(val: string) => setValue('paymentAccountId', val)}>
                    <SelectTrigger id="paymentAccountId">
                      <SelectValue placeholder="Select account">
                        {paymentOptions.find(opt => opt.id === watchAccountId)?.name || 'Select account'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {paymentOptions.map(opt => (
                        <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Payment Method Detail</Label>
                  <Select value={watch('paymentMethod')} onValueChange={(val: string) => setValue('paymentMethod', val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method">
                        {watch('paymentMethod') ? (
                          watch('paymentMethod') === 'cash' ? 'Cash' :
                          watch('paymentMethod') === 'card' ? 'Card' :
                          watch('paymentMethod') === 'bank' ? 'Bank Transfer' :
                          watch('paymentMethod') === 'ewallet' ? 'E-Wallet' :
                          watch('paymentMethod')
                        ) : 'Select method'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="ewallet">E-Wallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentReference">Reference/Check #</Label>
                  <Input id="paymentReference" {...register('paymentReference')} placeholder="Optional reference" />
                </div>
              </>
            ) : (
              <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase text-slate-400">Payment Splits</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => appendSplit({ methodId: 'cash', methodName: 'Cash', amount: 0 })}>
                    <Plus className="w-3 h-3 mr-1" /> Add Method
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {splitFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5 space-y-1">
                        <Label className="text-[10px]">Method</Label>
                        <Select 
                          value={watchSplits?.[index]?.methodId} 
                          onValueChange={(v) => {
                            const opt = paymentOptions.find(o => o.id === v);
                            setValue(`paymentSplits.${index}.methodId` as any, v);
                            setValue(`paymentSplits.${index}.methodName` as any, v === 'cash' ? 'Cash' : v === 'card' ? 'Card' : opt?.name || v);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white">
                            <SelectValue placeholder="Method" />
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
                          step="0.01"
                          className="h-8 text-xs bg-white" 
                          {...register(`paymentSplits.${index}.amount` as any, { required: true, min: 0 })}
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <Label className="text-[10px]">Ref</Label>
                        <Input 
                          className="h-8 text-xs bg-white" 
                          placeholder="Ref #" 
                          {...register(`paymentSplits.${index}.reference` as any)}
                        />
                      </div>
                      <div className="col-span-1">
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-rose-500"
                          onClick={() => removeSplit(index)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={cn(
                  "text-[10px] text-right font-bold",
                  Math.abs(totalSplitAmount - totalAmount) < 0.01 ? "text-emerald-600" : "text-rose-500"
                )}>
                  Total Split: {settings.currency}{totalSplitAmount.toFixed(2)} / {settings.currency}{totalAmount.toFixed(2)}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input id="notes" {...register('notes')} placeholder="e.g. Urgent delivery" />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-bold">Order Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: '', quantity: 1, cost: 0 })}>
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Product</Label>
                    <Select value={watchItems[index]?.productId} onValueChange={(val: string) => {
                      setValue(`items.${index}.productId` as any, val);
                      const prod = products.find(p => p.id === val);
                      if (prod) setValue(`items.${index}.cost` as any, prod.cost);
                    }}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select product">
                          {products.find(p => p.id === watchItems[index]?.productId) ? `${products.find(p => p.id === watchItems[index]?.productId)?.name} (${products.find(p => p.id === watchItems[index]?.productId)?.sku})` : 'Select product'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Quantity</Label>
                    <Input 
                      type="number" 
                      className="bg-white"
                      {...register(`items.${index}.quantity` as const, { required: true, min: 1 })} 
                    />
                  </div>
                  {isAdmin ? (
                    <div className="w-32 space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-slate-400">Unit Cost ({settings.currency})</Label>
                      <Input 
                        type="number" 
                        step="0.01" 
                        className="bg-white"
                        {...register(`items.${index}.cost` as const, { required: true, min: 0 })} 
                      />
                    </div>
                  ) : (
                    <input type="hidden" {...register(`items.${index}.cost` as const)} />
                  )}
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className="text-slate-400 hover:text-rose-600"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="bg-indigo-50 p-4 rounded-xl flex justify-between items-center border border-indigo-100">
              <span className="text-sm font-bold text-indigo-900">Total Purchase Amount:</span>
              <span className="text-2xl font-black text-indigo-600">{settings.currency}{(totalAmount ?? 0).toFixed(2)}</span>
            </div>
          )}

          <DialogFooter className="pt-6 border-t mt-auto">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
              {loading ? 'Creating...' : 'Create & Order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
