import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DataTablePagination } from '@/components/DataTablePagination';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  AlertTriangle,
  MoreVertical,
  ArrowUpDown,
  ShoppingCart,
  ArrowRightLeft
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Product, Category, Brand, Supplier, Location } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useLocations } from '@/contexts/LocationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { logAction } from '@/lib/audit';
import { supabaseService } from '@/lib/supabase-service';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ProductForm } from '@/components/ProductForm';
import { StockAdjustmentForm } from '@/components/StockAdjustmentForm';
import { StockTransferForm } from '@/components/StockTransferForm';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { cn } from '@/lib/utils';
import { 
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MapPin } from 'lucide-react';
import { motion } from 'motion/react';

export const Inventory: React.FC = () => {
  const { profile, isAdmin, isManager } = useAuth();
  const { selectedLocationId, locations } = useLocations();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [excludeZeroStock, setExcludeZeroStock] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingProductId, setAdjustingProductId] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(productList);
      setLoading(false);
    }, (error) => {
      console.warn("Inventory: Error listening to products:", error);
      setLoading(false);
    });

    const unsubscribeCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    }, (error) => {
      console.warn("Inventory: Error listening to categories:", error);
    });

    const unsubscribeSups = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
    }, (error) => {
      console.warn("Inventory: Error listening to suppliers:", error);
    });

    const unsubscribeBrands = onSnapshot(collection(db, 'brands'), (snapshot) => {
      setBrands(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Brand)));
    }, (error) => {
      console.warn("Inventory: Error listening to brands:", error);
    });

    return () => {
      unsubscribe();
      unsubscribeCats();
      unsubscribeSups();
      unsubscribeBrands();
    };
  }, [profile?.id]);

  const handleDelete = async (id: string) => {
    if (!isManager) {
      toast.error('You do not have permission to delete products');
      return;
    }
    const product = products.find(p => p.id === id);
    if (window.confirm(`Are you sure you want to delete "${product?.name}"?`)) {
      try {
        await deleteDoc(doc(db, 'products', id));
        supabaseService.deleteProduct(id).catch(() => {});
        await logAction(profile, 'DELETE_PRODUCT', `Deleted product: ${product?.name} (SKU: ${product?.sku})`, id, 'product');
        toast.success('Product deleted');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'products');
      }
    }
  };

  const getDisplayStock = (product: Product) => {
    if (!isAdmin && !isManager) {
      const userLocId = profile?.locationId;
      if (!userLocId) return 0;
      return Number(product.stocks?.[userLocId] || 0);
    }
    if (selectedLocationId === 'all') {
      return Object.values(product.stocks || {}).reduce((sum, val) => (sum as number) + Number(val), 0) as number;
    }
    return Number(product.stocks?.[selectedLocationId] || 0);
  };

  const isLowStock = (product: Product, locationId: string) => {
    const locId = (isAdmin || isManager) ? locationId : (profile?.locationId || 'none');
    if (locId === 'none') return false;

    const stock = locId === 'all' 
      ? Object.values(product.stocks || {}).reduce((sum, val) => (sum as number) + Number(val), 0) as number
      : Number(product.stocks?.[locId] || 0);
    
    const threshold = locId === 'all' 
      ? product.lowStockThreshold 
      : (product.locationThresholds?.[locId] ?? product.lowStockThreshold);
      
    return stock > 0 && stock <= threshold;
  };

  const isOutOfStock = (product: Product, locationId: string) => {
    const locId = (isAdmin || isManager) ? locationId : (profile?.locationId || 'none');
    if (locId === 'none') return true;

    const stock = locId === 'all' 
      ? Object.values(product.stocks || {}).reduce((sum, val) => (sum as number) + Number(val), 0) as number
      : Number(product.stocks?.[locId] || 0);
    return stock <= 0;
  };

  const visibleProducts = products.filter(p => {
    if (isAdmin || isManager) return true;
    const userLocId = profile?.locationId;
    if (!userLocId) return false;
    return (p.locationIds && p.locationIds.includes(userLocId)) || 
           (p.stocks && p.stocks[userLocId] !== undefined && Number(p.stocks[userLocId]) > 0);
  });

  const filteredProducts = visibleProducts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;
    
    // Filter by global location
    const matchesLocation = selectedLocationId === 'all' || 
                            (p.locationIds && p.locationIds.includes(selectedLocationId)) ||
                            (p.stocks && p.stocks[selectedLocationId] !== undefined && Number(p.stocks[selectedLocationId]) > 0);
    
    const stock = getDisplayStock(p);
    const matchesZeroStock = !excludeZeroStock || stock > 0;
    
    return matchesSearch && matchesCategory && matchesBrand && matchesLocation && matchesZeroStock;
  });

  const zeroStockCount = visibleProducts.filter(p => {
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;
    const matchesLocation = selectedLocationId === 'all' || 
                            (p.locationIds && p.locationIds.includes(selectedLocationId)) ||
                            (p.stocks && p.stocks[selectedLocationId] !== undefined && Number(p.stocks[selectedLocationId]) > 0);
    return matchesCategory && matchesBrand && matchesLocation && getDisplayStock(p) <= 0;
  }).length;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, brandFilter, selectedLocationId, excludeZeroStock]);

  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#1A2B4B] tracking-tight">Inventory</h1>
          <p className="text-slate-500">Manage your products and stock levels.</p>
        </div>
        {isManager && (
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap lg:flex-nowrap gap-2 w-full sm:w-auto">
            <Button variant="outline" className="gap-2 border-[#D4AF37]/20 hover:bg-[#D4AF37]/5 text-xs sm:text-sm h-9 sm:h-8" onClick={() => setIsTransferOpen(true)}>
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Transfer Stock
            </Button>
            <Button variant="outline" className="gap-2 border-[#D4AF37]/20 hover:bg-[#D4AF37]/5 text-xs sm:text-sm h-9 sm:h-8" onClick={() => {
              setAdjustingProductId(undefined);
              setIsAdjustmentOpen(true);
            }}>
              <ArrowUpDown className="w-3.5 h-3.5" />
              Adjust Stock
            </Button>
            <Button variant="outline" className="gap-2 border-[#D4AF37]/20 hover:bg-[#D4AF37]/5 text-xs sm:text-sm h-9 sm:h-8" onClick={() => navigate('/purchasing')}>
              <ShoppingCart className="w-3.5 h-3.5" />
              Purchase Stock
            </Button>
            <Button className="gap-2 bg-[#1A2B4B] hover:bg-[#2C3E50] text-white text-xs sm:text-sm h-9 sm:h-8" onClick={() => {
              setEditingProduct(null);
              setIsFormOpen(true);
            }}>
              <Plus className="w-3.5 h-3.5" />
              Add Product
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            className="pl-10 bg-white/50 border-slate-200 focus:border-[#D4AF37] focus:ring-[#D4AF37]" 
            placeholder="Search products by name, SKU, or Barcode..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[150px] bg-white/50 border-slate-200">
              <SelectValue placeholder="Category">
                {categoryFilter === 'all' ? 'All Categories' : categoryFilter}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-full sm:w-[150px] bg-white/50 border-slate-200">
              <SelectValue placeholder="Brand">
                {brandFilter === 'all' ? 'All Brands' : brandFilter}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map(brand => (
                <SelectItem key={brand.id} value={brand.name}>{brand.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2.5 px-3 py-2 bg-white/70 border border-slate-200 rounded-md shadow-2xs shrink-0 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-2">
              <Switch 
                id="exclude-zero-stock"
                checked={excludeZeroStock}
                onCheckedChange={setExcludeZeroStock}
              />
              <Label htmlFor="exclude-zero-stock" className="text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap">
                Exclude Zero Stock
              </Label>
            </div>
            {zeroStockCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-bold bg-slate-100 text-slate-500 border border-slate-200/60 ml-auto sm:ml-0">
                {zeroStockCount} out
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="hidden md:block bg-white/50 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="w-[300px] text-[#1A2B4B] font-semibold">Product</TableHead>
              <TableHead className="text-[#1A2B4B] font-semibold">SKU</TableHead>
              <TableHead className="text-[#1A2B4B] font-semibold">Category</TableHead>
              <TableHead className="text-[#1A2B4B] font-semibold">Brand</TableHead>
              <TableHead className="text-[#1A2B4B] font-semibold">Price</TableHead>
              <TableHead className="text-[#1A2B4B] font-semibold">Stock</TableHead>
              <TableHead className="text-[#1A2B4B] font-semibold">Status</TableHead>
              <TableHead className="text-right text-[#1A2B4B] font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">Loading inventory...</TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2 py-4">
                    <Package className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">
                      {searchTerm 
                        ? 'No products found matching your search.' 
                        : excludeZeroStock && zeroStockCount > 0 
                          ? 'No in-stock products found matching selected filters.' 
                          : 'No products in inventory yet.'}
                    </p>
                    {excludeZeroStock && zeroStockCount > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs h-8 text-slate-700 hover:text-slate-900 border-slate-200 mt-1"
                        onClick={() => setExcludeZeroStock(false)}
                      >
                        Show {zeroStockCount} out-of-stock {zeroStockCount === 1 ? 'item' : 'items'}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedProducts.map((product, index) => {
                return (
                  <motion.tr 
                    key={product.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="group hover:bg-[#FDFCF8] transition-colors border-b last:border-0"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white flex-shrink-0 overflow-hidden border border-slate-100 group-hover:border-[#D4AF37]/30 transition-colors">
                          {product.imageUrl ? (
                            <img 
                              src={product.imageUrl} 
                              alt={product.name} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <Package className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-[#1A2B4B]">{product.name}</div>
                          {isAdmin && (
                            <div className="text-xs text-slate-500">Cost: {settings.currency}{(product.cost ?? 0).toFixed(2)}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs text-slate-600">{product.sku}</div>
                      {product.barcode && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5" title="Barcode">
                          ║ {product.barcode}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal bg-slate-100 text-slate-600 border-none">
                        {product.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal border-indigo-100 bg-indigo-50 text-indigo-600">
                        {product.brand || 'No Brand'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-[#1A2B4B]">{settings.currency}{(product.price ?? 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "font-medium",
                          isOutOfStock(product, selectedLocationId) 
                            ? "text-rose-600" 
                            : isLowStock(product, selectedLocationId) 
                              ? "text-amber-600 font-bold" 
                              : "text-[#1A2B4B]"
                        )}>
                          {getDisplayStock(product)}
                        </div>
                        {isAdmin && (
                          <Tooltip>
                            <TooltipTrigger 
                              render={
                                <div className="h-6 w-6 flex items-center justify-center text-slate-400 hover:bg-white hover:text-[#D4AF37] rounded-md cursor-pointer transition-colors">
                                  <MapPin className="w-3 h-3" />
                                </div>
                              }
                            />
                            <TooltipContent side="right" className="bg-white border-slate-200">
                                <div className="space-y-1.5 p-2 min-w-[150px]">
                                  <p className="text-[10px] font-black uppercase text-[#D4AF37] border-b border-[#D4AF37]/20 pb-1 mb-2 tracking-widest text-center">Stock & Alert Levels</p>
                                  {locations.map(loc => {
                                    const threshold = product.locationThresholds?.[loc.id] ?? product.lowStockThreshold;
                                    const stock = product.stocks?.[loc.id] || 0;
                                    const isLow = stock > 0 && stock <= threshold;
                                    
                                    return (
                                      <div key={loc.id} className="flex flex-col gap-0.5 mb-2 last:mb-0">
                                        <div className="flex justify-between items-center text-[11px]">
                                          <span className="text-slate-600 truncate max-w-[100px]">{loc.name}</span>
                                          <span className={cn(
                                            "font-black tracking-tight",
                                            stock <= 0 ? "text-rose-500" : isLow ? "text-amber-600" : "text-[#1A2B4B]"
                                          )}>{stock}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[9px] text-slate-400">
                                          <span>Alert Level:</span>
                                          <span>{threshold}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                    </TableCell>
                    <TableCell>
                      {isOutOfStock(product, selectedLocationId) ? (
                        <Badge variant="destructive" className="gap-1 bg-rose-50 text-rose-700 border-rose-100 shadow-sm">
                          <AlertTriangle className="w-3 h-3" />
                          Out of Stock
                        </Badge>
                      ) : isLowStock(product, selectedLocationId) ? (
                        <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700 shadow-sm">
                          <AlertTriangle className="w-3 h-3" />
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm font-bold">
                          Healthy
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isManager && (
                        <DropdownMenu>
                          <DropdownMenuTrigger 
                            render={
                              <Button variant="ghost" size="icon" className="hover:bg-white hover:text-[#1A2B4B]">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="bg-white border-slate-200">
                            <DropdownMenuItem onClick={() => {
                              setAdjustingProductId(product.id);
                              setIsAdjustmentOpen(true);
                            }}>
                              <ArrowUpDown className="w-4 h-4 mr-2" />
                              Adjust Stock
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setEditingProduct(product);
                              setIsFormOpen(true);
                            }}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-rose-600" onClick={() => handleDelete(product.id)}>
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </motion.tr>
                );
              })
            )}
          </TableBody>
        </Table>

        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredProducts.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={setCurrentPage => {
            setPageSize(setCurrentPage);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Mobile Card-Based Grid - optimized for smartphone scanning */}
      <div className="block md:hidden space-y-4">
        {loading ? (
          <div className="bg-white/80 p-8 rounded-2xl border border-slate-200 text-center text-slate-500 font-semibold animate-pulse">
            Loading interactive inventory...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white/80 p-8 rounded-2xl border border-slate-200 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
            <Package className="w-8 h-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              {searchTerm 
                ? 'No products found matching search.' 
                : excludeZeroStock && zeroStockCount > 0 
                  ? 'No in-stock products found matching selected filters.' 
                  : 'No products in inventory yet.'}
            </p>
            {excludeZeroStock && zeroStockCount > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs h-8 text-slate-700 hover:text-slate-900 border-slate-200 mt-1"
                onClick={() => setExcludeZeroStock(false)}
              >
                Show {zeroStockCount} out-of-stock {zeroStockCount === 1 ? 'item' : 'items'}
              </Button>
            )}
          </div>
        ) : (
          <>
            {paginatedProducts.map((product, index) => {
            const outOfStock = isOutOfStock(product, selectedLocationId);
            const lowStock = isLowStock(product, selectedLocationId);
            
            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.2) }}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3.5 relative overflow-hidden"
              >
                {/* Header Info Banner */}
                <div className="flex gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Package className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">{product.name}</div>
                    <div className="text-[11px] text-slate-500 font-medium">SKU: <span className="font-mono">{product.sku}</span></div>
                    {product.barcode && <div className="text-[10px] text-slate-400 font-mono mt-0.5">║ {product.barcode}</div>}
                  </div>
                  
                  {isManager && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-2">
                            <MoreVertical className="w-4 h-4 text-slate-500" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="bg-white border-slate-200">
                        <DropdownMenuItem onClick={() => {
                          setAdjustingProductId(product.id);
                          setIsAdjustmentOpen(true);
                        }}>
                          <ArrowUpDown className="w-4 h-4 mr-2 text-indigo-600" />
                          Adjust Stock
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setEditingProduct(product);
                          setIsFormOpen(true);
                        }}>
                          <Edit2 className="w-4 h-4 mr-2 text-slate-500" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-rose-600" onClick={() => handleDelete(product.id)}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Product
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Sub Badges Grid */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 py-0.5 border-none">
                    {product.category}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-indigo-100 bg-indigo-50/50 text-indigo-600 py-0.5">
                    {product.brand || 'No Brand'}
                  </Badge>
                  {outOfStock ? (
                    <Badge variant="destructive" className="text-[10px] gap-1 bg-rose-50 text-rose-700 border-rose-100 shadow-none py-0.5">
                      ✕ Out of Stock
                    </Badge>
                  ) : lowStock ? (
                    <Badge variant="outline" className="text-[10px] gap-1 border-amber-200 bg-amber-50 text-amber-700 py-0.5 shadow-none">
                      ⚠️ Low Stock
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 py-0.5 font-bold shadow-none">
                      ✓ Healthy
                    </Badge>
                  )}
                </div>

                {/* Selling Pricing/Costs Details Panel */}
                <div className={cn(
                  "grid gap-2 bg-slate-50 p-2.5 rounded-xl text-center text-xs border border-slate-100 font-medium",
                  isAdmin ? "grid-cols-3" : "grid-cols-2"
                )}>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Selling Price</span>
                    <span className="text-[#1A2B4B] font-bold">{settings.currency}{(product.price ?? 0).toFixed(2)}</span>
                  </div>
                  {isAdmin && (
                    <div className="border-l border-slate-200">
                      <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Unit Cost</span>
                      <span className="text-slate-600">{settings.currency}{(product.cost ?? 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-l border-slate-200">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Available Stock</span>
                    <span className={cn(
                      "font-bold",
                      outOfStock ? "text-rose-600" : lowStock ? "text-amber-600" : "text-[#1A2B4B]"
                    )}>{getDisplayStock(product)}</span>
                  </div>
                </div>

                {/* Location Stocks Details */}
                {(isAdmin || isManager) && (
                  <div className="border-t border-slate-100 pt-3 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center justify-between pb-1">
                      <span>Stock Distribution by Branch</span>
                      <MapPin className="w-3 h-3 text-[#D4AF37]" />
                    </div>
                    {locations.map(loc => {
                      const threshold = product.locationThresholds?.[loc.id] ?? product.lowStockThreshold;
                      const stock = product.stocks?.[loc.id] || 0;
                      const isLow = stock > 0 && stock <= threshold;
                      return (
                        <div key={loc.id} className="flex justify-between items-center text-[11px] py-1 bg-slate-50/40 px-2 rounded-lg border border-slate-100">
                          <span className="text-slate-600 truncate max-w-[150px] font-semibold">{loc.name}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "font-black",
                              stock <= 0 ? "text-rose-500" : isLow ? "text-amber-600" : "text-slate-800"
                            )}>{stock} units</span>
                            <span className="text-[9px] text-slate-400 italic">(limit: {threshold})</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            );
          })}

          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredProducts.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={size => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        </>
        )}
      </div>

      <ProductForm 
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        product={editingProduct}
        products={products}
        categories={categories}
        brands={brands}
        suppliers={suppliers}
      />

      <StockAdjustmentForm
        isOpen={isAdjustmentOpen}
        onClose={() => setIsAdjustmentOpen(false)}
        products={visibleProducts}
        locations={locations}
        initialProductId={adjustingProductId}
      />

      <StockTransferForm
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        products={visibleProducts}
        locations={locations}
      />
    </motion.div>
  );
};

export default Inventory;
