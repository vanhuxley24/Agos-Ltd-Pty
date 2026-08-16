import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Product, Category, Brand, Supplier, Location, PriceTier } from '@/types';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, Timestamp, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { logAction } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { Separator } from './ui/separator';
import { MapPin, Scan } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';

interface ProductFormProps {
  product?: Product | null;
  products: Product[];
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
  isOpen: boolean;
  onClose: () => void;
}

export const ProductForm: React.FC<ProductFormProps> = ({ 
  product, 
  products,
  categories, 
  brands,
  suppliers, 
  isOpen, 
  onClose 
}) => {
  const { profile, isAdmin } = useAuth();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [tierPrices, setTierPrices] = useState<{ [key: string]: number }>({});
  const [locationThresholds, setLocationThresholds] = useState<{ [key: string]: number }>({});
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  const { register, handleSubmit, reset, setValue, watch } = useForm({
    defaultValues: {
      name: '',
      sku: '',
      barcode: '',
      category: '',
      brand: '',
      price: 0,
      cost: 0,
      imageUrl: '',
      description: '',
      supplierId: '',
      lowStockThreshold: 5,
    }
  });

  const watchCategory = watch('category');
  const watchBrand = watch('brand');
  const watchSupplierId = watch('supplierId');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'locations'), (snapshot) => {
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
    });

    const unsubscribeTiers = onSnapshot(collection(db, 'priceTiers'), (snapshot) => {
      setPriceTiers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PriceTier)));
    });

    return () => {
      unsubscribe();
      unsubscribeTiers();
    };
  }, []);

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        sku: product.sku,
        barcode: product.barcode || '',
        category: product.category,
        brand: product.brand || '',
        price: product.price,
        cost: product.cost,
        imageUrl: product.imageUrl || '',
        description: product.description || '',
        supplierId: product.supplierId || '',
        lowStockThreshold: product.lowStockThreshold || 5,
      });
      setTierPrices(product.tierPrices || {});
      setLocationThresholds(product.locationThresholds || {});
    } else {
      reset({
        name: '',
        sku: '',
        barcode: '',
        category: '',
        brand: '',
        price: 0,
        cost: 0,
        imageUrl: '',
        description: '',
        supplierId: '',
        lowStockThreshold: 5,
      });
      setTierPrices({});
      setLocationThresholds({});
    }
  }, [product, reset, isOpen]);

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      // Duplicate SKU Check
      const isDuplicateSku = products.some(p => 
        p.sku.toLowerCase() === data.sku.trim().toLowerCase() && 
        p.id !== product?.id
      );

      if (isDuplicateSku) {
        toast.error(`Product with SKU "${data.sku}" already exists`);
        setLoading(false);
        return;
      }

      // Duplicate Barcode Check
      if (data.barcode?.trim()) {
        const isDuplicateBarcode = products.some(p => 
          p.barcode?.trim().toLowerCase() === data.barcode.trim().toLowerCase() && 
          p.id !== product?.id
        );

        if (isDuplicateBarcode) {
          toast.error(`Product with Barcode "${data.barcode}" already exists`);
          setLoading(false);
          return;
        }
      }

      const productData = {
        ...data,
        price: Number(data.price),
        cost: Number(data.cost),
        tierPrices: Object.fromEntries(
          Object.entries(tierPrices).map(([k, v]) => [k, Number(v)])
        ),
        locationThresholds: Object.fromEntries(
          Object.entries(locationThresholds).map(([k, v]) => [k, Number(v)])
        ),
        lowStockThreshold: Number(data.lowStockThreshold),
        updatedAt: Timestamp.now()
      };

      if (product) {
        await updateDoc(doc(db, 'products', product.id), productData);
        await logAction(profile, 'UPDATE_PRODUCT', `Updated product: ${productData.name} (SKU: ${productData.sku})`, product.id, 'product');
        toast.success('Product updated successfully');
      } else {
        const docRef = await addDoc(collection(db, 'products'), {
          ...productData,
          stock: 0,
          stocks: {},
          locationIds: [],
          createdAt: Timestamp.now()
        });
        await logAction(profile, 'CREATE_PRODUCT', `Created product: ${productData.name} (SKU: ${productData.sku})`, docRef.id, 'product');
        toast.success('Product added successfully');
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, product ? OperationType.UPDATE : OperationType.CREATE, 'products');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] md:min-h-[600px] max-h-[95vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'Add New Product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col">
          <Tabs defaultValue="general" className="w-full flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 mb-2">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-1 py-2 min-h-[350px]">
              <TabsContent value="general" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="name">Product Name</Label>
                    <Input id="name" {...register('name', { required: true })} placeholder="e.g. Wireless Mouse" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input id="sku" {...register('sku', { required: true })} placeholder="e.g. WM-001" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="barcode">Barcode (Optional)</Label>
                    <div className="flex gap-1.5">
                      <Input id="barcode" {...register('barcode')} placeholder="e.g. 4801234567890" />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="border-[#D4AF37] hover:bg-[#D4AF37]/10 flex-shrink-0"
                        onClick={() => setIsScannerOpen(true)}
                        title="Scan with Camera"
                      >
                        <Scan className="w-4 h-4 text-[#D4AF37]" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select 
                      onValueChange={(value) => setValue('category', value)} 
                      value={watchCategory}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category">
                          {watchCategory || 'Select category'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand">Brand</Label>
                    <Select 
                      onValueChange={(value) => setValue('brand', value)} 
                      value={watchBrand}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select brand">
                          {watchBrand || 'Select brand'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map((brand) => (
                          <SelectItem key={brand.id} value={brand.name}>{brand.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="supplierId">Supplier</Label>
                    <Select 
                      onValueChange={(value) => setValue('supplierId', value)} 
                      value={watchSupplierId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier">
                          {suppliers.find(s => s.id === watchSupplierId)?.name || 'Select supplier'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((sup) => (
                          <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="imageUrl">Product Image URL</Label>
                    <Input id="imageUrl" {...register('imageUrl')} placeholder="e.g. https://example.com/image.jpg" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <textarea 
                      id="description" 
                      {...register('description')} 
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Brief product description..."
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4 mt-0 text-left">
                <div className="grid grid-cols-2 gap-4">
                  {isAdmin ? (
                    <div className="space-y-2">
                      <Label htmlFor="cost">Cost Price ({settings.currency})</Label>
                      <Input id="cost" type="number" step="0.01" {...register('cost', { required: true })} />
                    </div>
                  ) : (
                    <input type="hidden" {...register('cost')} />
                  )}
                  <div className={cn("space-y-2", !isAdmin && "col-span-2")}>
                    <Label htmlFor="price">Selling Price ({settings.currency})</Label>
                    <Input id="price" type="number" step="0.01" {...register('price', { required: true })} />
                  </div>

                  {priceTiers.length > 0 && (
                    <div className="col-span-2 space-y-4 pt-2">
                      <Separator />
                      <Label className="text-[#D4AF37] font-bold uppercase text-[10px] tracking-widest">Tier Pricing</Label>
                      <div className="grid grid-cols-2 gap-4">
                        {priceTiers.map(tier => (
                          <div key={tier.id} className="space-y-2">
                            <Label htmlFor={`tier-${tier.id}`}>{tier.name} Price</Label>
                            <Input 
                              id={`tier-${tier.id}`}
                              type="number"
                              step="0.01"
                              value={tierPrices[tier.id] || ''}
                              onChange={(e) => setTierPrices({ ...tierPrices, [tier.id]: Number(e.target.value) })}
                              placeholder={`Price for ${tier.name}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="inventory" className="space-y-4 mt-0 text-left">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lowStockThreshold">Default Low Stock Threshold</Label>
                    <Input id="lowStockThreshold" type="number" {...register('lowStockThreshold')} />
                    <p className="text-[10px] text-muted-foreground">Used if location-specific threshold is not set.</p>
                  </div>

                  {locations.length > 0 && (
                    <div className="space-y-4 pt-2">
                      <Separator />
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#D4AF37]" />
                        <Label className="text-[#D4AF37] font-bold uppercase text-[10px] tracking-widest">Location Specific Thresholds</Label>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {locations.map(loc => (
                          <div key={loc.id} className="space-y-2">
                            <Label htmlFor={`threshold-${loc.id}`} className="text-xs">{loc.name} Alert Level</Label>
                            <Input 
                              id={`threshold-${loc.id}`}
                              type="number"
                              value={locationThresholds[loc.id] ?? ''}
                              onChange={(e) => setLocationThresholds({ ...locationThresholds, [loc.id]: Number(e.target.value) })}
                              placeholder={`e.g. 10`}
                              className="h-8 text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="pt-6 border-t mt-auto px-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : product ? 'Update Product' : 'Add Product'}
            </Button>
          </DialogFooter>
        </form>
        <BarcodeScanner 
          isOpen={isScannerOpen} 
          onClose={() => setIsScannerOpen(false)} 
          onScan={(scanned) => setValue('barcode', scanned, { shouldDirty: true })} 
        />
      </DialogContent>
    </Dialog>
  );
};
