import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Product, Location, Supplier, PaymentOption } from '@/types';
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
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { logAction } from '@/lib/audit';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabase-service';
import { cn } from '@/lib/utils';
import { Plus, Trash2, ShoppingBag, X, Package, CreditCard, Layers } from 'lucide-react';
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
  const watchItems = watch('items') || [];
  const watchSplits = watch('paymentSplits') || [];
  const isSplitPayment = watch('isSplitPayment');
  const totalAmount = watchItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.cost || 0)), 0);
  const totalSplitAmount = watchSplits.reduce((sum, split) => sum + Number(split.amount || 0), 0);
  const totalItemCount = watchItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  useEffect(() => {
    if (watchAccountId) {
      const account = paymentOptions.find(opt => opt.id === watchAccountId);
      if (account) {
        setValue('paymentMethod', account.type);
        if (account.type === 'cash') setValue('paymentCategory', 'Cash');
        else if (account.type === 'card') setValue('paymentCategory', 'Card');
        else setValue('paymentCategory', 'Digital');
      }
    }
  }, [watchAccountId, paymentOptions, setValue]);

  const onSubmit = async (data: POFormData) => {
    if (data.items.some(i => !i.productId)) {
      toast.error('Each item line must have a product selected');
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
      const location = locations.find(l => l.id === data.locationId);
      
      const poData = {
        poNumber: data.poNumber,
        supplierId: data.supplierId,
        supplierName: supplier?.name || 'Unknown',
        locationId: data.locationId,
        locationName: location?.name || 'Unknown',
        paymentAccountId: data.isSplitPayment ? null : data.paymentAccountId,
        paymentMethod: data.isSplitPayment ? 'split' : data.paymentMethod,
        paymentCategory: data.paymentCategory,
        paymentReference: data.paymentReference,
        isSplitPayment: data.isSplitPayment,
        paymentSplits: data.isSplitPayment ? data.paymentSplits : null,
        notes: data.notes,
        status: 'ordered',
        totalAmount,
        totalUnits: totalItemCount,
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
      await logAction(profile, 'CREATE_PO', `Created Purchase Order: ${poData.poNumber} for ${poData.supplierName}`, docRef.id, 'purchaseOrder');
      
      if (isSupabaseConfigured()) {
        supabase.from('purchase_orders').insert([{
          id: docRef.id,
          po_number: poData.poNumber,
          supplier_id: poData.supplierId,
          supplier_name: poData.supplierName,
          location_id: poData.locationId,
          items: poData.items,
          total_amount: totalAmount,
          status: 'ordered',
          created_at: new Date().toISOString()
        }]).then(() => {}, (err) => console.warn(err));
      }
      
      toast.success(`Purchase order ${poData.poNumber} created successfully!`);
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
      <DialogContent className="sm:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-700">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Create Purchase Order
                <Badge variant="outline" className="bg-indigo-50/80 text-indigo-700 border-indigo-200 text-[10px] font-mono">
                  Standard Format
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Generate and issue restocking purchase orders to suppliers with multi-line item tracking.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-4">
          {/* Header Metadata Grid: 3 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500">PO Number</Label>
              <Input 
                id="poNumber" 
                {...register('poNumber', { required: true })} 
                className="bg-white border-slate-200 rounded-xl text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500">Supplier</Label>
              <Select required value={watchSupplierId} onValueChange={(val: string) => setValue('supplierId', val)}>
                <SelectTrigger className="bg-white border-slate-200 rounded-xl text-xs">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500">Destination Location</Label>
              <Select required value={watchLocationId} onValueChange={(val: string) => setValue('locationId', val)}>
                <SelectTrigger className="bg-white border-slate-200 rounded-xl text-xs">
                  <SelectValue placeholder="Select destination branch" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Payment Details & Notes Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 items-start">
            <div className="lg:col-span-8 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold uppercase text-slate-700">Payment Configuration</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-medium text-slate-500">Split Payment</Label>
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
              </div>

              {!isSplitPayment ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">Payment Account</Label>
                    <Select required={!isSplitPayment} value={watchAccountId} onValueChange={(val: string) => setValue('paymentAccountId', val)}>
                      <SelectTrigger className="h-9 text-xs bg-white border-slate-200 rounded-xl">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentOptions.map(opt => (
                          <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">Payment Method</Label>
                    <Select value={watch('paymentMethod')} onValueChange={(val: string) => setValue('paymentMethod', val)}>
                      <SelectTrigger className="h-9 text-xs bg-white border-slate-200 rounded-xl">
                        <SelectValue placeholder="Method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                        <SelectItem value="ewallet">E-Wallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">Ref / Check #</Label>
                    <Input 
                      {...register('paymentReference')} 
                      placeholder="Optional reference" 
                      className="h-9 text-xs bg-white border-slate-200 rounded-xl"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600">Split Accounts Matrix</span>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="h-7 text-[10px] rounded-lg border-indigo-200 text-indigo-700" 
                      onClick={() => appendSplit({ methodId: 'cash', methodName: 'Cash', amount: 0 })}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add Account
                    </Button>
                  </div>
                  
                  {splitFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <Select 
                          value={watchSplits?.[index]?.methodId} 
                          onValueChange={(v) => {
                            const opt = paymentOptions.find(o => o.id === v);
                            setValue(`paymentSplits.${index}.methodId` as any, v);
                            setValue(`paymentSplits.${index}.methodName` as any, v === 'cash' ? 'Cash' : v === 'card' ? 'Card' : opt?.name || v);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white rounded-lg">
                            <SelectValue placeholder="Select method" />
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
                      <div className="col-span-3">
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="Amount"
                          className="h-8 text-xs bg-white rounded-lg" 
                          {...register(`paymentSplits.${index}.amount` as any, { required: true, min: 0 })}
                        />
                      </div>
                      <div className="col-span-3">
                        <Input 
                          className="h-8 text-xs bg-white rounded-lg" 
                          placeholder="Ref #" 
                          {...register(`paymentSplits.${index}.reference` as any)}
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-slate-400 hover:text-rose-600"
                          onClick={() => removeSplit(index)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <div className={cn(
                    "text-xs text-right font-bold pt-1",
                    Math.abs(totalSplitAmount - totalAmount) < 0.01 ? "text-emerald-600" : "text-rose-500"
                  )}>
                    Allocated: {settings.currency}{totalSplitAmount.toFixed(2)} / Required: {settings.currency}{totalAmount.toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500">Order Notes</Label>
              <Input 
                id="notes" 
                {...register('notes')} 
                placeholder="e.g. Expected shipment within 3 business days" 
                className="bg-white border-slate-200 rounded-xl text-xs h-20 items-start"
              />
            </div>
          </div>

          {/* Order Items Table Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Order Line Items ({fields.length})</h3>
              </div>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => append({ productId: '', quantity: 1, cost: 0 })}
                className="h-8 text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item Line
              </Button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="text-xs font-bold w-[40%]">Product Name</TableHead>
                    <TableHead className="text-xs font-bold w-[18%]">SKU / Code</TableHead>
                    <TableHead className="text-xs font-bold text-center w-[12%]">Quantity</TableHead>
                    {isAdmin && <TableHead className="text-xs font-bold text-right w-[15%]">Unit Cost ({settings.currency})</TableHead>}
                    {isAdmin && <TableHead className="text-xs font-bold text-right w-[15%]">Line Subtotal</TableHead>}
                    <TableHead className="text-xs font-bold text-right w-[8%]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const currentProdId = watchItems[index]?.productId;
                    const selectedProd = products.find(p => p.id === currentProdId);
                    const qty = Number(watchItems[index]?.quantity || 0);
                    const cost = Number(watchItems[index]?.cost || 0);
                    const lineSubtotal = qty * cost;

                    return (
                      <TableRow key={field.id} className="hover:bg-slate-50/50">
                        <TableCell className="align-middle py-2.5">
                          <Select 
                            value={currentProdId} 
                            onValueChange={(val: string) => {
                              setValue(`items.${index}.productId` as any, val);
                              const prod = products.find(p => p.id === val);
                              if (prod) setValue(`items.${index}.cost` as any, prod.cost || 0);
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs bg-white border-slate-200 rounded-xl">
                              <SelectValue placeholder="Select product item..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        <TableCell className="align-middle py-2.5">
                          <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-md">
                            {selectedProd?.sku || 'N/A'}
                          </span>
                        </TableCell>

                        <TableCell className="align-middle py-2.5">
                          <Input 
                            type="number" 
                            min={1}
                            className="h-9 text-xs font-bold text-center bg-white border-slate-200 rounded-xl"
                            {...register(`items.${index}.quantity` as const, { required: true, min: 1, valueAsNumber: true })} 
                          />
                        </TableCell>

                        {isAdmin && (
                          <TableCell className="align-middle py-2.5 text-right">
                            <Input 
                              type="number" 
                              step="0.01" 
                              min={0}
                              className="h-9 text-xs font-bold text-right bg-white border-slate-200 rounded-xl"
                              {...register(`items.${index}.cost` as const, { required: true, min: 0, valueAsNumber: true })} 
                            />
                          </TableCell>
                        )}

                        {isAdmin && (
                          <TableCell className="align-middle py-2.5 text-right font-black text-xs text-indigo-700">
                            {settings.currency}{lineSubtotal.toFixed(2)}
                          </TableCell>
                        )}

                        <TableCell className="text-right align-middle py-2.5">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            disabled={fields.length <= 1}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* PO Grand Total Banner */}
          {isAdmin && (
            <div className="bg-indigo-50/70 border border-indigo-100 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-500 font-medium block text-[10px] uppercase">Total Item Lines</span>
                  <span className="font-black text-slate-800 text-sm">{watchItems.filter(i => i.productId).length} lines</span>
                </div>
                <div className="w-px h-8 bg-indigo-200/60" />
                <div>
                  <span className="text-slate-500 font-medium block text-[10px] uppercase">Total Ordered Units</span>
                  <span className="font-black text-indigo-700 text-sm">{totalItemCount.toLocaleString()} units</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase text-indigo-900 tracking-wider">Grand Purchase Amount:</span>
                <span className="text-2xl font-black text-indigo-700">{settings.currency}{totalAmount.toFixed(2)}</span>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-slate-100 gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs font-bold">
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || totalItemCount === 0} 
              className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl text-xs font-bold px-6 shadow-md"
            >
              {loading ? 'Submitting Purchase Order...' : 'Create & Order Items'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
