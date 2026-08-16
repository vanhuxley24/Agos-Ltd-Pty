import React, { useEffect, useState, useMemo } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  Package,
  Calendar as CalendarIcon,
  Download,
  Search,
  ChevronDown,
  Filter,
  ArrowUpDown,
  FileText,
  PieChart as PieChartIcon,
  BarChart3,
  ArrowLeftRight,
  TrendingDown
} from 'lucide-react';
import { collection, onSnapshot, query, where, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLocations } from '@/contexts/LocationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Sale, Product, StockAdjustment, PurchaseOrder, ReturnTransaction } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { handleFirestoreError, OperationType } from '@/lib/firestore-utils';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, subMonths, startOfYear, endOfYear, subYears, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { exportToCSV } from '@/lib/export';

type ReportType = 'sales' | 'inventory' | 'profit' | 'stock-adjustments' | 'sales-by-seller' | 'product-movement';

export interface ProductMovementEvent {
  id: string;
  timestamp: Date;
  productId: string;
  productName: string;
  category: string;
  brand: string;
  locationId: string;
  locationName: string;
  type: 'sale' | 'return' | 'adjustment' | 'po_received';
  typeLabel: string;
  quantityChange: number;
  reasonOrNotes: string;
  referenceId: string;
  performedBy: string;
}

export const Reports: React.FC = () => {
  const { profile, isAdmin, isManager } = useAuth();
  const { selectedLocationId, locations } = useLocations();
  const { settings } = useSettings();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [returnTransactions, setReturnTransactions] = useState<ReturnTransaction[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<ReportType>('sales');
  const [movementSubView, setMovementSubView] = useState<'detailed' | 'summary'>('detailed');
  const [dateRange, setDateRange] = useState<string>('month');
  const [customStartDate, setCustomStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');

  // New states for the requested seller, category, brand, and product filters
  const [usersList, setUsersList] = useState<any[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');

  const getPaymentMethodName = (methodId: string) => {
    if (!methodId) return 'N/A';
    if (methodId === 'split') return 'Split Payment';
    if (methodId === 'cash') return 'Cash';
    if (methodId === 'card') return 'Card';
    
    // Look in paymentOptions
    const opt = paymentOptions.find(o => o.id === methodId);
    if (opt) return opt.name;

    // Look in accounts
    const acc = accounts.find(a => a.id === methodId);
    if (acc) return acc.name;

    // Humanize the string if not found
    return methodId.charAt(0).toUpperCase() + methodId.slice(1);
  };

  const { start, end } = useMemo(() => {
    const now = new Date();
    let s = startOfDay(subDays(now, 7));
    let e = endOfDay(now);

    if (dateRange === 'today') {
      s = startOfDay(now);
      e = endOfDay(now);
    } else if (dateRange === '7days') {
      s = startOfDay(subDays(now, 7));
      e = endOfDay(now);
    } else if (dateRange === '30days') {
      s = startOfDay(subDays(now, 30));
      e = endOfDay(now);
    } else if (dateRange === 'month') {
      s = startOfMonth(now);
      e = endOfMonth(now);
    } else if (dateRange === 'lastMonth') {
      s = startOfMonth(subMonths(now, 1));
      e = endOfMonth(subMonths(now, 1));
    } else if (dateRange === 'year') {
      s = startOfYear(now);
      e = endOfYear(now);
    } else if (dateRange === 'lastYear') {
      s = startOfYear(subYears(now, 1));
      e = endOfYear(subYears(now, 1));
    } else if (dateRange === 'custom') {
      s = startOfDay(new Date(customStartDate));
      e = endOfDay(new Date(customEndDate));
    }
    return { start: s, end: e };
  }, [dateRange, customStartDate, customEndDate]);

  // 1. Static reference collection listeners (does not re-subscribe when changing report dates)
  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
      setLoading(false);
    });

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsersList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn("Reports: Error listening to users:", error);
    });

    const unsubscribePayments = onSnapshot(collection(db, 'paymentOptions'), (snapshot) => {
      setPaymentOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn("Reports: Error listening to payment options:", error);
    });

    const unsubscribeAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn("Reports: Error listening to accounts:", error);
    });

    return () => {
      unsubscribeProducts();
      unsubscribeUsers();
      unsubscribePayments();
      unsubscribeAccounts();
    };
  }, []);

  // 2. Date & location range dependent listeners
  useEffect(() => {
    if (!isAdmin) return;

    const q = query(
      collection(db, 'sales'),
      where('timestamp', '>=', Timestamp.fromDate(start)),
      where('timestamp', '<=', Timestamp.fromDate(end)),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeSales = onSnapshot(q, (snapshot) => {
      let salesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      
      // Filter out voided sales
      salesList = salesList.filter(s => s.status !== 'voided');

      // Filter by global location
      if (selectedLocationId !== 'all') {
        salesList = salesList.filter(s => s.locationId === selectedLocationId);
      }
      
      setSales(salesList);
    }, (error) => {
      console.warn("Reports: Error listening to sales:", error);
    });

    const adjQ = query(
      collection(db, 'stockAdjustments'),
      where('timestamp', '>=', Timestamp.fromDate(start)),
      where('timestamp', '<=', Timestamp.fromDate(end)),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeAdjustments = onSnapshot(adjQ, (snapshot) => {
      let adjList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockAdjustment));
      if (selectedLocationId !== 'all') {
        adjList = adjList.filter(a => a.locationId === selectedLocationId);
      }
      setAdjustments(adjList);
    }, (error) => {
      console.warn("Reports: Error listening to adjustments:", error);
    });

    const unsubscribePOs = onSnapshot(collection(db, 'purchaseOrders'), (snapshot) => {
      let poList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder));
      if (selectedLocationId !== 'all') {
        poList = poList.filter(po => po.locationId === selectedLocationId);
      }
      setPurchaseOrders(poList);
    }, (error) => {
      console.warn("Reports: Error listening to purchase orders:", error);
    });

    const unsubscribeReturns = onSnapshot(collection(db, 'returnTransactions'), (snapshot) => {
      let retList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReturnTransaction));
      if (selectedLocationId !== 'all') {
        retList = retList.filter(r => r.locationId === selectedLocationId);
      }
      setReturnTransactions(retList);
    }, (error) => {
      console.warn("Reports: Error listening to return transactions:", error);
    });

    return () => {
      unsubscribeSales();
      unsubscribeAdjustments();
      unsubscribePOs();
      unsubscribeReturns();
    };
  }, [start.getTime(), end.getTime(), selectedLocationId, profile?.id, isAdmin]);

  const handleGeneratePDF = () => {
    window.print();
  };

  const uniqueCategories = useMemo(() => {
    const cats = products.map(p => p.category).filter(Boolean);
    return Array.from(new Set(cats)).sort();
  }, [products]);

  const uniqueBrands = useMemo(() => {
    const list = selectedCategory !== 'all' ? products.filter(p => p.category === selectedCategory) : products;
    const brands = list.map(p => p.brand).filter(Boolean) as string[];
    return Array.from(new Set(brands)).sort();
  }, [products, selectedCategory]);

  const selectableProducts = useMemo(() => {
    return products.filter(p => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (selectedBrand !== 'all' && p.brand !== selectedBrand) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, selectedCategory, selectedBrand]);

  const processedSales = useMemo(() => {
    return sales.map(s => {
      // Filter items based on category, brand, product
      const matchingItems = s.items.filter(item => {
        const product = products.find(p => p.id === item.productId);
        
        if (selectedCategory !== 'all' && (!product || product.category !== selectedCategory)) {
          return false;
        }
        if (selectedBrand !== 'all' && (!product || product.brand !== selectedBrand)) {
          return false;
        }
        if (selectedProduct !== 'all' && item.productId !== selectedProduct) {
          return false;
        }
        return true;
      });

      // Calculate total revenue and profit for matching items in this sale
      const returnedAmount = matchingItems.reduce((sum, item) => sum + ((item.price ?? 0) * (item.returnedQuantity || 0)), 0);
      const originalSubtotal = matchingItems.reduce((sum, item) => sum + (item.subtotal ?? 0), 0);
      const netTotal = Math.max(0, originalSubtotal - returnedAmount);

      const netProfit = matchingItems.reduce((pSum, item) => {
        const product = products.find(p => p.id === item.productId);
        const cost = product?.cost || 0;
        const netQty = Math.max(0, (item.quantity ?? 0) - (item.returnedQuantity || 0));
        const itemSubtotal = item.quantity > 0 ? (item.subtotal / item.quantity) * netQty : 0;
        const itemCost = cost * netQty;
        return pSum + (itemSubtotal - itemCost);
      }, 0);

      return {
        ...s,
        matchingItems,
        netTotal,
        netProfit,
        hasMatchingItems: matchingItems.length > 0
      };
    });
  }, [sales, products, selectedCategory, selectedBrand, selectedProduct]);

  const filteredSales = useMemo(() => {
    return processedSales.filter(s => {
      // Must have matching items if any item filter is applied
      const hasFilterActive = selectedCategory !== 'all' || selectedBrand !== 'all' || selectedProduct !== 'all';
      if (hasFilterActive && !s.hasMatchingItems) return false;

      // Seller filter
      if (selectedSeller !== 'all' && s.staffId !== selectedSeller) return false;

      // Search term
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const sellerName = (usersList.find(u => u.id === s.staffId)?.name || s.staffName || 'Staff').toLowerCase();
        const matchesSearch = s.id.toLowerCase().includes(searchLower) ||
          sellerName.includes(searchLower) ||
          s.matchingItems.some(i => i.name.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [processedSales, selectedSeller, searchTerm, selectedCategory, selectedBrand, selectedProduct, usersList]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (selectedBrand !== 'all' && p.brand !== selectedBrand) return false;
      if (selectedProduct !== 'all' && p.id !== selectedProduct) return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const nameMatch = p.name.toLowerCase().includes(q);
        const skuMatch = p.sku?.toLowerCase().includes(q);
        const catMatch = p.category?.toLowerCase().includes(q);
        const brandMatch = p.brand?.toLowerCase().includes(q);
        if (!nameMatch && !skuMatch && !catMatch && !brandMatch) return false;
      }

      return true;
    });
  }, [products, selectedCategory, selectedBrand, selectedProduct, searchTerm]);

  const profitabilityData = useMemo(() => {
    const items = filteredProducts.map(product => {
      // Calculate sales from filteredSales (which considers date range, location, seller)
      const productSales = filteredSales.reduce((acc, sale) => {
        const item = sale.matchingItems.find(i => i.productId === product.id);
        if (item) {
          const netQty = Math.max(0, item.quantity - (item.returnedQuantity || 0));
          const netSubtotal = item.quantity > 0 ? (item.subtotal / item.quantity) * netQty : 0;
          acc.quantity += netQty;
          acc.revenue += netSubtotal;
        }
        return acc;
      }, { quantity: 0, revenue: 0 });

      const totalCost = productSales.quantity * (product.cost || 0);
      const profit = productSales.revenue - totalCost;

      return {
        product,
        unitsSold: productSales.quantity,
        revenue: productSales.revenue,
        cost: totalCost,
        profit
      };
    });

    if (selectedSeller !== 'all') {
      return items.filter(item => item.unitsSold > 0 || (selectedProduct !== 'all' && item.product.id === selectedProduct));
    }

    return items;
  }, [filteredProducts, filteredSales, selectedSeller, selectedProduct]);

  const salesBySellerData = useMemo(() => {
    const groups: { [staffId: string]: {
      sellerId: string;
      sellerName: string;
      sellerRole: string;
      ordersCount: number;
      itemsCount: number;
      revenue: number;
      profit: number;
    }} = {};

    filteredSales.forEach(s => {
      const staffId = s.staffId || 'anonymous';
      const staffName = s.staffName || 'Staff';
      if (!groups[staffId]) {
        const matchedUser = usersList.find(u => u.id === staffId);
        groups[staffId] = {
          sellerId: staffId,
          sellerName: matchedUser?.name || staffName,
          sellerRole: matchedUser?.role || 'Staff',
          ordersCount: 0,
          itemsCount: 0,
          revenue: 0,
          profit: 0
        };
      }

      const group = groups[staffId];
      group.ordersCount += 1;
      const netItemsQty = s.matchingItems.reduce((sum, item) => sum + Math.max(0, item.quantity - (item.returnedQuantity || 0)), 0);
      group.itemsCount += netItemsQty;
      group.revenue += s.netTotal;
      group.profit += s.netProfit;
    });

    let result = Object.values(groups).filter(g => g.ordersCount > 0);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(g => g.sellerName.toLowerCase().includes(q) || g.sellerRole.toLowerCase().includes(q));
    }

    return result.sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, usersList, searchTerm]);

  const filteredAdjustments = useMemo(() => {
    return adjustments.filter(adj => {
      if (selectedProduct !== 'all' && adj.productId !== selectedProduct) return false;

      if (selectedCategory !== 'all' || selectedBrand !== 'all') {
        const prod = products.find(p => p.id === adj.productId);
        if (selectedCategory !== 'all' && (!prod || prod.category !== selectedCategory)) return false;
        if (selectedBrand !== 'all' && (!prod || prod.brand !== selectedBrand)) return false;
      }

      if (selectedSeller !== 'all' && adj.adjustedBy !== selectedSeller) return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const prodNameMatch = adj.productName?.toLowerCase().includes(q);
        const reasonMatch = adj.reason?.toLowerCase().includes(q);
        const byMatch = adj.adjustedByName?.toLowerCase().includes(q);
        const locMatch = adj.locationName?.toLowerCase().includes(q);
        if (!prodNameMatch && !reasonMatch && !byMatch && !locMatch) return false;
      }

      return true;
    });
  }, [adjustments, products, selectedProduct, selectedCategory, selectedBrand, selectedSeller, searchTerm]);

  const productMovementEvents = useMemo(() => {
    const events: ProductMovementEvent[] = [];

    // Helper map for quick product lookup
    const prodMap = new Map<string, Product>();
    products.forEach(p => prodMap.set(p.id, p));

    // 1. Sales
    sales.forEach(s => {
      if (s.status === 'voided') return;
      const saleDate = s.timestamp?.toDate ? s.timestamp.toDate() : new Date();
      if (saleDate < start || saleDate > end) return;
      if (selectedLocationId !== 'all' && s.locationId !== selectedLocationId) return;

      const locName = locations.find(l => l.id === s.locationId)?.name || 'Unknown';
      const staffName = usersList.find(u => u.id === s.staffId)?.name || s.staffName || 'Staff';

      s.items.forEach((item, idx) => {
        const prod = prodMap.get(item.productId);
        const netQty = Math.max(0, item.quantity - (item.returnedQuantity || 0));
        if (netQty <= 0) return;

        events.push({
          id: `sale-${s.id}-${idx}`,
          timestamp: saleDate,
          productId: item.productId,
          productName: item.name,
          category: prod?.category || 'Uncategorized',
          brand: prod?.brand || 'N/A',
          locationId: s.locationId,
          locationName: locName,
          type: 'sale',
          typeLabel: 'POS Sale (Outflow)',
          quantityChange: -netQty,
          reasonOrNotes: `Sale #${s.id.slice(0, 8)} (${getPaymentMethodName(s.paymentMethod)})`,
          referenceId: s.id,
          performedBy: staffName
        });
      });
    });

    // 2. Customer Returns (Restocked)
    returnTransactions.forEach(r => {
      const retDate = r.timestamp?.toDate ? r.timestamp.toDate() : new Date();
      if (retDate < start || retDate > end) return;
      if (selectedLocationId !== 'all' && r.locationId !== selectedLocationId) return;

      const locName = locations.find(l => l.id === r.locationId)?.name || 'Unknown';
      const staffName = r.staffName || 'Staff';

      r.items.forEach((item, idx) => {
        if (!item.restock) return;
        const prod = prodMap.get(item.productId);

        events.push({
          id: `return-${r.id}-${idx}`,
          timestamp: retDate,
          productId: item.productId,
          productName: item.name,
          category: prod?.category || 'Uncategorized',
          brand: prod?.brand || 'N/A',
          locationId: r.locationId,
          locationName: locName,
          type: 'return',
          typeLabel: 'Customer Return (Restocked)',
          quantityChange: +item.quantity,
          reasonOrNotes: `Return from Sale #${r.originalSaleId.slice(0, 8)}${item.reason ? ` (${item.reason})` : ''}`,
          referenceId: r.id,
          performedBy: staffName
        });
      });
    });

    // 3. Stock Adjustments
    adjustments.forEach(a => {
      const adjDate = a.timestamp?.toDate ? a.timestamp.toDate() : new Date();
      if (adjDate < start || adjDate > end) return;
      if (selectedLocationId !== 'all' && a.locationId !== selectedLocationId) return;

      const prod = prodMap.get(a.productId);
      const locName = locations.find(l => l.id === a.locationId)?.name || a.locationName || 'Unknown';

      let qtyChange = a.adjustmentQuantity;
      if (a.type === 'subtract') {
        qtyChange = -Math.abs(a.adjustmentQuantity);
      } else if (a.type === 'add') {
        qtyChange = Math.abs(a.adjustmentQuantity);
      }

      events.push({
        id: `adj-${a.id}`,
        timestamp: adjDate,
        productId: a.productId,
        productName: a.productName,
        category: prod?.category || 'Uncategorized',
        brand: prod?.brand || 'N/A',
        locationId: a.locationId,
        locationName: locName,
        type: 'adjustment',
        typeLabel: a.type === 'add' ? 'Stock Addition' : a.type === 'subtract' ? 'Stock Deduction / Loss' : 'Stock Set Count',
        quantityChange: qtyChange,
        reasonOrNotes: a.reason || 'Manual Adjustment',
        referenceId: a.id,
        performedBy: a.adjustedByName || 'Staff'
      });
    });

    // 4. Purchase Orders Received
    purchaseOrders.forEach(po => {
      if (po.status !== 'received' && po.status !== 'partially_received') return;
      const poDate = po.receivedAt?.toDate ? po.receivedAt.toDate() : (po.updatedAt?.toDate ? po.updatedAt.toDate() : (po.createdAt?.toDate ? po.createdAt.toDate() : new Date()));
      if (poDate < start || poDate > end) return;
      if (selectedLocationId !== 'all' && po.locationId !== selectedLocationId) return;

      const locName = locations.find(l => l.id === po.locationId)?.name || 'Unknown';

      po.items.forEach((item, idx) => {
        const recvQty = item.receivedQuantity ?? item.quantity;
        if (recvQty <= 0) return;
        const prod = prodMap.get(item.productId);

        events.push({
          id: `po-${po.id}-${idx}`,
          timestamp: poDate,
          productId: item.productId,
          productName: item.name,
          category: prod?.category || 'Uncategorized',
          brand: prod?.brand || 'N/A',
          locationId: po.locationId,
          locationName: locName,
          type: 'po_received',
          typeLabel: 'Purchase Order Received',
          quantityChange: +recvQty,
          reasonOrNotes: `Received PO #${po.poNumber} from ${po.supplierName || 'Supplier'}`,
          referenceId: po.poNumber || po.id,
          performedBy: po.createdBy || 'Purchasing'
        });
      });
    });

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return events;
  }, [sales, returnTransactions, adjustments, purchaseOrders, products, locations, usersList, selectedLocationId, start, end]);

  const filteredMovementEvents = useMemo(() => {
    return productMovementEvents.filter(ev => {
      if (selectedCategory !== 'all' && ev.category !== selectedCategory) return false;
      if (selectedBrand !== 'all' && ev.brand !== selectedBrand) return false;
      if (selectedProduct !== 'all' && ev.productId !== selectedProduct) return false;
      if (selectedSeller !== 'all' && ev.performedBy !== selectedSeller) return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const pMatch = ev.productName.toLowerCase().includes(q);
        const refMatch = ev.referenceId.toLowerCase().includes(q);
        const notesMatch = ev.reasonOrNotes.toLowerCase().includes(q);
        const typeMatch = ev.typeLabel.toLowerCase().includes(q);
        const actorMatch = ev.performedBy.toLowerCase().includes(q);
        if (!pMatch && !refMatch && !notesMatch && !typeMatch && !actorMatch) return false;
      }

      return true;
    });
  }, [productMovementEvents, selectedCategory, selectedBrand, selectedProduct, selectedSeller, searchTerm]);

  const productMovementSummary = useMemo(() => {
    const summaryMap: { [productId: string]: {
      productId: string;
      productName: string;
      category: string;
      brand: string;
      inflow: number;
      outflow: number;
      netChange: number;
      currentStock: number;
      eventsCount: number;
    }} = {};

    filteredMovementEvents.forEach(ev => {
      if (!summaryMap[ev.productId]) {
        const prod = products.find(p => p.id === ev.productId);
        const currStock = selectedLocationId === 'all' 
          ? (prod?.stock ?? 0) 
          : (prod?.stocks?.[selectedLocationId] ?? 0);

        summaryMap[ev.productId] = {
          productId: ev.productId,
          productName: ev.productName,
          category: ev.category,
          brand: ev.brand,
          inflow: 0,
          outflow: 0,
          netChange: 0,
          currentStock: currStock,
          eventsCount: 0
        };
      }

      const item = summaryMap[ev.productId];
      item.eventsCount += 1;
      if (ev.quantityChange > 0) {
        item.inflow += ev.quantityChange;
      } else {
        item.outflow += Math.abs(ev.quantityChange);
      }
      item.netChange += ev.quantityChange;
    });

    return Object.values(summaryMap).sort((a, b) => b.eventsCount - a.eventsCount);
  }, [filteredMovementEvents, products, selectedLocationId]);

  const totalRevenue = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + s.netTotal, 0);
  }, [filteredSales]);

  const totalProfit = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + s.netProfit, 0);
  }, [filteredSales]);

  const inventoryValue = useMemo(() => {
    return filteredProducts.reduce((sum, p) => {
      const stock = selectedLocationId === 'all' ? p.stock : (p.stocks?.[selectedLocationId] || 0);
      return sum + (p.cost * stock);
    }, 0);
  }, [filteredProducts, selectedLocationId]);

  const handleExportCSV = () => {
    let data: any[] = [];
    let name = 'Report';
    const hasItemFilter = selectedCategory !== 'all' || selectedBrand !== 'all' || selectedProduct !== 'all';

    if (reportType === 'sales') {
      name = 'Sales_Report';
      data = filteredSales.map(s => {
        const itemsToExport = hasItemFilter ? s.matchingItems : s.items;
        return {
          ID: s.id,
          Date: format(s.timestamp.toDate(), 'yyyy-MM-dd HH:mm'),
          Location: locations.find(l => l.id === s.locationId)?.name || 'Unknown',
          Items: itemsToExport.map(i => {
            const netQty = i.quantity - (i.returnedQuantity || 0);
            return `${i.name} x${netQty}${i.returnedQuantity ? ` (${i.returnedQuantity} returned)` : ''}`;
          }).join('; '),
          Total: s.netTotal.toFixed(2),
          Payment: getPaymentMethodName(s.paymentMethod)
        };
      });
    } else if (reportType === 'inventory') {
      name = 'Inventory_Report';
      data = filteredProducts.map(p => ({
        Name: p.name,
        Category: p.category,
        Brand: p.brand || 'N/A',
        Stock: selectedLocationId === 'all' ? p.stock : (p.stocks?.[selectedLocationId] || 0),
        Cost: (p.cost ?? 0).toFixed(2),
        Value: ((p.cost ?? 0) * (selectedLocationId === 'all' ? p.stock : (p.stocks?.[selectedLocationId] || 0))).toFixed(2)
      }));
    } else if (reportType === 'profit') {
      name = 'Profitability_Report';
      data = profitabilityData.map(item => ({
        Name: item.product.name,
        UnitsSold: item.unitsSold,
        Revenue: item.revenue.toFixed(2),
        Cost: item.cost.toFixed(2),
        Profit: item.profit.toFixed(2)
      }));
    } else if (reportType === 'stock-adjustments') {
      name = 'Adjustments_Report';
      data = filteredAdjustments.map(a => ({
        Date: format(a.timestamp.toDate(), 'yyyy-MM-dd HH:mm'),
        Product: a.productName,
        Location: a.locationName,
        Type: a.type,
        Quantity: a.adjustmentQuantity,
        Reason: a.reason,
        By: a.adjustedByName
      }));
    } else if (reportType === 'sales-by-seller') {
      name = 'Sales_by_Seller_Report';
      data = salesBySellerData.map(d => ({
        'Seller Name': d.sellerName,
        Role: d.sellerRole,
        'Orders Count': d.ordersCount,
        'Items Sold': d.itemsCount,
        Revenue: d.revenue.toFixed(2),
        'Gross Profit': d.profit.toFixed(2),
        'Avg Order Value': (d.revenue / (d.ordersCount || 1)).toFixed(2)
      }));
    } else if (reportType === 'product-movement') {
      name = 'Product_Movement_Report';
      data = filteredMovementEvents.map(e => ({
        Date: format(e.timestamp, 'yyyy-MM-dd HH:mm'),
        Product: e.productName,
        Category: e.category,
        Brand: e.brand,
        Location: e.locationName,
        Type: e.typeLabel,
        'Qty Change': e.quantityChange > 0 ? `+${e.quantityChange}` : `${e.quantityChange}`,
        'Reference / Notes': e.reasonOrNotes,
        'Performed By': e.performedBy
      }));
    }

    if (data.length === 0) {
      toast.error('No data available to export for the selected filters.');
      return;
    }

    exportToCSV(data, name);
    toast.success(`${name.replace('_', ' ')} exported`);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight font-heading">Reports & Insights</h1>
          <p className="text-slate-500 mt-1">Detailed breakdown of your business performance and inventory.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2 border-slate-200 bg-white shadow-sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button 
            className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 gap-2"
            onClick={handleGeneratePDF}
          >
            <FileText className="w-4 h-4" />
            Generate PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border-slate-200/60 overflow-hidden">
          <div className="h-1 bg-indigo-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Period Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{settings.currency}{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-[10px] text-slate-400 mt-1">Total sales in selected range</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200/60 overflow-hidden">
          <div className="h-1 bg-emerald-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Gross Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{settings.currency}{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-[10px] text-slate-400 mt-1">Margin: {((totalProfit / (totalRevenue || 1)) * 100).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200/60 overflow-hidden">
          <div className="h-1 bg-amber-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Orders Count</CardTitle>
            <ShoppingBag className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{filteredSales.length}</div>
            <p className="text-[10px] text-slate-400 mt-1">Avg: {settings.currency}{(totalRevenue / (filteredSales.length || 1)).toFixed(2)} / order</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200/60 overflow-hidden">
          <div className="h-1 bg-slate-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Inventory Value</CardTitle>
            <Package className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{settings.currency}{inventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-[10px] text-slate-400 mt-1">{filteredProducts.length} products matching filter</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-slate-200/60">
        <CardHeader className="border-b border-slate-100 bg-slate-50/30">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-1">
                <Button 
                  variant={reportType === 'sales' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  className="text-xs h-8"
                  onClick={() => setReportType('sales')}
                >
                  Sales
                </Button>
                <Button 
                  variant={reportType === 'sales-by-seller' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  className="text-xs h-8"
                  onClick={() => setReportType('sales-by-seller')}
                >
                  Sales by Seller
                </Button>
                <Button 
                  variant={reportType === 'inventory' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  className="text-xs h-8"
                  onClick={() => setReportType('inventory')}
                >
                  Inventory
                </Button>
                <Button 
                  variant={reportType === 'profit' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  className="text-xs h-8"
                  onClick={() => setReportType('profit')}
                >
                  Profitability
                </Button>
                <Button 
                  variant={reportType === 'stock-adjustments' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  className="text-xs h-8"
                  onClick={() => setReportType('stock-adjustments')}
                >
                  Adjustments
                </Button>
                <Button 
                  variant={reportType === 'product-movement' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  className="text-xs h-8 flex items-center gap-1.5"
                  onClick={() => setReportType('product-movement')}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-500" />
                  Product Movement
                </Button>
              </div>
              <div className="h-6 w-px bg-slate-200 hidden md:block" />
              <div className="flex items-center gap-2">
                <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
                  <SelectTrigger className="w-[140px] h-9 text-xs bg-white">
                    <SelectValue placeholder="Date Range">
                      {dateRange === 'today' ? 'Today' : 
                       dateRange === '7days' ? 'Last 7 Days' : 
                       dateRange === '30days' ? 'Last 30 Days' : 
                       dateRange === 'month' ? 'This Month' : 
                       dateRange === 'lastMonth' ? 'Last Month' :
                       dateRange === 'year' ? 'This Year' :
                       dateRange === 'lastYear' ? 'Last Year' :
                       dateRange === 'custom' ? 'Custom Range' : dateRange}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                    <SelectItem value="30days">Last 30 Days</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="lastMonth">Last Month</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                    <SelectItem value="lastYear">Last Year</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>

                {dateRange === 'custom' && (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                    <Input 
                      type="date" 
                      value={customStartDate} 
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="h-9 text-xs w-[130px] bg-white border-slate-200"
                    />
                    <span className="text-slate-400">to</span>
                    <Input 
                      type="date" 
                      value={customEndDate} 
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="h-9 text-xs w-[130px] bg-white border-slate-200"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                className="pl-9 h-9 text-xs bg-white" 
                placeholder="Search report data..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="h-px bg-slate-100 my-4" />
          
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-indigo-500" />
                Filter Report Data
              </span>
              {(selectedSeller !== 'all' || selectedCategory !== 'all' || selectedBrand !== 'all' || selectedProduct !== 'all' || searchTerm !== '') && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSelectedSeller('all');
                    setSelectedCategory('all');
                    setSelectedBrand('all');
                    setSelectedProduct('all');
                    setSearchTerm('');
                  }}
                  className="text-xs h-7 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                >
                  Clear Filters
                </Button>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Category Filter */}
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full h-9 text-xs bg-white border-slate-200">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {uniqueCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Brand Filter */}
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Brand</Label>
                <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                  <SelectTrigger className="w-full h-9 text-xs bg-white border-slate-200">
                    <SelectValue placeholder="All Brands" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {uniqueBrands.map(brand => (
                      <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product Filter */}
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger className="w-full h-9 text-xs bg-white border-slate-200">
                    <SelectValue placeholder="All Products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {selectableProducts.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Seller Filter */}
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Seller Name</Label>
                <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                  <SelectTrigger className="w-full h-9 text-xs bg-white border-slate-200">
                    <SelectValue placeholder="All Sellers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sellers</SelectItem>
                    {usersList.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email || 'Unknown'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {reportType === 'sales' && (
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="w-[100px]">Order ID</TableHead>
                  <TableHead>Date & Time</TableHead>
                  {selectedLocationId === 'all' && <TableHead>Location</TableHead>}
                  <TableHead>Items</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">
                      No sales records found for this period
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSales.map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-mono text-[10px] text-slate-500">#{sale.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs font-medium">
                        {format(sale.timestamp.toDate(), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      {selectedLocationId === 'all' && (
                        <TableCell className="text-xs">
                          {locations.find(l => l.id === sale.locationId)?.name || 'Unknown'}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(selectedCategory !== 'all' || selectedBrand !== 'all' || selectedProduct !== 'all' ? sale.matchingItems : sale.items).map((item, idx) => {
                            const netQty = item.quantity - (item.returnedQuantity || 0);
                            return (
                              <Badge key={idx} variant="outline" className="text-[10px] font-normal bg-white">
                                {item.name} x{netQty}
                                {item.returnedQuantity && item.returnedQuantity > 0 ? (
                                  <span className="text-rose-500 font-bold ml-1">({item.returnedQuantity} ret)</span>
                                ) : null}
                              </Badge>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-medium">
                          {getPaymentMethodName(sale.paymentMethod)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        {settings.currency}{sale.netTotal.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}

          {reportType === 'sales-by-seller' && (
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead>Seller Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Orders Count</TableHead>
                  <TableHead className="text-center">Items Sold</TableHead>
                  <TableHead className="text-right">Total Revenue</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">Avg Order Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesBySellerData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-400 italic">
                      No sales records found for this period
                    </TableCell>
                  </TableRow>
                ) : (
                  salesBySellerData.map((data) => (
                    <TableRow key={data.sellerId} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-semibold text-slate-900">{data.sellerName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-slate-50 text-slate-600 border-slate-200">
                          {data.sellerRole}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs font-medium text-slate-700">{data.ordersCount}</TableCell>
                      <TableCell className="text-center text-xs font-medium text-slate-700">{data.itemsCount}</TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        {settings.currency}{data.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">
                        {settings.currency}{data.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-medium text-indigo-600 text-xs">
                        {settings.currency}{(data.revenue / (data.ordersCount || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {salesBySellerData.length > 0 && (
                <tfoot className="bg-slate-50 font-bold">
                  <TableRow>
                    <TableCell colSpan={2}>TOTAL</TableCell>
                    <TableCell className="text-center text-xs">
                      {salesBySellerData.reduce((sum, d) => sum + d.ordersCount, 0)}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {salesBySellerData.reduce((sum, d) => sum + d.itemsCount, 0)}
                    </TableCell>
                    <TableCell className="text-right text-slate-900">
                      {settings.currency}{salesBySellerData.reduce((sum, d) => sum + d.revenue, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600">
                      {settings.currency}{salesBySellerData.reduce((sum, d) => sum + d.profit, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-indigo-600">
                      {settings.currency}{(salesBySellerData.reduce((sum, d) => sum + d.revenue, 0) / (salesBySellerData.reduce((sum, d) => sum + d.ordersCount, 0) || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>
          )}

          {reportType === 'inventory' && (
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stock Level</TableHead>
                  <TableHead>Unit Cost</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">
                      No inventory records match the selected filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => {
                    const currentStock = selectedLocationId === 'all' 
                      ? Object.values(product.stocks || {}).reduce((sum, val) => (sum as number) + Number(val), 0) as number
                      : Number(product.stocks?.[selectedLocationId] || 0);

                    return (
                      <TableRow key={product.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${currentStock <= product.lowStockThreshold ? 'text-rose-600' : 'text-slate-700'}`}>
                              {currentStock}
                            </span>
                            {currentStock <= product.lowStockThreshold && (
                              <Badge variant="destructive" className="h-4 px-1 text-[8px]">LOW</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{settings.currency}{(product.cost ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-bold text-slate-900">
                          {settings.currency}{((product.cost ?? 0) * currentStock).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {filteredProducts.length > 0 && (
                <tfoot className="bg-slate-50 font-bold">
                  <TableRow>
                    <TableCell colSpan={2}>TOTAL ({filteredProducts.length} items)</TableCell>
                    <TableCell className="text-xs">
                      {filteredProducts.reduce((sum, p) => {
                        const stock = selectedLocationId === 'all' 
                          ? Object.values(p.stocks || {}).reduce((s, val) => (s as number) + Number(val), 0) as number
                          : Number(p.stocks?.[selectedLocationId] || 0);
                        return sum + stock;
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">-</TableCell>
                    <TableCell className="text-right text-slate-900">
                      {settings.currency}{filteredProducts.reduce((sum, p) => {
                        const stock = selectedLocationId === 'all' 
                          ? Object.values(p.stocks || {}).reduce((s, val) => (s as number) + Number(val), 0) as number
                          : Number(p.stocks?.[selectedLocationId] || 0);
                        return sum + ((p.cost ?? 0) * stock);
                      }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>
          )}

          {reportType === 'profit' && (
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Units Sold</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Cost of Goods</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitabilityData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">
                      No sales records match the selected filters
                    </TableCell>
                  </TableRow>
                ) : (
                  profitabilityData.map(({ product, unitsSold, revenue, cost, profit }) => (
                    <TableRow key={product.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-xs">{unitsSold}</TableCell>
                      <TableCell className="text-xs text-slate-600">{settings.currency}{revenue.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-slate-400">{settings.currency}{cost.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {settings.currency}{profit.toFixed(2)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {profitabilityData.length > 0 && (
                <tfoot className="bg-slate-50 font-bold">
                  <TableRow>
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-xs">
                      {profitabilityData.reduce((sum, item) => sum + item.unitsSold, 0)}
                    </TableCell>
                    <TableCell className="text-xs text-indigo-600">
                      {settings.currency}{profitabilityData.reduce((sum, item) => sum + item.revenue, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {settings.currency}{profitabilityData.reduce((sum, item) => sum + item.cost, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600">
                      {settings.currency}{profitabilityData.reduce((sum, item) => sum + item.profit, 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>
          )}

          {reportType === 'stock-adjustments' && (
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Product</TableHead>
                  {selectedLocationId === 'all' && <TableHead>Location</TableHead>}
                  <TableHead>Type</TableHead>
                  <TableHead>Adjustment</TableHead>
                  <TableHead>New Stock</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Adjusted By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAdjustments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={selectedLocationId === 'all' ? 8 : 7} className="text-center py-12 text-slate-400 italic">
                      No stock adjustments match the selected filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAdjustments.map((adj) => (
                    <TableRow key={adj.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="text-xs">
                        {format(adj.timestamp.toDate(), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="font-medium text-xs">{adj.productName}</TableCell>
                      {selectedLocationId === 'all' && (
                        <TableCell className="text-xs">{adj.locationName}</TableCell>
                      )}
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "capitalize text-[10px]",
                          adj.type === 'add' ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                          adj.type === 'subtract' ? "border-rose-200 bg-rose-50 text-rose-700" :
                          "border-indigo-200 bg-indigo-50 text-indigo-700"
                        )}>
                          {adj.type}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn(
                        "text-xs font-bold",
                        adj.adjustmentQuantity > 0 ? "text-emerald-600" : 
                        adj.adjustmentQuantity < 0 ? "text-rose-600" : "text-slate-600"
                      )}>
                        {adj.adjustmentQuantity > 0 ? '+' : ''}{adj.adjustmentQuantity}
                      </TableCell>
                      <TableCell className="text-xs font-bold">{adj.newStock}</TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-[200px] truncate" title={adj.reason}>
                        {adj.reason}
                      </TableCell>
                      <TableCell className="text-xs">{adj.adjustedByName}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}

          {reportType === 'product-movement' && (
            <div className="space-y-4">
              {/* Summary Header Cards for Movement */}
              <div className="p-4 bg-slate-50/70 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    Total Inflow (+)
                  </span>
                  <span className="text-xl font-bold text-emerald-600 mt-1">
                    +{filteredMovementEvents.filter(e => e.quantityChange > 0).reduce((sum, e) => sum + e.quantityChange, 0)} units
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">POs, Restocks & Additions</span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                    Total Outflow (-)
                  </span>
                  <span className="text-xl font-bold text-rose-600 mt-1">
                    -{filteredMovementEvents.filter(e => e.quantityChange < 0).reduce((sum, e) => sum + Math.abs(e.quantityChange), 0)} units
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Sales & Deductions</span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-500" />
                    Net Movement
                  </span>
                  {(() => {
                    const net = filteredMovementEvents.reduce((sum, e) => sum + e.quantityChange, 0);
                    return (
                      <span className={cn("text-xl font-bold mt-1", net >= 0 ? "text-indigo-600" : "text-amber-600")}>
                        {net > 0 ? `+${net}` : net} units
                      </span>
                    );
                  })()}
                  <span className="text-[10px] text-slate-400 mt-0.5">Inflow minus Outflow</span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
                    Movement Records
                  </span>
                  <span className="text-xl font-bold text-slate-800 mt-1">
                    {filteredMovementEvents.length} events
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">In selected period</span>
                </div>
              </div>

              {/* View Selector Sub-Toggle */}
              <div className="px-4 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  {movementSubView === 'detailed' ? 'Individual Movement History Log' : 'Product-Level Aggregated Movements'}
                </span>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <Button
                    variant={movementSubView === 'detailed' ? 'outline' : 'ghost'}
                    size="sm"
                    className={cn("h-7 text-xs px-2.5", movementSubView === 'detailed' && "bg-white shadow-xs font-semibold text-slate-900 border-slate-200")}
                    onClick={() => setMovementSubView('detailed')}
                  >
                    Detailed History Log
                  </Button>
                  <Button
                    variant={movementSubView === 'summary' ? 'outline' : 'ghost'}
                    size="sm"
                    className={cn("h-7 text-xs px-2.5", movementSubView === 'summary' && "bg-white shadow-xs font-semibold text-slate-900 border-slate-200")}
                    onClick={() => setMovementSubView('summary')}
                  >
                    Per-Product Summary
                  </Button>
                </div>
              </div>

              {movementSubView === 'detailed' ? (
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Product Name</TableHead>
                      {selectedLocationId === 'all' && <TableHead>Location</TableHead>}
                      <TableHead>Movement Type</TableHead>
                      <TableHead className="text-center">Qty Change</TableHead>
                      <TableHead>Reference / Reason</TableHead>
                      <TableHead>Performed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovementEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={selectedLocationId === 'all' ? 7 : 6} className="text-center py-12 text-slate-400 italic">
                          No product movement records found for this period
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMovementEvents.map((ev) => (
                        <TableRow key={ev.id} className="hover:bg-slate-50/50 transition-colors">
                          <TableCell className="text-xs font-medium text-slate-600">
                            {format(ev.timestamp, 'MMM dd, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-semibold text-xs text-slate-900">{ev.productName}</span>
                              <span className="text-[10px] text-slate-400">{ev.category} • {ev.brand}</span>
                            </div>
                          </TableCell>
                          {selectedLocationId === 'all' && (
                            <TableCell className="text-xs text-slate-600">{ev.locationName}</TableCell>
                          )}
                          <TableCell>
                            <Badge variant="outline" className={cn(
                              "text-[10px] font-medium border-slate-200",
                              ev.type === 'sale' && "bg-rose-50 text-rose-700 border-rose-200",
                              ev.type === 'po_received' && "bg-emerald-50 text-emerald-700 border-emerald-200",
                              ev.type === 'return' && "bg-indigo-50 text-indigo-700 border-indigo-200",
                              ev.type === 'adjustment' && (ev.quantityChange >= 0 ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-amber-50 text-amber-700 border-amber-200")
                            )}>
                              {ev.typeLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn(
                              "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold font-mono",
                              ev.quantityChange > 0 ? "bg-emerald-100 text-emerald-800" :
                              ev.quantityChange < 0 ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"
                            )}>
                              {ev.quantityChange > 0 ? `+${ev.quantityChange}` : ev.quantityChange}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 max-w-[220px] truncate" title={ev.reasonOrNotes}>
                            {ev.reasonOrNotes}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">{ev.performedBy}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-center text-emerald-700">Inflow (+)</TableHead>
                      <TableHead className="text-center text-rose-700">Outflow (-)</TableHead>
                      <TableHead className="text-center">Net Shift</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productMovementSummary.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-slate-400 italic">
                          No product movement summary records match the selected filters
                        </TableCell>
                      </TableRow>
                    ) : (
                      productMovementSummary.map((item) => (
                        <TableRow key={item.productId} className="hover:bg-slate-50/50 transition-colors">
                          <TableCell className="font-semibold text-xs text-slate-900">{item.productName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">{item.brand}</TableCell>
                          <TableCell className="text-center font-mono text-xs font-bold text-emerald-600">
                            +{item.inflow}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs font-bold text-rose-600">
                            -{item.outflow}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn(
                              "font-mono text-xs font-bold px-2 py-0.5 rounded-full",
                              item.netChange > 0 ? "bg-emerald-50 text-emerald-700" :
                              item.netChange < 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"
                            )}>
                              {item.netChange > 0 ? `+${item.netChange}` : item.netChange}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs text-slate-900">
                            {item.currentStock} units
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {productMovementSummary.length > 0 && (
                    <tfoot className="bg-slate-50 font-bold">
                      <TableRow>
                        <TableCell colSpan={3}>TOTAL ({productMovementSummary.length} products moved)</TableCell>
                        <TableCell className="text-center font-mono text-xs text-emerald-600">
                          +{productMovementSummary.reduce((sum, i) => sum + i.inflow, 0)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-rose-600">
                          -{productMovementSummary.reduce((sum, i) => sum + i.outflow, 0)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-indigo-600">
                          {(() => {
                            const totalNet = productMovementSummary.reduce((sum, i) => sum + i.netChange, 0);
                            return totalNet > 0 ? `+${totalNet}` : totalNet;
                          })()}
                        </TableCell>
                        <TableCell className="text-right text-xs text-slate-900">
                          {productMovementSummary.reduce((sum, i) => sum + i.currentStock, 0)} total units
                        </TableCell>
                      </TableRow>
                    </tfoot>
                  )}
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
