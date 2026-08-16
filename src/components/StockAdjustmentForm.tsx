import React, { useState, useEffect } from 'react';
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
import { Scan } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Product, Location, StockAdjustment } from '@/types';
import { db } from '@/lib/firebase';
import { doc, updateDoc, collection, addDoc, Timestamp, increment, arrayUnion } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { logAction } from '@/lib/audit';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';

interface StockAdjustmentFormProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  locations: Location[];
  initialProductId?: string;
}

interface FormData {
  productId: string;
  locationId: string;
  type: 'add' | 'subtract' | 'set';
  quantity: number;
  reason: string;
}

export const StockAdjustmentForm: React.FC<StockAdjustmentFormProps> = ({ 
  isOpen, 
  onClose, 
  products, 
  locations,
  initialProductId 
}) => {
  const { profile, user } = useAuth();
  const { register, handleSubmit, watch, setValue, reset, formState: { isSubmitting, errors } } = useForm<FormData>({
    defaultValues: {
      productId: initialProductId || '',
      locationId: '',
      type: 'add',
      quantity: 0,
      reason: ''
    }
  });

  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const watchProductId = watch('productId');
  const watchLocationId = watch('locationId');
  const watchType = watch('type');
  const watchQuantity = watch('quantity');

  const selectedProduct = products.find(p => p.id === watchProductId);
  const currentStockAtLocation = selectedProduct?.stocks?.[watchLocationId] || 0;

  useEffect(() => {
    if (initialProductId) {
      setValue('productId', initialProductId);
    }
  }, [initialProductId, setValue]);

  const onSubmit = async (data: FormData) => {
    if (!profile || !user) return;
    if (!selectedProduct) {
      toast.error('Please select a product');
      return;
    }

    const selectedLocation = locations.find(l => l.id === data.locationId);
    if (!selectedLocation) {
      toast.error('Please select a location');
      return;
    }

    try {
      const toastId = toast.loading('Adjusting stock...');
      let newStockAtLocation = currentStockAtLocation;
      let adjustmentAmount = 0;

      if (data.type === 'add') {
        adjustmentAmount = Number(data.quantity);
        newStockAtLocation += adjustmentAmount;
      } else if (data.type === 'subtract') {
        adjustmentAmount = -Number(data.quantity);
        newStockAtLocation += adjustmentAmount;
      } else if (data.type === 'set') {
        adjustmentAmount = Number(data.quantity) - currentStockAtLocation;
        newStockAtLocation = Number(data.quantity);
      }

      // Update Product
      const productRef = doc(db, 'products', data.productId);
      const updateData: any = {
        stock: increment(adjustmentAmount),
        locationIds: arrayUnion(data.locationId),
        updatedAt: Timestamp.now()
      };

      if (data.type === 'set') {
        updateData[`stocks.${data.locationId}`] = newStockAtLocation;
      } else {
        updateData[`stocks.${data.locationId}`] = increment(adjustmentAmount);
      }

      await updateDoc(productRef, updateData);

      // Record Adjustment
      const adjustment: Omit<StockAdjustment, 'id'> = {
        productId: data.productId,
        productName: selectedProduct.name,
        locationId: data.locationId,
        locationName: selectedLocation.name,
        previousStock: currentStockAtLocation,
        adjustmentQuantity: adjustmentAmount,
        newStock: newStockAtLocation,
        type: data.type,
        reason: data.reason,
        adjustedBy: user.uid,
        adjustedByName: profile.name || user.email || 'Unknown',
        timestamp: Timestamp.now()
      };

      await addDoc(collection(db, 'stockAdjustments'), adjustment);

      await logAction(
        profile, 
        'STOCK_ADJUSTMENT', 
        `Adjusted stock for ${selectedProduct.name} at ${selectedLocation.name}: ${data.type} ${data.quantity} (New: ${newStockAtLocation})`,
        data.productId,
        'product'
      );

      toast.dismiss(toastId);
      toast.success('Stock adjusted successfully');
      reset();
      onClose();
    } catch (error) {
      toast.dismiss();
      handleFirestoreError(error, OperationType.UPDATE, 'products');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Stock Adjustment</DialogTitle>
          <DialogDescription>
            Manually update stock levels for a specific product and location.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <Select 
                  value={watchProductId} 
                  onValueChange={(val) => setValue('productId', val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product">
                      {products.find(p => p.id === watchProductId) ? `${products.find(p => p.id === watchProductId)?.name} (${products.find(p => p.id === watchProductId)?.sku})` : 'Select product'}
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
                className="border-[#D4AF37] hover:bg-[#D4AF37]/10 flex-shrink-0"
                onClick={() => setIsScannerOpen(true)}
                title="Scan Product Barcode"
              >
                <Scan className="w-4 h-4 text-[#D4AF37]" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Location</Label>
            <Select 
              value={watchLocationId} 
              onValueChange={(val) => setValue('locationId', val)}
            >
              <SelectTrigger>
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

          {watchProductId && watchLocationId && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center">
              <span className="text-sm text-slate-500">Current Stock at Location:</span>
              <span className="font-bold text-slate-900">{currentStockAtLocation}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <Select 
                value={watchType} 
                onValueChange={(val: any) => setValue('type', val)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {watchType === 'add' ? 'Add (+)' : 
                     watchType === 'subtract' ? 'Subtract (-)' : 
                     watchType === 'set' ? 'Set To (=)' : watchType}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add (+)</SelectItem>
                  <SelectItem value="subtract">Subtract (-)</SelectItem>
                  <SelectItem value="set">Set To (=)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input 
                type="number" 
                {...register('quantity', { 
                  required: 'Quantity is required', 
                  min: { value: 0, message: 'Quantity must be at least 0' },
                  valueAsNumber: true
                })} 
                placeholder="0"
              />
              {errors.quantity && <p className="text-xs text-rose-500">{errors.quantity.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason for Adjustment</Label>
            <Input 
              {...register('reason', { required: 'Reason is required' })} 
              placeholder="e.g. Damage, Loss, Correction"
            />
            {errors.reason && <p className="text-xs text-rose-500">{errors.reason.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
              {isSubmitting ? 'Adjusting...' : 'Confirm Adjustment'}
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
              toast.success(`Matched: ${matched.name}`);
            } else {
              toast.error(`No product found matching barcode "${scanned}"`);
            }
          }}
        />
      </DialogContent>

    </Dialog>
  );
};
