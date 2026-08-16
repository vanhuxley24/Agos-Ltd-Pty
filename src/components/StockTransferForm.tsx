import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { Scan, ArrowRight } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Product, Location } from '@/types';
import { db } from '@/lib/firebase';
import { doc, updateDoc, collection, addDoc, Timestamp, arrayUnion, increment } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { logAction } from '@/lib/audit';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';

interface StockTransferFormProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  locations: Location[];
}

interface TransferFormData {
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  reason: string;
}

export const StockTransferForm: React.FC<StockTransferFormProps> = ({ 
  isOpen, 
  onClose, 
  products, 
  locations 
}) => {
  const { profile, user } = useAuth();
  const { register, handleSubmit, watch, setValue, reset, formState: { isSubmitting, errors } } = useForm<TransferFormData>({
    defaultValues: {
      productId: '',
      fromLocationId: '',
      toLocationId: '',
      quantity: 1,
      reason: ''
    }
  });

  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const watchProductId = watch('productId');
  const watchFromLocationId = watch('fromLocationId');
  const watchToLocationId = watch('toLocationId');

  const selectedProduct = products.find(p => p.id === watchProductId);
  const stockAtSource = selectedProduct?.stocks?.[watchFromLocationId] || 0;
  const stockAtDest = selectedProduct?.stocks?.[watchToLocationId] || 0;

  const onSubmit = async (data: TransferFormData) => {
    if (!profile || !user) return;
    if (!selectedProduct) {
      toast.error('Please select a product');
      return;
    }

    if (!data.fromLocationId || !data.toLocationId) {
      toast.error('Please specify both source and destination locations');
      return;
    }

    if (data.fromLocationId === data.toLocationId) {
      toast.error('Source and destination locations must be different');
      return;
    }

    if (stockAtSource < data.quantity) {
      toast.error(`Insufficient stock at source location. Available: ${stockAtSource}`);
      return;
    }

    const fromLocation = locations.find(l => l.id === data.fromLocationId);
    const toLocation = locations.find(l => l.id === data.toLocationId);

    if (!fromLocation || !toLocation) {
      toast.error('Invalid location selection');
      return;
    }

    try {
      const toastId = toast.loading('Processing stock transfer...');

      const newFromStock = Number(stockAtSource) - Number(data.quantity);
      const newToStock = Number(stockAtDest) + Number(data.quantity);

      // Update Product stocks atomically
      const productRef = doc(db, 'products', data.productId);
      await updateDoc(productRef, {
        [`stocks.${data.fromLocationId}`]: increment(-Number(data.quantity)),
        [`stocks.${data.toLocationId}`]: increment(Number(data.quantity)),
        locationIds: arrayUnion(data.toLocationId),
        updatedAt: Timestamp.now()
      });

      // Record Transfer
      const transferRecord = {
        productId: data.productId,
        productName: selectedProduct.name,
        productSku: selectedProduct.sku,
        fromLocationId: data.fromLocationId,
        fromLocationName: fromLocation.name,
        toLocationId: data.toLocationId,
        toLocationName: toLocation.name,
        quantity: Number(data.quantity),
        reason: data.reason,
        transferredBy: user.uid,
        transferredByName: profile.name || user.email || 'Unknown',
        timestamp: Timestamp.now()
      };

      await addDoc(collection(db, 'stockTransfers'), transferRecord);

      // Log action for audit trails
      await logAction(
        profile, 
        'STOCK_TRANSFER', 
        `Transferred ${data.quantity} of ${selectedProduct.name} from ${fromLocation.name} to ${toLocation.name}`,
        data.productId,
        'product'
      );

      toast.dismiss(toastId);
      toast.success('Stock transferred successfully!');
      reset();
      onClose();
    } catch (error) {
      toast.dismiss();
      handleFirestoreError(error, OperationType.UPDATE, 'products');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900">Branch Stock Transfer</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Transfer inventory counts from one warehouse or retail branch to another.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-3">
          {/* Product Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">Product</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select 
                  value={watchProductId} 
                  onValueChange={(val) => setValue('productId', val)}
                >
                  <SelectTrigger className="rounded-xl border-slate-200">
                    <SelectValue placeholder="Select product">
                      {selectedProduct ? `${selectedProduct.name} (${selectedProduct.sku})` : 'Select product'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="border-slate-200 hover:bg-slate-50 rounded-xl flex-shrink-0"
                onClick={() => setIsScannerOpen(true)}
                title="Scan Product Barcode"
              >
                <Scan className="w-4 h-4 text-indigo-600" />
              </Button>
            </div>
          </div>

          {/* Locations Select Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500">From (Source)</Label>
              <Select 
                value={watchFromLocationId} 
                onValueChange={(val) => setValue('fromLocationId', val)}
              >
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500">To (Destination)</Label>
              <Select 
                value={watchToLocationId} 
                onValueChange={(val) => setValue('toLocationId', val)}
              >
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Live stock preview helper */}
          {watchProductId && (watchFromLocationId || watchToLocationId) && (
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
              <div className="text-center flex-1">
                <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5">Source Stock</span>
                <span className={stockAtSource > 0 ? "text-slate-800 font-black text-sm" : "text-rose-500 font-black text-sm"}>
                  {watchFromLocationId ? stockAtSource : '-'}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 mx-2" />
              <div className="text-center flex-1">
                <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5">Dest Stock</span>
                <span className="text-slate-800 font-black text-sm">
                  {watchToLocationId ? stockAtDest : '-'}
                </span>
              </div>
            </div>
          )}

          {/* Quantity Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">Transfer Quantity</Label>
            <Input 
              type="number" 
              {...register('quantity', { 
                required: 'Quantity is required', 
                min: { value: 1, message: 'Must transfer at least 1 unit' },
                valueAsNumber: true
              })} 
              className="rounded-xl border-slate-200"
              placeholder="Enter transfer volume"
            />
            {errors.quantity && <p className="text-xs text-rose-500 font-semibold">{errors.quantity.message}</p>}
          </div>

          {/* Reason Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">Reason / Description</Label>
            <Input 
              {...register('reason', { required: 'Please describe the reason for this transfer' })} 
              className="rounded-xl border-slate-200"
              placeholder="e.g. Replenish retail branch, seasonal demand"
            />
            {errors.reason && <p className="text-xs text-rose-500 font-semibold">{errors.reason.message}</p>}
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6">
              {isSubmitting ? 'Transferring...' : 'Execute Transfer'}
            </Button>
          </DialogFooter>
        </form>

        <BarcodeScanner 
          isOpen={isScannerOpen} 
          onClose={() => setIsScannerOpen(false)} 
          onScan={(scanned) => {
            const matched = products.find(p => 
              p.barcode?.toLowerCase() === scanned.toLowerCase() ||
              p.sku?.toLowerCase() === scanned.toLowerCase()
            );
            if (matched) {
              setValue('productId', matched.id);
              toast.success(`Found: ${matched.name}`);
            } else {
              toast.error(`No item matches barcode: "${scanned}"`);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
