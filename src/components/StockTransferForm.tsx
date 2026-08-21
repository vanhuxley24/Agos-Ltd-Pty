import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Scan, ArrowRight, ArrowRightLeft, Plus, Trash2, Package, CheckCircle2, AlertTriangle } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Product, Location } from '@/types';
import { db } from '@/lib/firebase';
import { doc, collection, addDoc, Timestamp, arrayUnion, increment, writeBatch } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { logAction } from '@/lib/audit';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { cn } from '@/lib/utils';
import { supabaseService } from '@/lib/supabase-service';

interface StockTransferFormProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  locations: Location[];
}

interface TransferItem {
  productId: string;
  quantity: number;
  notes?: string;
}

interface MultiTransferFormData {
  transferNumber: string;
  fromLocationId: string;
  toLocationId: string;
  reason: string;
  items: TransferItem[];
}

export const StockTransferForm: React.FC<StockTransferFormProps> = ({ 
  isOpen, 
  onClose, 
  products, 
  locations 
}) => {
  const { profile, user } = useAuth();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerRowIndex, setScannerRowIndex] = useState<number | null>(null);

  const { register, control, handleSubmit, watch, setValue, reset, formState: { isSubmitting, errors } } = useForm<MultiTransferFormData>({
    defaultValues: {
      transferNumber: `TR-${Date.now().toString().slice(-6)}`,
      fromLocationId: '',
      toLocationId: '',
      reason: '',
      items: [{ productId: '', quantity: 1, notes: '' }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items'
  });

  const watchFromLocationId = watch('fromLocationId');
  const watchToLocationId = watch('toLocationId');
  const watchItems = watch('items') || [];

  const totalTransferUnits = watchItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const totalUniqueItems = watchItems.filter(i => i.productId).length;

  const getProductStockAtSource = (productId: string) => {
    if (!productId || !watchFromLocationId) return 0;
    const prod = products.find(p => p.id === productId);
    return Number(prod?.stocks?.[watchFromLocationId] || 0);
  };

  const getProductStockAtDest = (productId: string) => {
    if (!productId || !watchToLocationId) return 0;
    const prod = products.find(p => p.id === productId);
    return Number(prod?.stocks?.[watchToLocationId] || 0);
  };

  const onSubmit = async (data: MultiTransferFormData) => {
    if (!profile || !user) return;

    if (!data.fromLocationId || !data.toLocationId) {
      toast.error('Please select both Source and Destination branches');
      return;
    }

    if (data.fromLocationId === data.toLocationId) {
      toast.error('Source and Destination branches must be different');
      return;
    }

    if (!data.items || data.items.length === 0) {
      toast.error('Please add at least one product item to transfer');
      return;
    }

    // Validate all items
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (!item.productId) {
        toast.error(`Item #${i + 1} has no product selected`);
        return;
      }
      const qty = Number(item.quantity);
      if (isNaN(qty) || qty <= 0) {
        toast.error(`Item #${i + 1} must have a valid quantity greater than 0`);
        return;
      }
      const sourceStock = getProductStockAtSource(item.productId);
      if (qty > sourceStock) {
        const prod = products.find(p => p.id === item.productId);
        toast.error(`Insufficient stock for "${prod?.name || 'Product'}". Available at source: ${sourceStock}, Requested: ${qty}`);
        return;
      }
    }

    const fromLocation = locations.find(l => l.id === data.fromLocationId);
    const toLocation = locations.find(l => l.id === data.toLocationId);

    if (!fromLocation || !toLocation) {
      toast.error('Invalid location selection');
      return;
    }

    try {
      const toastId = toast.loading('Executing batch branch stock transfer...');
      const batch = writeBatch(db);

      const itemsDetail = data.items.map(item => {
        const prod = products.find(p => p.id === item.productId);
        const qty = Number(item.quantity);

        // Update product document in Firestore
        const productRef = doc(db, 'products', item.productId);
        batch.update(productRef, {
          [`stocks.${data.fromLocationId}`]: increment(-qty),
          [`stocks.${data.toLocationId}`]: increment(qty),
          locationIds: arrayUnion(data.toLocationId),
          updatedAt: Timestamp.now()
        });

        return {
          productId: item.productId,
          productName: prod?.name || 'Unknown',
          productSku: prod?.sku || 'N/A',
          quantity: qty,
          unitCost: prod?.cost || 0,
          notes: item.notes || ''
        };
      });

      // Commit the product inventory updates atomically
      await batch.commit();

      // Record transfer manifest
      const transferRecord = {
        transferNumber: data.transferNumber || `TR-${Date.now().toString().slice(-6)}`,
        fromLocationId: data.fromLocationId,
        fromLocationName: fromLocation.name,
        toLocationId: data.toLocationId,
        toLocationName: toLocation.name,
        items: itemsDetail,
        totalItems: itemsDetail.length,
        totalQuantity: totalTransferUnits,
        reason: data.reason || 'Branch stock replenishment',
        status: 'completed',
        transferredBy: user.uid,
        transferredByName: profile.name || user.email || 'Staff',
        timestamp: Timestamp.now(),
        createdAt: Timestamp.now()
      };

      const docRef = await addDoc(collection(db, 'stockTransfers'), transferRecord);

      // Audit logging
      await logAction(
        profile, 
        'STOCK_TRANSFER', 
        `Transferred ${totalTransferUnits} unit(s) (${itemsDetail.length} item lines) from ${fromLocation.name} to ${toLocation.name} [Ref: ${transferRecord.transferNumber}]`,
        docRef.id,
        'stockTransfer'
      );

      // Supabase synchronization
      supabaseService.logAudit({
        userId: user.uid,
        userName: profile.name || user.email || 'Staff',
        action: 'STOCK_TRANSFER',
        details: `Transferred ${totalTransferUnits} items from ${fromLocation.name} to ${toLocation.name}`,
        targetId: docRef.id
      }).catch(() => {});

      toast.dismiss(toastId);
      toast.success(`Successfully transferred ${totalTransferUnits} item(s) from ${fromLocation.name} to ${toLocation.name}!`);
      
      reset({
        transferNumber: `TR-${Date.now().toString().slice(-6)}`,
        fromLocationId: '',
        toLocationId: '',
        reason: '',
        items: [{ productId: '', quantity: 1, notes: '' }]
      });
      onClose();
    } catch (error) {
      toast.dismiss();
      handleFirestoreError(error, OperationType.UPDATE, 'products');
    }
  };

  const handleScanProduct = (rowIndex: number) => {
    setScannerRowIndex(rowIndex);
    setIsScannerOpen(true);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-700">
                <ArrowRightLeft className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  Branch Stock Transfer Manifest
                  <Badge variant="outline" className="bg-indigo-50/80 text-indigo-700 border-indigo-200 text-[10px] font-mono">
                    Multi-Item Engine
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Transfer multiple inventory items simultaneously between warehouse locations or retail branches.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-4">
          {/* Header Grid: Transfer #, Source, Destination, Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500">Transfer Number</Label>
              <Input 
                {...register('transferNumber', { required: true })} 
                className="bg-white border-slate-200 rounded-xl text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500">Source Branch (From)</Label>
              <Select 
                value={watchFromLocationId} 
                onValueChange={(val) => setValue('fromLocationId', val)}
              >
                <SelectTrigger className="bg-white border-slate-200 rounded-xl text-xs">
                  <SelectValue placeholder="Select origin branch" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500">Destination Branch (To)</Label>
              <Select 
                value={watchToLocationId} 
                onValueChange={(val) => setValue('toLocationId', val)}
              >
                <SelectTrigger className="bg-white border-slate-200 rounded-xl text-xs">
                  <SelectValue placeholder="Select destination branch" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id} disabled={l.id === watchFromLocationId}>
                      {l.name} {l.id === watchFromLocationId ? '(Source)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-500">Reason / Notes</Label>
              <Input 
                {...register('reason')} 
                placeholder="e.g. Branch restocking"
                className="bg-white border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          {/* Transfer Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Transfer Line Items ({fields.length})</h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ productId: '', quantity: 1, notes: '' })}
                className="h-8 text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Another Product
              </Button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="text-xs font-bold w-[40%]">Product Item</TableHead>
                    <TableHead className="text-xs font-bold text-center w-[15%]">Source Stock</TableHead>
                    <TableHead className="text-xs font-bold text-center w-[15%]">Dest Stock</TableHead>
                    <TableHead className="text-xs font-bold w-[15%]">Transfer Qty</TableHead>
                    <TableHead className="text-xs font-bold text-right w-[15%]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const currentProductId = watchItems[index]?.productId;
                    const sourceStock = getProductStockAtSource(currentProductId);
                    const destStock = getProductStockAtDest(currentProductId);
                    const currentQty = Number(watchItems[index]?.quantity || 0);
                    const isOverStock = currentProductId && watchFromLocationId && currentQty > sourceStock;

                    return (
                      <TableRow key={field.id} className={cn("hover:bg-slate-50/50", isOverStock && "bg-rose-50/40")}>
                        <TableCell className="align-middle py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Select
                                value={currentProductId}
                                onValueChange={(val) => setValue(`items.${index}.productId` as any, val)}
                              >
                                <SelectTrigger className="h-9 text-xs bg-white border-slate-200 rounded-xl">
                                  <SelectValue placeholder="Select product to transfer..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {products.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name} ({p.sku || 'No SKU'})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 border-slate-200 hover:bg-slate-100 rounded-xl shrink-0"
                              onClick={() => handleScanProduct(index)}
                              title="Scan Barcode"
                            >
                              <Scan className="w-3.5 h-3.5 text-indigo-600" />
                            </Button>
                          </div>
                        </TableCell>

                        <TableCell className="text-center align-middle py-2.5">
                          {currentProductId && watchFromLocationId ? (
                            <Badge variant="outline" className={cn(
                              "text-xs font-bold",
                              sourceStock > 0 ? "bg-slate-100 text-slate-700" : "bg-rose-50 text-rose-600 border-rose-200"
                            )}>
                              {sourceStock} units
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center align-middle py-2.5">
                          {currentProductId && watchToLocationId ? (
                            <Badge variant="outline" className="text-xs font-bold bg-slate-100 text-slate-700">
                              {destStock} units
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>

                        <TableCell className="align-middle py-2.5">
                          <div className="space-y-1">
                            <Input
                              type="number"
                              min={1}
                              max={sourceStock > 0 ? sourceStock : undefined}
                              className={cn(
                                "h-9 text-xs font-bold text-center rounded-xl bg-white border-slate-200",
                                isOverStock && "border-rose-400 ring-1 ring-rose-300 text-rose-700"
                              )}
                              {...register(`items.${index}.quantity` as any, { 
                                required: true, 
                                min: 1,
                                valueAsNumber: true 
                              })}
                            />
                            {isOverStock && (
                              <p className="text-[10px] text-rose-600 font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" /> Exceeds source stock ({sourceStock})
                              </p>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-right align-middle py-2.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={fields.length <= 1}
                            onClick={() => remove(index)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
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

          {/* Summary & Live Impact Banner */}
          <div className="bg-indigo-50/70 border border-indigo-100 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-slate-500 font-medium block text-[10px] uppercase">Unique Products</span>
                <span className="font-black text-slate-800 text-sm">{totalUniqueItems} lines</span>
              </div>
              <div className="w-px h-8 bg-indigo-200/60" />
              <div>
                <span className="text-slate-500 font-medium block text-[10px] uppercase">Total Units to Transfer</span>
                <span className="font-black text-indigo-700 text-sm">{totalTransferUnits.toLocaleString()} units</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="px-3 py-1 bg-white rounded-lg border border-indigo-100 shadow-2xs font-bold text-slate-700">
                From: {locations.find(l => l.id === watchFromLocationId)?.name || 'Select Origin'}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
              <span className="px-3 py-1 bg-white rounded-lg border border-indigo-100 shadow-2xs font-bold text-slate-700">
                To: {locations.find(l => l.id === watchToLocationId)?.name || 'Select Dest'}
              </span>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose} 
              className="rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || totalUniqueItems === 0} 
              className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl text-xs font-bold px-6 shadow-md"
            >
              {isSubmitting ? 'Transferring Items...' : `Execute Transfer (${totalTransferUnits} Units)`}
            </Button>
          </DialogFooter>
        </form>

        <BarcodeScanner 
          isOpen={isScannerOpen} 
          onClose={() => {
            setIsScannerOpen(false);
            setScannerRowIndex(null);
          }} 
          onScan={(scanned) => {
            const matched = products.find(p => 
              p.barcode?.toLowerCase() === scanned.toLowerCase() ||
              p.sku?.toLowerCase() === scanned.toLowerCase()
            );
            if (matched && scannerRowIndex !== null) {
              setValue(`items.${scannerRowIndex}.productId` as any, matched.id);
              toast.success(`Scanned and selected: ${matched.name}`);
            } else {
              toast.error(`No item matches barcode: "${scanned}"`);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
