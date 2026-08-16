import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Banknote, 
  Wallet,
  CheckCircle2,
  Printer,
  X,
  Package,
  Ticket,
  Percent,
  Building,
  Scan,
  Lock,
  ShieldAlert,
  KeyRound,
  Gift,
  AlertTriangle,
  Sparkles,
  QrCode,
  ChevronDown,
  Check,
  User
} from 'lucide-react';
import { calculateLoyaltyDiscount, processCustomerLoyaltyCheckout } from '@/lib/loyalty';
import { supabaseService } from '@/lib/supabase-service';

import { collection, onSnapshot, query, orderBy, addDoc, Timestamp, doc, updateDoc, increment, setDoc, writeBatch, limit, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Product, Sale, SaleItem, Location, Customer, PromoCode, PaymentOption, PaymentSplit, LoyaltyCard } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useLocations } from '@/contexts/LocationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { toast } from 'sonner';
import { BarcodeScanner } from '@/components/BarcodeScanner';

import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { logAction } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { MapPin, LayoutGrid, LayoutList } from 'lucide-react';
import { motion } from 'motion/react';

export const POS: React.FC = () => {
  const { user, profile, isAdmin, isManager } = useAuth();
  const { locations, selectedLocationId } = useLocations();
  const { settings } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [editedTotal, setEditedTotal] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [lastSaleId, setLastSaleId] = useState('');
  const [processing, setProcessing] = useState(false);
  const [isPendingCheckout, setIsPendingCheckout] = useState(false);
  const [checkoutLocationId, setCheckoutLocationId] = useState<string>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loyaltyCards, setLoyaltyCards] = useState<LoyaltyCard[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walk-in');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [isPromoApprovalOpen, setIsPromoApprovalOpen] = useState(false);
  const [selectedApproverId, setSelectedApproverId] = useState<string>('');
  const [approverPasscode, setApproverPasscode] = useState<string>('');
  const [approvedByInfo, setApprovedByInfo] = useState<{ name: string; id: string } | null>(null);
  const [pendingCheckoutType, setPendingCheckoutType] = useState<boolean | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'cash' | 'ewallet' | 'bank'>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [addQtyMulti, setAddQtyMulti] = useState<number>(1);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [saleType, setSaleType] = useState<'in-store' | 'online'>('in-store');
  const [deliveryFee, setDeliveryFee] = useState<string>('0');
  const [applyLoyaltyDiscount, setApplyLoyaltyDiscount] = useState<boolean>(false);
  const [assignCardCustomer, setAssignCardCustomer] = useState<Customer | null>(null);
  const [quickCardNumber, setQuickCardNumber] = useState<string>('');
  const [quickCardQr, setQuickCardQr] = useState<string>('');
  const [expiredCardNotice, setExpiredCardNotice] = useState<{ customerId: string; customerName: string; cardNumber: string } | null>(null);
  const [customerDetails, setCustomerDetails] = useState({
    name: '',
    billingAddress: '',
    shippingAddress: '',
    municipality: '',
    city: '',
    country: 'Philippines',
    zip: ''
  });

  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(event.target as Node)) {
        setIsCustomerSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (selectedCustomerId === 'walk-in') {
      setCustomerSearchQuery('Walk-In Customer');
    } else if (selectedCustomerId === 'new') {
      setCustomerSearchQuery(customerDetails.name || '');
    } else {
      const cust = customers.find(c => c.id === selectedCustomerId);
      if (cust) {
        setCustomerSearchQuery(cust.name);
      }
    }
  }, [selectedCustomerId, customers]);

  const [activeTab, setActiveTab] = useState<'products' | 'cart'>('products');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const visibleProducts = products.filter(p => {
    if (isAdmin || isManager) return true;
    const userLocId = profile?.locationId;
    if (!userLocId) return false;
    return (p.locationIds && p.locationIds.includes(userLocId)) || 
           (p.stocks && p.stocks[userLocId] !== undefined && Number(p.stocks[userLocId]) > 0);
  });

  const categories = Array.from(new Set(visibleProducts.map(p => p.category).filter(Boolean))) as string[];

  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    visibleProducts.forEach(p => {
      const matchesSearch = !searchTerm || 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesLocation = selectedLocationId === 'all' || 
        (p.locationIds && p.locationIds.includes(selectedLocationId)) ||
        (p.stocks && p.stocks[selectedLocationId] !== undefined && Number(p.stocks[selectedLocationId]) > 0);
      
      if (matchesSearch && matchesLocation) {
        const cat = p.category || 'Uncategorized';
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    return counts;
  }, [visibleProducts, searchTerm, selectedLocationId]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setSelectedBrand('all');
  };

  const filteredProducts = visibleProducts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesLocation = selectedLocationId === 'all' || 
                            (p.locationIds && p.locationIds.includes(selectedLocationId)) ||
                            (p.stocks && p.stocks[selectedLocationId] !== undefined && Number(p.stocks[selectedLocationId]) > 0);
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesBrand = selectedBrand === 'all' || p.brand === selectedBrand;
    
    return matchesSearch && matchesLocation && matchesCategory && matchesBrand;
  });

  const groupedProducts = React.useMemo(() => {
    const groups: {
      [category: string]: {
        [brand: string]: Product[]
      }
    } = {};

    filteredProducts.forEach(product => {
      const category = product.category || 'Uncategorized';
      const brand = product.brand || 'No Brand';

      if (!groups[category]) {
        groups[category] = {};
      }
      if (!groups[category][brand]) {
        groups[category][brand] = [];
      }
      groups[category][brand].push(product);
    });

    return groups;
  }, [filteredProducts]);

  const getProductStock = (product: Product) => {
    if (!selectedLocationId) return 0;
    if (selectedLocationId === 'all') {
      return Object.values(product.stocks || {}).reduce((sum, val) => (sum as number) + Number(val), 0) as number;
    }
    return Number(product.stocks?.[selectedLocationId] || 0);
  };

  const addToCart = (product: Product, quantityToUse: number = addQtyMulti) => {
    const currentStock = getProductStock(product);
    if (currentStock <= 0) {
      toast.error('Product out of stock at this location');
      return;
    }

    if (quantityToUse <= 0) {
      toast.error('Please specify a valid quantity');
      return;
    }

    let salePrice = product.price;

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        const totalQty = existing.quantity + quantityToUse;
        if (totalQty > currentStock) {
          toast.error(`Cannot select more than available stock (${currentStock})`);
          return prev;
        }
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: totalQty, subtotal: totalQty * salePrice, price: salePrice }
            : item
        );
      }
      
      if (quantityToUse > currentStock) {
        toast.error(`Cannot select more than available stock (${currentStock})`);
        return prev;
      }

      const newItem: SaleItem = {
        productId: product.id,
        name: product.name,
        quantity: quantityToUse,
        price: salePrice,
        subtotal: quantityToUse * salePrice,
        originalPrice: product.price
      };
      
      return [...prev, newItem];
    });
  };

  const findCustomerByLoyaltyCode = (scanned: string): { customer: Customer | null; isLoyaltyCode: boolean } => {
    const term = scanned.trim().toLowerCase();
    if (!term) return { customer: null, isLoyaltyCode: false };

    // 1. Direct match on customer record
    const directMatch = customers.find(c => 
      c.loyaltyCardNumber?.toLowerCase() === term ||
      c.loyaltyCardQr?.toLowerCase() === term
    );
    if (directMatch) {
      return { customer: directMatch, isLoyaltyCode: true };
    }

    // 2. Match via loyaltyCards collection
    const cardDoc = loyaltyCards.find(l => 
      l.cardNumber?.toLowerCase() === term ||
      l.qrCode?.toLowerCase() === term
    );
    if (cardDoc) {
      if (cardDoc.customerId) {
        const cust = customers.find(c => c.id === cardDoc.customerId);
        return { customer: cust || null, isLoyaltyCode: true };
      }
      return { customer: null, isLoyaltyCode: true };
    }

    return { customer: null, isLoyaltyCode: false };
  };

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return;
      e.preventDefault();

      const matched = visibleProducts.find(p => 
        p.barcode?.toLowerCase() === term ||
        p.sku?.toLowerCase() === term
      );

      if (matched) {
        addToCart(matched, addQtyMulti);
        setSearchTerm('');
        toast.success(`Scanned and added ${matched.name} to cart`);
        return;
      }

      // Check if term matches a registered customer loyalty card
      const loyaltyMatch = findCustomerByLoyaltyCode(term);
      if (loyaltyMatch.customer) {
        handleCustomerSelect(loyaltyMatch.customer.id);
        setSearchTerm('');
        toast.success(`💳 Loyalty Card Scanned: Selected customer ${loyaltyMatch.customer.name}`);
        return;
      } else if (loyaltyMatch.isLoyaltyCode) {
        toast.error('Loyalty cards apply only to registered customers in the app.');
        setSearchTerm('');
        return;
      }

      // On-demand Firestore lookup for un-cached products (by barcode or SKU)
      try {
        const barcodeQ = query(collection(db, 'products'), where('barcode', '==', searchTerm.trim()), limit(1));
        const barcodeSnap = await getDocs(barcodeQ);
        if (!barcodeSnap.empty) {
          const fetchedP = { id: barcodeSnap.docs[0].id, ...barcodeSnap.docs[0].data() } as Product;
          addToCart(fetchedP, addQtyMulti);
          setSearchTerm('');
          toast.success(`Scanned and added ${fetchedP.name} to cart`);
          return;
        }

        const skuQ = query(collection(db, 'products'), where('sku', '==', searchTerm.trim()), limit(1));
        const skuSnap = await getDocs(skuQ);
        if (!skuSnap.empty) {
          const fetchedP = { id: skuSnap.docs[0].id, ...skuSnap.docs[0].data() } as Product;
          addToCart(fetchedP, addQtyMulti);
          setSearchTerm('');
          toast.success(`Scanned and added ${fetchedP.name} to cart`);
          return;
        }
      } catch (err) {
        console.warn("On-demand product barcode lookup notice:", err);
      }

      if (filteredProducts.length === 1) {
        addToCart(filteredProducts[0], addQtyMulti);
        setSearchTerm('');
        toast.success(`Scanned and added ${filteredProducts[0].name} to cart`);
      } else {
        toast.error(`No unique product or registered customer loyalty card found matching "${searchTerm}"`);
      }
    }
  };

  // Support Hardware Barcode Scanners (automatically listening to fast sequential global entries)
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInput && target.id !== 'global-scanner-stub') {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 50) {
        buffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          const matched = visibleProducts.find(p => 
            p.barcode?.toLowerCase() === buffer.toLowerCase() ||
            p.sku?.toLowerCase() === buffer.toLowerCase()
          );

          if (matched) {
            addToCart(matched, addQtyMulti);
            toast.success(`Scanned hardware: ${matched.name} added to cart`);
            e.preventDefault();
          } else {
            const loyaltyMatch = findCustomerByLoyaltyCode(buffer);
            if (loyaltyMatch.customer) {
              handleCustomerSelect(loyaltyMatch.customer.id);
              toast.success(`💳 Hardware Scanned Loyalty Card: Selected customer ${loyaltyMatch.customer.name}`);
              e.preventDefault();
            } else if (loyaltyMatch.isLoyaltyCode) {
              toast.error('Loyalty cards apply only to registered customers in the app.');
              e.preventDefault();
            }
          }
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [visibleProducts, selectedLocationId, addQtyMulti, customers, loyaltyCards]);

  const handleCustomerSelect = (id: string) => {
    setSelectedCustomerId(id);
    setApplyLoyaltyDiscount(false);
    const activeLocationId = selectedLocationId === 'all' ? checkoutLocationId : selectedLocationId;
    const location = locations.find(l => l.id === activeLocationId);

    if (id === 'walk-in') {
      setCustomerSearchQuery('Walk-In Customer');
      setCustomerDetails({
        name: 'Walk-In Customer',
        billingAddress: location?.addressLine1 || '',
        shippingAddress: location?.addressLine1 || '',
        municipality: location?.municipality || '',
        city: location?.city || '',
        country: location?.country || 'Philippines',
        zip: ''
      });
    } else if (id === 'new') {
      setCustomerSearchQuery('');
      setCustomerDetails({
        name: '',
        billingAddress: location?.addressLine1 || '',
        shippingAddress: location?.addressLine1 || '',
        municipality: location?.municipality || '',
        city: location?.city || '',
        country: location?.country || 'Philippines',
        zip: ''
      });
    } else {
      const customer = customers.find(c => c.id === id);
      if (customer) {
        setCustomerSearchQuery(customer.name);
        setCustomerDetails({
          name: customer.name,
          billingAddress: customer.billingAddress,
          shippingAddress: customer.shippingAddress,
          municipality: customer.municipality,
          city: customer.city,
          country: customer.country,
          zip: customer.zip
        });
      }
    }
    setIsCustomerSearchOpen(false);
  };

  const filteredCustomers = customers.filter(c => {
    const query = customerSearchQuery.trim().toLowerCase();
    if (!query || query === 'walk-in customer' || query === 'walk-in') return true;

    const matchName = c.name?.toLowerCase().includes(query);
    const matchPhone = c.phone?.toLowerCase().includes(query);
    const matchEmail = c.email?.toLowerCase().includes(query);
    const matchLoyaltyNum = c.loyaltyCardNumber?.toLowerCase().includes(query);
    const matchLoyaltyQr = c.loyaltyCardQr?.toLowerCase().includes(query);

    const hasMatchingCardDoc = loyaltyCards.some(l => 
      l.customerId === c.id && 
      ((l.cardNumber && l.cardNumber.toLowerCase().includes(query)) || 
       (l.qrCode && l.qrCode.toLowerCase().includes(query)))
    );

    return matchName || matchPhone || matchEmail || matchLoyaltyNum || matchLoyaltyQr || hasMatchingCardDoc;
  });

  const handleCustomerInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = customerSearchQuery.trim().toLowerCase();
      if (!query) return;

      // 1. Try loyalty card scan/code match
      const loyaltyMatch = findCustomerByLoyaltyCode(query);
      if (loyaltyMatch.customer) {
        handleCustomerSelect(loyaltyMatch.customer.id);
        toast.success(`💳 Loyalty Card Found: Selected customer ${loyaltyMatch.customer.name}`);
        return;
      }

      // 2. Exact match on name, phone, email, or loyalty card number
      const exactMatch = customers.find(c => 
        c.name.toLowerCase() === query || 
        c.phone?.toLowerCase() === query || 
        c.email?.toLowerCase() === query ||
        c.loyaltyCardNumber?.toLowerCase() === query
      );
      if (exactMatch) {
        handleCustomerSelect(exactMatch.id);
        toast.success(`Selected customer ${exactMatch.name}`);
        return;
      }

      // 3. Single filtered result
      if (filteredCustomers.length === 1) {
        handleCustomerSelect(filteredCustomers[0].id);
        toast.success(`Selected customer ${filteredCustomers[0].name}`);
        return;
      }

      // 4. Default to walk-in if 'walk-in' typed
      if (query === 'walk-in' || query === 'walkin' || query === 'walk-in customer') {
        handleCustomerSelect('walk-in');
      }
    }
  };

  useEffect(() => {
    if (!profile) return;

    // Limit initial product streaming to 100 items (additional products loaded via direct SKU/barcode scanner or search)
    const q = query(collection(db, 'products'), orderBy('name', 'asc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      console.warn("POS: Error listening to products collection:", error);
    });

    const custQ = query(collection(db, 'customers'), orderBy('name', 'asc'), limit(50));
    const unsubscribeCustomers = onSnapshot(custQ, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (error) => {
      console.warn("POS: Error listening to customers collection:", error);
    });

    const cardsQ = query(collection(db, 'loyaltyCards'), limit(50));
    const unsubscribeCards = onSnapshot(cardsQ, (snapshot) => {
      setLoyaltyCards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoyaltyCard)));
    }, (error) => {
      console.warn("POS: Error listening to loyaltyCards collection:", error);
    });

    const promosQ = query(collection(db, 'promos'), limit(30));
    const unsubscribePromos = onSnapshot(promosQ, (snapshot) => {
      setPromos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PromoCode)));
    }, (error) => {
      console.warn("POS: Error listening to promos collection:", error);
    });

    const paymentsQ = query(collection(db, 'paymentOptions'), limit(30));
    const unsubscribePayments = onSnapshot(paymentsQ, (snapshot) => {
      setPaymentOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentOption)));
    }, (error) => {
      console.warn("POS: Error listening to paymentOptions collection:", error);
    });

    let unsubscribeAccounts: (() => void) | null = null;
    const isStaffUser = ['admin', 'manager', 'staff'].includes(profile.role) || 
                        ['vanhuxley24@gmail.com', 'v4peavenue@gmail.com'].includes(user?.email?.toLowerCase() || '');

    if (isStaffUser) {
      const accsQ = query(collection(db, 'accounts'), limit(20));
      unsubscribeAccounts = onSnapshot(accsQ, (snapshot) => {
        setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        console.warn("POS: Error listening to accounts collection:", error);
      });
    }

    const usersQ = query(collection(db, 'users'), limit(50));
    const unsubscribeUsers = onSnapshot(usersQ, (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn("POS: Error listening to users collection:", error);
    });

    return () => {
      unsubscribe();
      unsubscribeCustomers();
      unsubscribeCards();
      unsubscribePromos();
      unsubscribePayments();
      unsubscribeUsers();
      if (unsubscribeAccounts) unsubscribeAccounts();
    };
  }, [profile?.id, profile?.role, user?.uid]);

  useEffect(() => {
    if (selectedLocationId && selectedLocationId !== 'all') {
      setCheckoutLocationId(selectedLocationId);
    }
    // Removed the else { setCheckoutLocationId(''); } to prevent resetting when user selects in dialog

    const activeLocationId = selectedLocationId === 'all' ? checkoutLocationId : selectedLocationId;
    if (activeLocationId && (selectedCustomerId === 'new' || selectedCustomerId === 'walk-in')) {
      const location = locations.find(l => l.id === activeLocationId);
      if (location) {
        setCustomerDetails(prev => ({
          ...prev,
          name: selectedCustomerId === 'walk-in' ? 'Walk-In Customer' : prev.name,
          billingAddress: location.addressLine1 || '',
          shippingAddress: location.addressLine1 || '',
          municipality: location.municipality || '',
          city: location.city || '',
          country: location.country || 'Philippines'
        }));
      }
    }
  }, [selectedLocationId, checkoutLocationId, locations, selectedCustomerId]);

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      const item = prev.find(i => i.productId === productId);
      if (!item) return prev;

      const product = products.find(p => p.id === productId);
      const currentStock = product ? getProductStock(product) : 0;
      const newQty = item.quantity + delta;

      if (newQty <= 0) {
        return prev.filter(i => i.productId !== productId);
      }

      if (newQty > currentStock) {
        toast.error('Cannot exceed available stock');
        return prev;
      }

      return prev.map(i => 
        i.productId === productId 
          ? { ...i, quantity: newQty, subtotal: newQty * i.price }
          : i
      );
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const totalCartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const isRegisteredCustomer = !!selectedCustomer && selectedCustomerId !== 'walk-in' && selectedCustomerId !== 'new';

  // Find active assigned loyalty card for registered customer
  const activeAssignedCard = isRegisteredCustomer
    ? loyaltyCards.find(l => 
        (l.customerId === selectedCustomer.id || (l.cardNumber && l.cardNumber === selectedCustomer.loyaltyCardNumber)) && 
        l.status === 'active'
      )
    : null;
  const hasAssignedLoyaltyCard = isRegisteredCustomer && !!activeAssignedCard && !!selectedCustomer.loyaltyCardNumber;

  const customerLoyaltyCount = selectedCustomer 
    ? (selectedCustomer.loyaltyItemCount ?? ((selectedCustomer.totalItemsPurchased ?? 0) % 10))
    : 0;

  const loyaltyResult = calculateLoyaltyDiscount(
    hasAssignedLoyaltyCard ? customerLoyaltyCount : 0,
    totalCartItemCount,
    settings.loyaltyTier1Discount ?? 50,
    settings.loyaltyTier2Discount ?? 100,
    (settings.loyaltyEnabled ?? true) && hasAssignedLoyaltyCard
  );

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const promoDiscount = appliedPromo ? appliedPromo.amount : 0;
  
  // Loyalty card discount is NOT automatic:
  // Requires: Registered customer + active assigned card + global Admin toggle ON + manual checkbox checked
  const loyaltyDiscount = (hasAssignedLoyaltyCard && (settings.loyaltyEnabled ?? true) && applyLoyaltyDiscount)
    ? loyaltyResult.discountAmount
    : 0;
  const discount = promoDiscount + loyaltyDiscount;
  const deliveryFeeNum = saleType === 'online' ? (parseFloat(deliveryFee) || 0) : 0;
  const total = Math.max(0, subtotal - discount + deliveryFeeNum);
  const tax = total * (12/112); // 12% VAT portion included in the price

  const activeTotal = isCheckoutOpen && editedTotal !== '' ? (parseFloat(editedTotal) || 0) : total;
  const parsedReceived = amountReceived === '' ? activeTotal : parseFloat(amountReceived);
  const changeAmount = isNaN(parsedReceived) ? 0 : Math.max(0, parsedReceived - activeTotal);

  useEffect(() => {
    if (isCheckoutOpen) {
      setEditedTotal((total ?? 0).toFixed(2));
    }
  }, [isCheckoutOpen, total]);

  const applyPromo = () => {
    if (!promoCodeInput.trim()) {
      setAppliedPromo(null);
      return;
    }
    const code = promoCodeInput.trim().toUpperCase();
    const promo = promos.find(p => p.code === code && p.isActive);
    
    if (!promo) {
      toast.error('Invalid promo code');
      setAppliedPromo(null);
      return;
    }

    // Check dates
    if (!promo.isPermanent) {
      const now = new Date();
      if (promo.startDate && now < promo.startDate.toDate()) {
        toast.error('Promo has not started yet');
        return;
      }
      if (promo.endDate && now > promo.endDate.toDate()) {
        toast.error('Promo has expired');
        return;
      }
    }

    setAppliedPromo(promo);
    toast.success(`Promo code ${code} applied (-${settings.currency}${promo.amount})`);
  };

  useEffect(() => {
    if (isPromoApprovalOpen) {
      if (profile?.role === 'admin' || profile?.role === 'manager') {
        setSelectedApproverId('current');
      } else {
        setSelectedApproverId('');
      }
    }
  }, [isPromoApprovalOpen, profile]);

  const handlePromoApprove = () => {
    const correctPasscodes = ['1234', '8888', 'admin', 'approve'];
    if (!selectedApproverId) {
      toast.error('Please select an authorizing administrator or manager');
      return;
    }
    if (!correctPasscodes.includes(approverPasscode)) {
      toast.error('Invalid authorization PIN / passcode');
      return;
    }

    let approverName = 'System Administrator';
    if (selectedApproverId === 'current') {
      approverName = profile?.name || 'Administrator';
    } else {
      const found = allUsers.find(u => u.id === selectedApproverId);
      if (found) {
        approverName = found.name;
      }
    }

    const approverInfo = {
      id: selectedApproverId === 'current' ? (profile?.id || 'admin') : selectedApproverId,
      name: approverName
    };

    setApprovedByInfo(approverInfo);
    setIsPromoApprovalOpen(false);
    toast.success(`Promo approved by ${approverName}!`);

    // Automatically resume checkout
    setTimeout(() => {
      handleCheckout(pendingCheckoutType ?? false);
    }, 150);
  };

  const handleQuickAssignLoyaltyCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignCardCustomer) return;

    const cardNum = quickCardNumber.trim() || ('LC-' + Math.floor(100000 + Math.random() * 900000));
    const cardQr = quickCardQr.trim() || cardNum;

    try {
      const cardRef = await addDoc(collection(db, 'loyaltyCards'), {
        cardNumber: cardNum,
        qrCode: cardQr,
        customerId: assignCardCustomer.id,
        customerName: assignCardCustomer.name,
        issuedAt: new Date().toISOString(),
        status: 'active',
        notes: 'Issued via POS Quick Assign'
      });

      await updateDoc(doc(db, 'customers', assignCardCustomer.id), {
        loyaltyCardNumber: cardNum,
        loyaltyCardQr: cardQr
      });

      await logAction(profile, 'CREATE_LOYALTY_CARD', `Issued loyalty card ${cardNum} to ${assignCardCustomer.name}`, cardRef.id, 'loyaltyCard');
      toast.success(`Loyalty card #${cardNum} assigned to ${assignCardCustomer.name}!`);

      if (selectedCustomerId === assignCardCustomer.id) {
        setApplyLoyaltyDiscount(true);
      }

      setAssignCardCustomer(null);
      setQuickCardNumber('');
      setQuickCardQr('');
      setExpiredCardNotice(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'loyaltyCards');
    }
  };

  const handleCheckout = async (isPending: boolean = false) => {
    if (cart.length === 0) return;
    if (!customerDetails.name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (!checkoutLocationId || checkoutLocationId === 'all') {
      toast.error('Please select a specific location for this sale');
      return;
    }

    // Validate stock for the selected checkout location
    for (const item of cart) {
      const product = products.find(p => p.id === item.productId);
      const locationStock = product?.stocks?.[checkoutLocationId] || 0;
      if (locationStock < item.quantity) {
        toast.error(`Insufficient stock for ${item.name} at the selected location (${locationStock} available)`);
        return;
      }
    }

    setProcessing(true);
    try {
      let finalCustomerId = selectedCustomerId;

      // Create new customer only if 'new' is selected (do not create for walk-in)
      if (selectedCustomerId === 'new') {
        const customerRef = await addDoc(collection(db, 'customers'), {
          ...customerDetails,
          createdAt: Timestamp.now()
        });
        finalCustomerId = customerRef.id;
        supabaseService.saveCustomer({
          id: finalCustomerId,
          ...customerDetails
        }).catch(() => {});
      }

      const checkoutTotal = isCheckoutOpen && editedTotal !== '' ? (parseFloat(editedTotal) || 0) : total;
      const isTotalEdited = isCheckoutOpen && Math.abs(checkoutTotal - total) > 0.01;
      const checkoutParsedReceived = amountReceived === '' ? checkoutTotal : parseFloat(amountReceived);
      const checkoutChangeAmount = isNaN(checkoutParsedReceived) ? 0 : Math.max(0, checkoutParsedReceived - checkoutTotal);

      // Resolve/Create accounts for payments to ensure everything is tracked in Finance
      const resolvedSplits: any[] = [];
      let resolvedPaymentMethod = paymentMethod;

      if (!isPending) {
        let rawSplits = isSplitPayment ? paymentSplits : [{ 
          methodId: paymentMethod, 
          amount: checkoutTotal,
          reference: paymentReference
        }];

        if (isSplitPayment && paymentSplits.length > 0) {
          const currentSum = paymentSplits.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
          if (currentSum > 0 && Math.abs(currentSum - checkoutTotal) > 0.01) {
            let runningSum = 0;
            rawSplits = paymentSplits.map((s, idx) => {
              if (idx === paymentSplits.length - 1) {
                return { ...s, amount: Math.max(0, checkoutTotal - runningSum) };
              }
              const scaledAmount = Math.round(((Number(s.amount) || 0) / currentSum) * checkoutTotal * 100) / 100;
              runningSum += scaledAmount;
              return { ...s, amount: scaledAmount };
            });
          }
        }

        for (const split of rawSplits) {
          if (!split.methodId) continue;

          let accountName = '';
          let accountType: 'bank' | 'ewallet' | 'cash' | 'card' = 'cash';

          if (split.methodId === 'cash') {
            accountName = 'Cash';
            accountType = 'cash';
          } else if (split.methodId === 'card') {
            accountName = 'Generic Card';
            accountType = 'card';
          } else if (split.methodId === 'digital') {
            accountName = 'Generic Digital';
            accountType = 'ewallet';
          } else {
            // Find in current paymentOptions/accounts
            const opt = paymentOptions.find(o => o.id === split.methodId);
            if (opt) {
              accountName = opt.name;
              accountType = opt.type;
            } else {
              const acc = accounts.find(a => a.id === split.methodId);
              if (acc) {
                accountName = acc.name;
                accountType = acc.type;
              } else {
                accountName = split.methodId.charAt(0).toUpperCase() + split.methodId.slice(1);
                accountType = 'cash';
              }
            }
          }

          // See if an account with this name or ID already exists in the accounts collection
          let targetAccount = accounts.find(a => 
            a.id === split.methodId || 
            a.name.toLowerCase() === accountName.toLowerCase()
          );

          let resolvedId = targetAccount?.id || '';

          if (!targetAccount) {
            // Create payment option first to keep it in sync
            const paymentRef = await addDoc(collection(db, 'paymentOptions'), {
              name: accountName,
              type: accountType,
              active: true
            });
            resolvedId = paymentRef.id;

            // Create account with the same ID
            await setDoc(doc(db, 'accounts', resolvedId), {
              name: accountName,
              type: accountType,
              balance: 0,
              lastUpdated: Timestamp.now()
            });

            targetAccount = {
              id: resolvedId,
              name: accountName,
              type: accountType,
              balance: 0
            };
          }

          resolvedSplits.push({
            methodId: resolvedId,
            methodName: accountName,
            amount: split.amount,
            reference: split.reference || ''
          });
        }

        // If not a split payment, the main paymentMethod is the single resolved account ID
        if (!isSplitPayment && resolvedSplits.length > 0) {
          resolvedPaymentMethod = resolvedSplits[0].methodId;
        }
      }

      const saleData: any = {
        items: cart.map(item => {
          const cleanedItem: any = { ...item };
          Object.keys(cleanedItem).forEach(key => {
            if (cleanedItem[key] === undefined) delete cleanedItem[key];
          });
          return cleanedItem;
        }),
        subtotal,
        total: checkoutTotal,
        originalTotal: total,
        isTotalEdited: isTotalEdited,
        tax,
        discount,
        paymentMethod: isPending ? 'pending' : (isSplitPayment ? 'split' : resolvedPaymentMethod),
        paymentSplits: isPending ? [] : resolvedSplits,
        status: isPending 
          ? 'pending' 
          : (isTotalEdited && !isAdmin)
            ? 'pending_total_approval'
            : (appliedPromo && !approvedByInfo)
              ? 'pending_promo_approval' 
              : 'completed',
        staffId: profile?.id || 'anonymous',
        staffName: profile?.name || 'Staff',
        locationId: checkoutLocationId,
        customerId: finalCustomerId,
        customerDetails: {
          name: customerDetails.name,
          billingAddress: customerDetails.billingAddress,
          shippingAddress: customerDetails.shippingAddress,
          municipality: customerDetails.municipality,
          city: customerDetails.city,
          country: customerDetails.country,
          zip: customerDetails.zip
        },
        amountReceived: isNaN(checkoutParsedReceived) ? checkoutTotal : checkoutParsedReceived,
        changeAmount: checkoutChangeAmount,
        saleType,
        deliveryFee: deliveryFeeNum,
        loyaltyDiscount,
        loyaltyTier1Earned: loyaltyResult.tier1Triggers,
        loyaltyTier2Earned: loyaltyResult.tier2Triggers,
        stockDeducted: true,
        timestamp: Timestamp.now()
      };

      if (appliedPromo) {
        saleData.promoId = appliedPromo.id;
        saleData.promoCode = appliedPromo.code;
        if (approvedByInfo) {
          saleData.promoApprovedBy = approvedByInfo.name;
          saleData.promoApprovedById = approvedByInfo.id;
          saleData.promoApprovedAt = Timestamp.now();
        }
      }

      // Perform ATOMIC write batch for sale creation, stock deduction, accounts, and financial transactions
      const batch = writeBatch(db);
      const saleRef = doc(collection(db, 'sales'));
      setLastSaleId(saleRef.id);
      batch.set(saleRef, saleData);

      // Update financial accounts & transactions (ONLY IF NOT PENDING)
      const isPromoPending = !!appliedPromo && !approvedByInfo;
      const isTotalPending = isTotalEdited && !isAdmin;
      if (!isPending && !isPromoPending && !isTotalPending) {
        for (const split of resolvedSplits) {
          const account = accounts.find(a => a.id === split.methodId) || { name: split.methodName, balance: 0 };
          const currentBalance = account.balance || 0;
          const newBalance = currentBalance + split.amount;

          const accountRef = doc(db, 'accounts', split.methodId);
          batch.update(accountRef, {
            balance: increment(split.amount),
            lastUpdated: Timestamp.now()
          });

          // Create financial transaction record for Finance history
          const finRef = doc(collection(db, 'financialTransactions'));
          batch.set(finRef, {
            amount: split.amount,
            type: 'income',
            accountId: split.methodId,
            accountName: split.methodName,
            locationId: checkoutLocationId || null,
            locationName: locations.find(l => l.id === checkoutLocationId)?.name || null,
            category: 'Sales',
            description: isTotalEdited 
              ? `Sale Payment (Edited Total) #${saleRef.id.substring(0, 8)}: ${customerDetails.name || 'Walk-In'}`
              : `Sale Payment #${saleRef.id.substring(0, 8)}: ${customerDetails.name || 'Walk-In'}`,
            reference: split.reference || saleRef.id,
            saleId: saleRef.id,
            timestamp: Timestamp.now(),
            createdBy: profile?.id || 'anonymous',
            createdByName: profile?.name || 'Staff',
            accountBalance: newBalance
          });
        }
      }

      // Update inventory stock atomically
      for (const item of cart) {
        const product = products.find(p => p.id === item.productId);
        if (!product) continue;

        const productRef = doc(db, 'products', item.productId);
        batch.update(productRef, {
          stock: increment(-item.quantity),
          [`stocks.${checkoutLocationId}`]: increment(-item.quantity),
          updatedAt: Timestamp.now()
        });
      }

      // Commit entire batch atomically
      await batch.commit();

      // Mirror sale, stock changes, and financial transactions to Supabase
      supabaseService.saveSale({ id: saleRef.id, ...saleData }).catch(() => {});
      
      if (!isPending && !isPromoPending && !isTotalPending) {
        for (const split of resolvedSplits) {
          supabaseService.saveFinancialTransaction({
            account_id: split.methodId,
            type: 'income',
            category: 'Sales',
            amount: split.amount,
            description: `Sale Payment #${saleRef.id.substring(0, 8)}: ${customerDetails.name || 'Walk-In'}`,
            reference_id: split.reference || saleRef.id,
            created_by: profile?.id || 'anonymous',
            location_id: checkoutLocationId || null
          }).catch(() => {});
        }
      }

      for (const item of cart) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          const newStock = Math.max(0, (prod.stock || 0) - item.quantity);
          supabaseService.saveProduct({
            ...prod,
            stock: newStock
          }).catch(() => {});
        }
      }

      // 3. Update customer loyalty purchase count and check for card expiration/consumption
      if (finalCustomerId && finalCustomerId !== 'walk-in' && finalCustomerId !== 'new') {
        const loyaltyRes = await processCustomerLoyaltyCheckout(
          finalCustomerId,
          totalCartItemCount,
          loyaltyDiscount > 0,
          loyaltyResult.tier2Triggers
        );

        if (loyaltyRes.cardExpired) {
          setExpiredCardNotice({
            customerId: finalCustomerId,
            customerName: loyaltyRes.customerName || customerDetails.name || 'Customer',
            cardNumber: loyaltyRes.expiredCardNumber || ''
          });
        }
      }

      const itemSummary = cart.map(i => `${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ''}`).join(', ');
      await logAction(profile, isPending ? 'CREATE_PENDING_SALE' : 'CREATE_SALE', `Processed ${isPending ? 'pending ' : ''}sale: Total ${(total ?? 0).toFixed(2)} [${itemSummary}]`, saleRef.id, 'sale');

      setCart([]);
      setAppliedPromo(null);
      setPromoCodeInput('');
      setApprovedByInfo(null);
      setPendingCheckoutType(null);
      setApproverPasscode('');
      setSelectedApproverId('');
      setPaymentSplits([]);
      setPaymentReference('');
      setActiveCategory('cash');
      setIsSplitPayment(false);
      setAmountReceived('');
      setSaleType('in-store');
      setDeliveryFee('0');
      
      // Reset customer to walk-in
      setSelectedCustomerId('walk-in');
      const activeLocationId = selectedLocationId === 'all' ? checkoutLocationId : selectedLocationId;
      const location = locations.find(l => l.id === activeLocationId);
      setCustomerDetails({
        name: 'Walk-In Customer',
        billingAddress: location?.addressLine1 || '',
        shippingAddress: location?.addressLine1 || '',
        municipality: location?.municipality || '',
        city: location?.city || '',
        country: location?.country || 'Philippines',
        zip: ''
      });

      setIsCheckoutOpen(false);
      setIsSuccessOpen(true);
      toast.success(isPending ? 'Sale marked as pending' : 'Sale completed successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sales');
    } finally {
      setProcessing(false);
    }
  };


  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="h-full min-h-0 lg:h-[calc(100vh-120px)] flex flex-col lg:flex-row gap-6 lg:gap-8"
    >
      {/* Mobile Tab Switcher */}
      <div className="flex lg:hidden bg-slate-100 p-1.5 rounded-2xl gap-2 shadow-sm shrink-0 border border-slate-200">
        <Button
          variant="ghost"
          onClick={() => setActiveTab('products')}
          className={cn(
            "flex-1 h-11 text-xs font-bold rounded-xl transition-all gap-2",
            activeTab === 'products'
              ? "bg-[#1A2B4B] text-white shadow-md shadow-[#1A2B4B]/10 hover:bg-[#1A2B4B]"
              : "text-slate-600 hover:bg-slate-200"
          )}
        >
          <Package className="w-4 h-4" />
          Products ({filteredProducts.length})
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveTab('cart')}
          className={cn(
            "flex-1 h-11 text-xs font-bold rounded-xl transition-all gap-2 relative",
            activeTab === 'cart'
              ? "bg-[#1A2B4B] text-white shadow-[#1A2B4B]/10 hover:bg-[#1A2B4B] hover:text-white font-black"
              : "text-slate-600 hover:bg-slate-200"
          )}
        >
          <ShoppingCart className="w-4 h-4" />
          Cart ({cart.reduce((sum, i) => sum + i.quantity, 0)})
          {cart.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white font-black text-[9px] h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center border-2 border-white animate-bounce animate-duration-1000">
              {cart.reduce((sum, i) => sum + i.quantity, 0)}
            </span>
          )}
        </Button>
      </div>

      {/* Product Selection Area */}
      <div className={cn("flex-1 flex flex-col gap-6 min-h-0 min-w-0", activeTab !== 'products' && "hidden lg:flex")}>
        <div className="w-full flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
            <div className="relative flex-1 flex gap-2 w-full min-w-[200px]">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                <Input 
                  className="pl-10 sm:pl-12 h-10 sm:h-12 text-sm sm:text-base bg-white/50 border-slate-200 shadow-sm rounded-xl focus-visible:ring-[#D4AF37] backdrop-blur-sm w-full" 
                  placeholder="Search by name, SKU, or Barcode..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 sm:h-12 w-10 sm:w-12 border-slate-200 bg-white/50 rounded-xl hover:bg-[#D4AF37]/10 flex items-center justify-center group active:scale-95 shadow-sm shrink-0"
                onClick={() => setIsScannerOpen(true)}
                title="Scan Barcode with Camera"
              >
                <Scan className="w-4 h-4 sm:w-5 sm:h-5 text-[#1A2B4B] group-hover:text-[#D4AF37] transition-colors" />
              </Button>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
              {/* Add Qty Selector */}
              <div className="flex items-center gap-1 bg-white/95 border border-slate-200/80 rounded-xl p-1 shadow-sm h-10 sm:h-12 select-none">
                <span className="text-[10px] font-black uppercase text-[#1A2B4B] tracking-wider pl-2 pr-1">Add Qty:</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-slate-100 rounded-lg shrink-0 text-slate-600 active:scale-95"
                  type="button"
                  onClick={() => setAddQtyMulti(prev => Math.max(1, prev - 1))}
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
                <Input 
                  type="number"
                  className="w-10 h-7 sm:h-8 text-center font-black text-xs sm:text-sm border-none bg-transparent focus-visible:ring-0 p-0 text-[#1A2B4B]"
                  value={addQtyMulti}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 1) {
                      setAddQtyMulti(val);
                    }
                  }}
                  min={1}
                />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-slate-100 rounded-lg shrink-0 text-slate-600 active:scale-95"
                  type="button"
                  onClick={() => setAddQtyMulti(prev => prev + 1)}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-white/95 border border-slate-200/80 rounded-xl p-1 shadow-sm h-10 sm:h-12 select-none">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className={cn(
                    "h-8 sm:h-10 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all",
                    viewMode === 'list' 
                      ? "bg-[#1A2B4B] text-white hover:bg-[#1A2B4B]/90 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  )}
                  onClick={() => setViewMode('list')}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span>List</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className={cn(
                    "h-8 sm:h-10 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all",
                    viewMode === 'grid' 
                      ? "bg-[#1A2B4B] text-white hover:bg-[#1A2B4B]/90 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  )}
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Category Filter Bar (Clean horizontal strip with uniform height pills) */}
        <div className="w-full bg-slate-50/80 p-1.5 rounded-2xl border border-slate-200/80 backdrop-blur-sm shrink-0 flex items-center gap-2">
          {/* Mobile Select Dropdown for quick category picking */}
          <div className="sm:hidden w-full">
            <Select value={selectedCategory} onValueChange={(val) => handleCategoryChange(val)}>
              <SelectTrigger className="w-full bg-white h-9 text-xs font-bold border-slate-200 shadow-xs rounded-xl text-[#1A2B4B]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-[#1A2B4B]">
                <SelectItem value="all" className="font-bold">All Categories ({filteredProducts.length})</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {cat} ({categoryCounts[cat] || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop/Tablet Horizontal Scrollable Category Strip */}
          <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 px-0.5 w-full">
            <button
              type="button"
              onClick={() => handleCategoryChange('all')}
              className={cn(
                "h-9 px-3.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-2 select-none border cursor-pointer",
                selectedCategory === 'all'
                  ? "bg-[#1A2B4B] text-white border-[#1A2B4B] shadow-xs font-black"
                  : "bg-white text-slate-600 border-slate-200/90 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300"
              )}
            >
              <span>All Categories</span>
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] font-black rounded-md transition-colors",
                selectedCategory === 'all'
                  ? "bg-[#D4AF37] text-[#1A2B4B]"
                  : "bg-slate-100 text-slate-500"
              )}>
                {filteredProducts.length}
              </span>
            </button>

            {categories.map(cat => {
              const count = categoryCounts[cat] || 0;
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryChange(cat)}
                  className={cn(
                    "h-9 px-3.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-2 select-none border cursor-pointer",
                    isActive
                      ? "bg-[#1A2B4B] text-white border-[#1A2B4B] shadow-xs font-black"
                      : "bg-white text-slate-600 border-slate-200/90 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300"
                  )}
                >
                  <span>{cat}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 text-[10px] font-black rounded-md transition-colors",
                    isActive
                      ? "bg-[#D4AF37] text-[#1A2B4B]"
                      : "bg-slate-100 text-slate-500"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-12 text-center bg-white/30 backdrop-blur-sm rounded-2xl border border-slate-100/80">
              <Package className="w-12 h-12 text-slate-300 mb-4 animate-bounce" />
              <p className="text-base font-bold text-[#1A2B4B]">No products found</p>
              <p className="text-xs mt-1 text-slate-500">Try adjusting your filters or search term.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-5 pb-6">
              {filteredProducts.map((product, index) => {
                const currentStock = getProductStock(product);
                return (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                  >
                    <Card 
                      className={cn(
                        "cursor-pointer transition-all duration-300 hover:shadow-xl active:scale-95 group relative overflow-hidden border-slate-200/60 rounded-2xl bg-white/50 backdrop-blur-sm",
                        currentStock <= 0 ? "opacity-60 grayscale cursor-not-allowed" : "hover:border-[#D4AF37]/50 hover:-translate-y-1"
                      )}
                      onClick={() => currentStock > 0 && addToCart(product)}
                    >
                      <CardContent className="p-0">
                        <div className="aspect-[4/3] bg-slate-50 flex items-center justify-center text-slate-300 overflow-hidden relative">
                          {product.imageUrl ? (
                            <img 
                              src={product.imageUrl} 
                              alt={product.name} 
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Package className="w-12 h-12" />
                          )}
                          <div className="absolute top-2 right-2">
                            <Badge className={cn(
                              "shadow-sm border-none",
                              currentStock <= 5 ? "bg-rose-500" : "bg-[#1A2B4B]"
                            )}>
                              {currentStock}
                            </Badge>
                          </div>
                        </div>
                        <div className="p-4">
                          <p className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-wider mb-1">{product.category}</p>
                          <h3 className="font-bold text-[#1A2B4B] truncate text-sm mb-2">{product.name}</h3>
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-black text-[#1A2B4B]">{settings.currency}{(product.price ?? 0).toFixed(2)}</span>
                            <div className="w-8 h-8 rounded-full bg-white border border-slate-100 flex items-center justify-center group-hover:bg-[#1A2B4B] group-hover:text-white transition-colors shadow-sm">
                              <Plus className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* Grouped List View */
            <div className="space-y-8 pb-6">
              {Object.keys(groupedProducts).sort().map((category) => {
                const brands = groupedProducts[category] as Record<string, Product[]>;
                return (
                  <div key={category} className="space-y-4">
                    {/* Category Title Header */}
                    <div className="flex items-center gap-3 border-b border-[#1A2B4B]/10 pb-2">
                      <h2 className="text-base font-bold text-[#1A2B4B] tracking-tight">{category}</h2>
                      <Badge className="bg-[#1A2B4B]/10 text-[#1A2B4B] hover:bg-[#1A2B4B]/15 border-none font-bold text-[10px] h-5 px-2">
                        {Object.values(brands).reduce((sum, prods) => sum + prods.length, 0)} Items
                      </Badge>
                    </div>

                    <div className="space-y-6 pl-2 sm:pl-4">
                      {Object.keys(brands).sort().map((brand) => {
                        const prods = brands[brand];
                        return (
                          <div key={brand} className="space-y-3">
                            {/* Brand Header */}
                            <h3 className="text-[10px] font-black uppercase tracking-wider text-[#D4AF37] flex items-center gap-2">
                              <span>{brand}</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                              <span className="text-[9px] text-slate-400 font-medium lowercase">({prods.length} products)</span>
                            </h3>

                            {/* List of Products */}
                            <div className="grid gap-2.5">
                              {prods.map((product) => {
                                const currentStock = getProductStock(product);
                                return (
                                  <div
                                    key={product.id}
                                    className={cn(
                                      "flex items-center justify-between p-3 bg-white border border-slate-200/60 rounded-xl transition-all hover:border-[#D4AF37]/40 hover:shadow-md cursor-pointer select-none group",
                                      currentStock <= 0 && "opacity-60 grayscale cursor-not-allowed"
                                    )}
                                    onClick={() => currentStock > 0 && addToCart(product)}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      {/* Thumbnail */}
                                      <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 overflow-hidden shrink-0 border border-slate-100">
                                        {product.imageUrl ? (
                                          <img
                                            src={product.imageUrl}
                                            alt={product.name}
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                          />
                                        ) : (
                                          <Package className="w-5 h-5" />
                                        )}
                                      </div>

                                      {/* Name & Identifiers */}
                                      <div className="min-w-0">
                                        <h4 className="font-bold text-[#1A2B4B] text-xs sm:text-sm group-hover:text-[#D4AF37] transition-colors truncate">
                                          {product.name}
                                        </h4>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                          {product.sku && (
                                            <span className="font-mono text-[9px] text-slate-400 font-semibold uppercase">
                                              SKU: {product.sku}
                                            </span>
                                          )}
                                          {product.barcode && (
                                            <span className="font-mono text-[9px] text-slate-400 font-semibold uppercase">
                                              UPC: {product.barcode}
                                            </span>
                                          )}
                                          <Badge className={cn(
                                            "text-[8px] h-3.5 px-1.5 border-none font-bold",
                                            currentStock <= 0 
                                              ? "bg-rose-500/10 text-rose-600" 
                                              : currentStock <= 5 
                                                ? "bg-amber-500/10 text-amber-700" 
                                                : "bg-[#1A2B4B]/5 text-[#1A2B4B]"
                                          )}>
                                            {currentStock <= 0 ? 'Out of stock' : `${currentStock} in stock`}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Action & Price */}
                                    <div className="flex items-center gap-3 shrink-0 pl-2">
                                      <span className="font-black text-sm sm:text-base text-[#1A2B4B]">
                                        {settings.currency}{(product.price ?? 0).toFixed(2)}
                                      </span>
                                      <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-[#1A2B4B] group-hover:text-white group-hover:border-[#1A2B4B] transition-all shadow-sm">
                                        <Plus className="w-3.5 h-3.5" />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cart Area */}
      <Card className={cn(
        "w-full lg:w-[420px] flex flex-col shadow-2xl border-2 border-[#D4AF37]/50 ring-4 ring-[#D4AF37]/10 bg-white rounded-3xl overflow-hidden",
        activeTab !== 'cart' && "hidden lg:flex"
      )}>
        <CardHeader className="border-b border-[#D4AF37]/30 bg-gradient-to-r from-[#1A2B4B] via-[#2C3E50] to-[#1A2B4B] text-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#D4AF37] rounded-xl flex items-center justify-center shadow-md">
                <ShoppingCart className="w-5 h-5 text-[#1A2B4B]" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg font-heading text-white">Current Order</CardTitle>
                <CardDescription className="text-[10px] uppercase font-bold tracking-widest text-[#D4AF37]">Checkout Session</CardDescription>
              </div>
            </div>
            <Badge variant="secondary" className="bg-white/10 text-white border border-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm">
              {cart.reduce((sum, i) => sum + i.quantity, 0)} items
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-0 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <div className="w-16 h-16 bg-[#1A2B4B]/5 rounded-full flex items-center justify-center mb-4 animate-pulse">
                <ShoppingCart className="w-8 h-8 text-[#1A2B4B]/20" />
              </div>
              <p className="text-sm font-bold text-[#1A2B4B]">Your cart is empty</p>
              <p className="text-xs mt-1 max-w-[200px] mx-auto">Add products from the inventory to start building an order.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {cart.map((item) => (
                <div key={item.productId} className="px-3 py-2 sm:px-4 sm:py-2.5 hover:bg-[#FDFCF8] transition-colors group flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0 pr-1">
                    <h4 className="font-bold text-[#1A2B4B] truncate text-xs sm:text-sm leading-tight" title={item.name}>{item.name}</h4>
                    <p className="text-[10px] text-slate-400 font-medium truncate">{settings.currency}{(item.price ?? 0).toFixed(2)}/ea</p>
                  </div>
                  <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-md p-0.5 shrink-0">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5 sm:h-5.5 sm:w-5.5 hover:bg-white rounded text-slate-600 p-0"
                      onClick={() => updateQuantity(item.productId, -1)}
                    >
                      <Minus className="w-2.5 h-2.5" />
                    </Button>
                    <Input
                      type="number"
                      className="w-6 sm:w-7 h-5 sm:h-5.5 text-center font-bold text-[11px] sm:text-xs border-none bg-transparent focus-visible:ring-0 p-0 text-[#1A2B4B]"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val) && val >= 1) {
                          const diff = val - item.quantity;
                          updateQuantity(item.productId, diff);
                        }
                      }}
                    />
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5 sm:h-5.5 sm:w-5.5 hover:bg-white rounded text-slate-600 p-0"
                      onClick={() => updateQuantity(item.productId, 1)}
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                  <div className="text-right shrink-0 min-w-[50px] sm:min-w-[60px]">
                    <span className="font-black text-[#1A2B4B] text-xs sm:text-sm">{settings.currency}{(item.subtotal ?? 0).toFixed(2)}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 sm:h-7 sm:w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromCart(item.productId);
                    }}
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-2.5 border-t border-slate-200/80 p-3.5 sm:p-4 bg-[#FDFCF8]/95">
          <div className="w-full space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="relative flex-1 max-w-[170px] sm:max-w-[200px]">
                <Ticket className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#D4AF37]" />
                <Input 
                  placeholder="Promo Code" 
                  className="pl-6.5 pr-2 h-7 text-[11px] bg-white border-[#D4AF37]/30 uppercase focus-visible:ring-[#D4AF37] rounded-md"
                  value={promoCodeInput}
                  onChange={(e) => setPromoCodeInput(e.target.value)}
                />
              </div>
              <Button 
                variant="outline" 
                size="sm"
                className="h-7 px-2 text-[11px] font-bold border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37] hover:text-white rounded-md shrink-0"
                onClick={applyPromo}
              >
                Apply
              </Button>
            </div>
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>Subtotal</span>
              <span className="text-[#1A2B4B] font-semibold">{settings.currency}{(subtotal ?? 0).toFixed(2)}</span>
            </div>
            {appliedPromo && (
              <div className="flex justify-between text-xs font-bold text-emerald-600">
                <span className="flex items-center gap-1"><Ticket className="w-3 h-3" /> Promo: {appliedPromo.code}</span>
                <span>-{settings.currency}{(appliedPromo.amount ?? 0).toFixed(2)}</span>
              </div>
            )}
            {isRegisteredCustomer && hasAssignedLoyaltyCard && (settings.loyaltyEnabled ?? true) && loyaltyResult.discountAmount > 0 && (
              <div className="flex flex-col gap-1 p-2 bg-amber-50/90 border border-amber-200/80 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      id="apply-loyalty-sidebar-toggle"
                      className="w-3.5 h-3.5 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                      checked={applyLoyaltyDiscount}
                      onChange={(e) => setApplyLoyaltyDiscount(e.target.checked)}
                    />
                    <label htmlFor="apply-loyalty-sidebar-toggle" className="text-[11px] font-bold text-amber-900 cursor-pointer flex items-center gap-1">
                      <Gift className="w-3 h-3 text-amber-600" /> Apply Loyalty Discount
                    </label>
                  </div>
                  <span className="text-xs font-bold text-emerald-700">-{settings.currency}{loyaltyResult.discountAmount.toFixed(2)}</span>
                </div>
                {applyLoyaltyDiscount && loyaltyResult.breakdown.map((item, idx) => (
                  <p key={idx} className="text-[9px] text-amber-600 font-medium pl-5">• {item}</p>
                ))}
              </div>
            )}
            <div className="flex justify-between text-[11px] font-medium text-slate-400 italic">
              <span>VAT Portion (12% Incl.)</span>
              <span>{settings.currency}{(tax ?? 0).toFixed(2)}</span>
            </div>
            <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center">
              <div>
                <p className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-wider">Total Amount</p>
                <span className="text-xl font-black text-[#1A2B4B]">{settings.currency}{(total ?? 0).toFixed(2)}</span>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Items</p>
                <span className="text-sm font-bold text-[#1A2B4B]">{cart.reduce((sum, i) => sum + i.quantity, 0)}</span>
              </div>
            </div>
          </div>
          <Button 
            className="w-full h-11 text-sm font-bold bg-[#1A2B4B] hover:bg-[#2C3E50] text-white shadow-lg shadow-[#1A2B4B]/10 rounded-xl transition-all active:scale-[0.99]"
            disabled={cart.length === 0}
            onClick={() => {
              setAmountReceived('');
              setSaleType('in-store');
              setDeliveryFee('0');
              setIsCheckoutOpen(true);
            }}
          >
            Process Checkout
          </Button>
        </CardFooter>
      </Card>

      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="sm:max-w-[600px] md:min-h-[650px] max-h-[95vh] flex flex-col overflow-y-auto bg-white/95 backdrop-blur-md border-[#D4AF37]/20">
          <DialogHeader>
            <DialogTitle className="text-[#1A2B4B] font-heading text-2xl">Complete Sale</DialogTitle>
            <DialogDescription>Enter customer details and select payment method.</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
              {selectedLocationId === 'all' && (
              <div className="space-y-2">
                <Label htmlFor="checkout-loc" className="text-[#D4AF37] font-bold">Sale Location</Label>
                <Select required value={checkoutLocationId} onValueChange={setCheckoutLocationId}>
                  <SelectTrigger id="checkout-loc" className="border-[#D4AF37]/20 bg-[#FDFCF8]">
                    <SelectValue placeholder="Select Location">
                      {locations.find(l => l.id === checkoutLocationId)?.name || 'Select Location'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                      {locations.map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2 relative" ref={customerSearchRef}>
                <Label htmlFor="checkout-customer" className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Customer</span>
                  <span className="text-[10px] text-slate-400 font-normal">Type or scan loyalty card</span>
                </Label>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input
                    id="checkout-customer"
                    type="text"
                    className="pl-9 pr-16 bg-[#FDFCF8] border-slate-200 focus:border-amber-500 font-medium text-xs h-10 rounded-xl"
                    placeholder="Search name, phone, or scan card..."
                    value={customerSearchQuery}
                    onFocus={() => setIsCustomerSearchOpen(true)}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setIsCustomerSearchOpen(true);
                    }}
                    onKeyDown={handleCustomerInputKeyDown}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    {customerSearchQuery && (
                      <button
                        type="button"
                        onClick={() => handleCustomerSelect('walk-in')}
                        className="p-1 hover:bg-slate-200/60 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                        title="Reset to Walk-In Customer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsCustomerSearchOpen(!isCustomerSearchOpen)}
                      className="p-1 hover:bg-slate-200/60 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Autocomplete Suggestions Popover */}
                {isCustomerSearchOpen && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {/* Option 1: Walk-In Customer */}
                    <div
                      className={cn(
                        "p-2.5 hover:bg-amber-50/80 cursor-pointer transition-colors flex items-center justify-between",
                        selectedCustomerId === 'walk-in' && "bg-amber-50 font-bold"
                      )}
                      onClick={() => handleCustomerSelect('walk-in')}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs">
                          🚶
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">Walk-In Customer</p>
                          <p className="text-[10px] text-slate-400">Default guest checkout</p>
                        </div>
                      </div>
                      {selectedCustomerId === 'walk-in' && <Check className="w-4 h-4 text-amber-600" />}
                    </div>

                    {/* Option 2: Register New Customer */}
                    <div
                      className={cn(
                        "p-2.5 hover:bg-amber-50/80 cursor-pointer transition-colors flex items-center justify-between",
                        selectedCustomerId === 'new' && "bg-amber-50 font-bold"
                      )}
                      onClick={() => handleCustomerSelect('new')}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold">
                          <Plus className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-amber-900">+ Register New Customer</p>
                          <p className="text-[10px] text-amber-700">Add details & assign card on checkout</p>
                        </div>
                      </div>
                      {selectedCustomerId === 'new' && <Check className="w-4 h-4 text-amber-600" />}
                    </div>

                    {/* Section Header */}
                    {filteredCustomers.length > 0 && (
                      <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Registered Customers ({filteredCustomers.length})
                      </div>
                    )}

                    {/* Customer list */}
                    {filteredCustomers.map(c => {
                      const count = c.loyaltyItemCount ?? ((c.totalItemsPurchased ?? 0) % 10);
                      const cardNum = c.loyaltyCardNumber;
                      const isSelected = selectedCustomerId === c.id;

                      return (
                        <div
                          key={c.id}
                          className={cn(
                            "p-2.5 hover:bg-amber-50/80 cursor-pointer transition-colors flex items-center justify-between gap-2",
                            isSelected && "bg-amber-50/90 font-semibold"
                          )}
                          onClick={() => handleCustomerSelect(c.id)}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center font-bold text-xs shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="text-xs font-bold text-slate-800 truncate">{c.name}</span>
                                {cardNum && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-300 bg-amber-100/60 text-amber-900 font-mono shrink-0">
                                    💳 {cardNum}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 truncate">
                                {c.phone && <span>{c.phone}</span>}
                                {c.email && <span className="truncate">{c.email}</span>}
                                <span className="text-amber-800 font-medium ml-auto">({count}/10 items)</span>
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
                        </div>
                      );
                    })}

                    {filteredCustomers.length === 0 && customerSearchQuery.trim() !== '' && (
                      <div className="p-4 text-center text-xs text-slate-500 space-y-2">
                        <p>No registered customers found matching "{customerSearchQuery}"</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 border-amber-300 text-amber-800 hover:bg-amber-50"
                          onClick={() => {
                            handleCustomerSelect('new');
                            setCustomerDetails(prev => ({ ...prev, name: customerSearchQuery }));
                          }}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Register "{customerSearchQuery}" as New Customer
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedCustomerId !== 'walk-in' && selectedCustomerId !== 'new' && selectedCustomer && (
                <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <Gift className="w-4 h-4 text-amber-600" /> Customer Loyalty Status
                    </span>
                    <Badge variant="outline" className="border-amber-300 bg-amber-100/60 text-amber-800 text-[10px] font-bold">
                      {customerLoyaltyCount}/10 in Cycle
                    </Badge>
                  </div>

                  {!(settings.loyaltyEnabled ?? true) ? (
                    <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600 font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>Loyalty card discounts are currently disabled globally by Admin in Settings.</span>
                    </div>
                  ) : !hasAssignedLoyaltyCard ? (
                    <div className="p-2.5 bg-amber-100/70 border border-amber-300/80 rounded-xl space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-900">
                          <p className="font-bold">No Active Loyalty Card Assigned</p>
                          <p className="text-[11px] text-amber-800">
                            Loyalty discounts apply only to registered customers with an active assigned loyalty card.
                          </p>
                        </div>
                      </div>
                      <Button 
                        type="button"
                        size="sm"
                        className="w-full h-8 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm"
                        onClick={() => {
                          setAssignCardCustomer(selectedCustomer);
                          setQuickCardNumber('LC-' + Math.floor(100000 + Math.random() * 900000));
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Assign Loyalty Card to Customer
                      </Button>
                    </div>
                  ) : (
                    <>
                      {selectedCustomer.loyaltyCardNumber && (
                        <div className="flex items-center justify-between bg-amber-100/70 border border-amber-200 text-amber-900 px-2.5 py-1 rounded-xl text-xs font-mono font-bold">
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-3.5 h-3.5 text-amber-700" />
                            Card #: {selectedCustomer.loyaltyCardNumber}
                          </div>
                          <Badge className="bg-emerald-600 text-white text-[9px] h-4">Active</Badge>
                        </div>
                      )}
                      <div className="w-full bg-amber-200/50 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(customerLoyaltyCount / 10) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-amber-800 font-medium">
                        <span>Total Bought: <strong>{selectedCustomer.totalItemsPurchased ?? 0} items</strong></span>
                        <span>Next Reward: {5 - (customerLoyaltyCount % 5)} items away</span>
                      </div>

                      {/* Manual Checkbox for Loyalty Discount */}
                      {loyaltyResult.discountAmount > 0 ? (
                        <div className="mt-2 pt-2 border-t border-amber-200/80 space-y-1">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="apply-loyalty-discount-checkout"
                              className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                              checked={applyLoyaltyDiscount}
                              onChange={(e) => setApplyLoyaltyDiscount(e.target.checked)}
                            />
                            <label htmlFor="apply-loyalty-discount-checkout" className="text-xs font-bold text-amber-950 cursor-pointer flex-1 flex justify-between items-center">
                              <span>Apply Loyalty Card Discount</span>
                              <span className="text-emerald-700 font-black">-{settings.currency}{loyaltyResult.discountAmount.toFixed(2)}</span>
                            </label>
                          </div>
                          <p className="text-[10px] text-amber-700 italic pl-6">
                            {applyLoyaltyDiscount ? '✅ Loyalty discount will be deducted.' : '☐ Loyalty card discount is optional. Toggle on to redeem for this purchase.'}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-amber-700 italic">No loyalty discount milestone reached for current cart count.</p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="cust-name">Customer Name</Label>
                <Input 
                  id="cust-name"
                  className="bg-[#FDFCF8]"
                  value={customerDetails.name}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, name: e.target.value })}
                  placeholder="Full Name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Order Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={saleType === 'in-store' ? 'default' : 'outline'}
                    className={cn(
                      "h-10 text-xs font-bold rounded-xl transition-all",
                      saleType === 'in-store'
                        ? "bg-[#1A2B4B] text-white hover:bg-[#1A2B4B]/90 shadow-sm"
                        : "bg-[#FDFCF8] text-slate-600 hover:bg-slate-50 border-slate-200"
                    )}
                    onClick={() => {
                      setSaleType('in-store');
                      setDeliveryFee('0');
                    }}
                  >
                    🏪 In-Store
                  </Button>
                  <Button
                    type="button"
                    variant={saleType === 'online' ? 'default' : 'outline'}
                    className={cn(
                      "h-10 text-xs font-bold rounded-xl transition-all",
                      saleType === 'online'
                        ? "bg-[#1A2B4B] text-white hover:bg-[#1A2B4B]/90 shadow-sm"
                        : "bg-[#FDFCF8] text-slate-600 hover:bg-slate-50 border-slate-200"
                    )}
                    onClick={() => {
                      setSaleType('online');
                      setDeliveryFee('50');
                    }}
                  >
                    🌐 Online
                  </Button>
                </div>
              </div>

              {saleType === 'online' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Label htmlFor="delivery-fee">Delivery Fee ({settings.currency})</Label>
                  <Input 
                    id="delivery-fee"
                    type="number"
                    className="bg-[#FDFCF8]"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    placeholder="Enter delivery fee"
                    min="0"
                    step="any"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Billing Address</Label>
                  <Input 
                    className="bg-[#FDFCF8]"
                    value={customerDetails.billingAddress}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, billingAddress: e.target.value })}
                    placeholder="Billing"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Shipping Address</Label>
                  <Input 
                    className="bg-[#FDFCF8]"
                    value={customerDetails.shippingAddress}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, shippingAddress: e.target.value })}
                    placeholder="Shipping"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Municipality</Label>
                  <Input 
                    className="bg-[#FDFCF8]"
                    value={customerDetails.municipality}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, municipality: e.target.value })}
                    placeholder="Municipality"
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input 
                    className="bg-[#FDFCF8]"
                    value={customerDetails.city}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, city: e.target.value })}
                    placeholder="City"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input 
                    className="bg-[#FDFCF8]"
                    value={customerDetails.country}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, country: e.target.value })}
                    placeholder="Country"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Zip Code</Label>
                  <Input 
                    className="bg-[#FDFCF8]"
                    value={customerDetails.zip}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, zip: e.target.value })}
                    placeholder="Zip"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Full Payment</span>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] font-bold uppercase transition-colors" style={{ color: isSplitPayment ? '#94a3b8' : '#1A2B4B' }}>Single</Label>
                    <button 
                      className={cn(
                        "w-10 h-5 rounded-full p-1 transition-colors relative",
                        isSplitPayment ? "bg-indigo-600" : "bg-slate-300"
                      )}
                      onClick={() => {
                        setIsSplitPayment(!isSplitPayment);
                        if (!isSplitPayment) {
                          setPaymentSplits([
                            { methodId: 'cash', methodName: 'Cash', amount: total },
                          ]);
                        }
                      }}
                    >
                      <div className={cn(
                        "w-3 h-3 bg-white rounded-full transition-transform",
                        isSplitPayment ? "translate-x-5" : "translate-x-0"
                      )} />
                    </button>
                    <Label className="text-[10px] font-bold uppercase transition-colors" style={{ color: isSplitPayment ? '#1A2B4B' : '#94a3b8' }}>Split</Label>
                  </div>
                </div>

                {!isSplitPayment ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      <Button 
                        type="button"
                        variant={activeCategory === 'cash' ? 'default' : 'outline'}
                        className={cn("h-14 flex-col gap-1 px-1", activeCategory === 'cash' ? "bg-[#1A2B4B] text-white" : "bg-[#FDFCF8] border-slate-200")}
                        onClick={() => {
                          setActiveCategory('cash');
                          setPaymentMethod('cash');
                        }}
                      >
                        <Banknote className="w-5 h-5" />
                        <span className="text-[10px] font-bold">CASH</span>
                      </Button>
                      <Button 
                        type="button"
                        variant={activeCategory === 'ewallet' ? 'default' : 'outline'}
                        className={cn("h-14 flex-col gap-1 px-1", activeCategory === 'ewallet' ? "bg-[#1A2B4B] text-white" : "bg-[#FDFCF8] border-slate-200")}
                        onClick={() => {
                          setActiveCategory('ewallet');
                          const ewalletOpts = paymentOptions.filter(o => o.type === 'ewallet' && o.active);
                          if (ewalletOpts.length > 0) {
                            setPaymentMethod(ewalletOpts[0].id);
                          } else {
                            setPaymentMethod('ewallet');
                          }
                        }}
                      >
                        <Wallet className="w-5 h-5" />
                        <span className="text-[10px] font-bold">EWALLET</span>
                      </Button>
                      <Button 
                        type="button"
                        variant={activeCategory === 'bank' ? 'default' : 'outline'}
                        className={cn("h-14 flex-col gap-1 px-1", activeCategory === 'bank' ? "bg-[#1A2B4B] text-white" : "bg-[#FDFCF8] border-slate-200")}
                        onClick={() => {
                          setActiveCategory('bank');
                          const bankOpts = paymentOptions.filter(o => o.type === 'bank' && o.active);
                          if (bankOpts.length > 0) {
                            setPaymentMethod(bankOpts[0].id);
                          } else {
                            setPaymentMethod('bank');
                          }
                        }}
                      >
                        <Building className="w-5 h-5" />
                        <span className="text-[10px] font-bold">BANK</span>
                      </Button>
                    </div>

                    {/* Sub-options as "radio buttons" (selectable badges/items) */}
                    {activeCategory !== 'cash' && (
                      <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100 space-y-3">
                        <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Select Option</Label>
                        <div className="flex flex-wrap gap-2">
                          {paymentOptions.filter(o => o.type === activeCategory && o.active).length > 0 ? (
                            paymentOptions.filter(o => o.type === activeCategory && o.active).map(opt => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setPaymentMethod(opt.id)}
                                className={cn(
                                  "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border flex items-center gap-1.5",
                                  paymentMethod === opt.id 
                                    ? "bg-[#1A2B4B] text-white border-[#1A2B4B] shadow-md" 
                                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                )}
                              >
                                {activeCategory === 'ewallet' ? <Wallet className="w-2.5 h-2.5" /> : <Building className="w-2.5 h-2.5" />}
                                {opt.name}
                              </button>
                            ))
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPaymentMethod(activeCategory)}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border flex items-center gap-1.5",
                                paymentMethod === activeCategory 
                                  ? "bg-[#1A2B4B] text-white border-[#1A2B4B] shadow-md" 
                                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                              )}
                            >
                              {activeCategory === 'ewallet' ? <Wallet className="w-2.5 h-2.5" /> : <Building className="w-2.5 h-2.5" />}
                              Default {activeCategory === 'ewallet' ? 'E-Wallet' : 'Bank Transfer'}
                            </button>
                          )}
                        </div>
                        
                        {/* Reference input for non-cash payments */}
                        <div className="space-y-1.5 pt-1">
                          <Label htmlFor="checkout-ref" className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Reference Info</Label>
                          <Input 
                            id="checkout-ref"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            placeholder="Ref # / Trans details"
                            className="h-8 text-xs bg-white border-slate-200"
                            required
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paymentSplits.map((split, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4 space-y-1">
                          <Label className="text-[10px]">Method</Label>
                          <Select 
                            value={split.methodId} 
                            onValueChange={(v) => {
                              const opt = paymentOptions.find(o => o.id === v);
                              const newSplits = [...paymentSplits];
                              newSplits[index].methodId = v;
                              newSplits[index].methodName = v === 'cash' ? 'Cash' : v === 'card' ? 'Card' : opt?.name || v;
                              setPaymentSplits(newSplits);
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Method">
                                {split.methodId === 'cash' ? 'Cash' : 
                                 split.methodId === 'card' ? 'Card' : 
                                 (paymentOptions.find(o => o.id === split.methodId)?.name || split.methodId)}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="card">Card</SelectItem>
                              {paymentOptions.filter(o => o.active !== false).map(o => (
                                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3 space-y-1">
                          <Label className="text-[10px]">Amount</Label>
                          <Input 
                            type="number" 
                            className="h-9 text-xs" 
                            value={split.amount}
                            onChange={(e) => {
                              const newSplits = [...paymentSplits];
                              newSplits[index].amount = Number(e.target.value);
                              setPaymentSplits(newSplits);
                            }}
                          />
                        </div>
                        <div className="col-span-4 space-y-1">
                          <Label className="text-[10px]">Reference</Label>
                          <Input 
                            className="h-9 text-xs" 
                            placeholder="Ref #" 
                            value={split.reference || ''}
                            onChange={(e) => {
                              const newSplits = [...paymentSplits];
                              newSplits[index].reference = e.target.value;
                              setPaymentSplits(newSplits);
                            }}
                          />
                        </div>
                        <div className="col-span-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-rose-500"
                            onClick={() => setPaymentSplits(prev => prev.filter((_, i) => i !== index))}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      className="w-full h-8 text-xs gap-1 border-dashed"
                      onClick={() => setPaymentSplits([...paymentSplits, { methodId: 'cash', methodName: 'Cash', amount: 0 }])}
                    >
                      <Plus className="w-3 h-3" /> Add Split Method
                    </Button>
                    <div className={cn(
                      "text-[10px] text-right font-bold",
                      Math.abs(paymentSplits.reduce((s, i) => s + i.amount, 0) - activeTotal) < 0.01 ? "text-emerald-600" : "text-rose-500"
                    )}>
                      Total Covered: {settings.currency}{(paymentSplits.reduce((s, i) => s + (i.amount ?? 0), 0)).toFixed(2)} / {settings.currency}{(activeTotal ?? 0).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#FDFCF8] p-4 rounded-xl border border-[#D4AF37]/10 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Items:</span>
              <span className="font-medium text-[#1A2B4B]">{cart.reduce((sum, i) => sum + i.quantity, 0)}</span>
            </div>

            {saleType === 'online' && (
              <div className="flex justify-between text-sm animate-in fade-in duration-150">
                <span className="text-slate-500">Delivery Fee:</span>
                <span className="font-medium text-[#1A2B4B]">{settings.currency}{parseFloat(deliveryFee || '0').toFixed(2)}</span>
              </div>
            )}
            
            {/* Cash / Change Calculator */}
            <div className="pt-2.5 border-t border-dashed border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="amount-received" className="text-xs font-bold text-slate-600">Amount Received</Label>
                <div className="relative w-36">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{settings.currency}</span>
                  <Input
                    id="amount-received"
                    type="number"
                    step="any"
                    className="h-8 pl-7 pr-2 text-right font-black text-xs bg-white border-slate-200 focus-visible:ring-[#1A2B4B] rounded-lg"
                    placeholder={total.toFixed(2)}
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                  />
                </div>
              </div>

              {/* Quick cash bill triggers */}
              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAmountReceived('')}
                  className="px-2 py-1 text-[9px] font-bold uppercase rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  Exact
                </button>
                {[50, 100, 200, 500, 1000].map((bill) => (
                  <button
                    key={bill}
                    type="button"
                    onClick={() => {
                      const currentAmount = parseFloat(amountReceived) || 0;
                      setAmountReceived((currentAmount + bill).toString());
                    }}
                    className="px-2 py-1 text-[9px] font-mono font-bold rounded bg-indigo-50 hover:bg-indigo-100 text-[#1A2B4B] border border-indigo-100/30 transition-colors"
                  >
                    +{bill}
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center text-xs font-bold bg-slate-50 p-2 rounded-lg border border-slate-100">
                <span className="text-slate-500">Calculated Change:</span>
                <span className={cn(
                  "font-black text-sm font-sans",
                  changeAmount > 0 ? "text-emerald-600" : "text-slate-600"
                )}>
                  {settings.currency}{changeAmount.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-lg font-bold">
              <span className="text-[#1A2B4B]">Total Amount:</span>
              <div className="relative w-36">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">{settings.currency}</span>
                <Input
                  type="number"
                  step="any"
                  className="h-9 pl-7 pr-2 text-right font-black text-sm bg-white border-slate-200 focus-visible:ring-[#1A2B4B] rounded-lg"
                  value={editedTotal}
                  onChange={(e) => setEditedTotal(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-auto border-t pt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setIsCheckoutOpen(false)}>Cancel</Button>
            <Button 
              variant="outline"
              className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37] hover:text-white rounded-xl"
              onClick={() => handleCheckout(true)}
              disabled={processing}
            >
              Mark as Pending
            </Button>
            <Button 
              className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl px-8" 
              onClick={() => handleCheckout(false)}
              disabled={processing}
            >
              {processing ? 'Processing...' : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promo Code Approval Dialog */}
      <Dialog open={isPromoApprovalOpen} onOpenChange={(open) => {
        if (!open) {
          setIsPromoApprovalOpen(false);
          setApproverPasscode('');
        }
      }}>
        <DialogContent className="sm:max-w-[450px] bg-white/95 backdrop-blur-md border-[#D4AF37]/20 p-6 rounded-3xl shadow-2xl">
          <DialogHeader className="items-center text-center space-y-3 pb-2">
            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-800 tracking-tight">Manager Approval Required</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 leading-relaxed max-w-sm">
              An active promo code <span className="font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">"{appliedPromo?.code}"</span> has been applied to this checkout, offering a discount of <span className="font-bold text-emerald-600">{settings.currency}{(appliedPromo?.amount ?? 0).toFixed(2)}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label className="text-xs font-black text-slate-700 uppercase tracking-wider">Select Approver</Label>
              <Select 
                value={selectedApproverId} 
                onValueChange={setSelectedApproverId}
              >
                <SelectTrigger className="bg-slate-50 border-slate-200 rounded-xl h-11 text-xs">
                  <SelectValue placeholder="Select Administrator or Manager" />
                </SelectTrigger>
                <SelectContent>
                  {(profile?.role === 'admin' || profile?.role === 'manager') && (
                    <SelectItem value="current">🔑 Approve as Current Session ({profile.name})</SelectItem>
                  )}
                  {allUsers
                    .filter(u => u.role === 'admin' || u.role === 'manager')
                    .map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        👤 {u.name} ({u.role?.toUpperCase()})
                      </SelectItem>
                    ))}
                  {allUsers.filter(u => u.role === 'admin' || u.role === 'manager').length === 0 && (
                    <SelectItem value="system">👤 System Administrator (Default)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-xs font-black text-slate-700 uppercase tracking-wider">Authorization PIN</Label>
                <span className="text-[10px] text-amber-500 font-medium">Master/Default PIN: 1234</span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="password"
                  value={approverPasscode}
                  onChange={(e) => setApproverPasscode(e.target.value)}
                  placeholder="••••"
                  maxLength={6}
                  className="bg-slate-50 border-slate-200 rounded-xl pl-10 h-11 text-center font-bold tracking-widest text-lg"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePromoApprove();
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-3 pt-3 border-t">
            <Button 
              variant="outline" 
              className="rounded-xl border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-700"
              onClick={() => {
                setIsPromoApprovalOpen(false);
                setApproverPasscode('');
              }}
            >
              Cancel
            </Button>
            <Button 
              className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl font-bold text-xs uppercase tracking-wider gap-2 h-10"
              onClick={handlePromoApprove}
            >
              <KeyRound className="w-4 h-4" />
              Authorize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={isSuccessOpen} onOpenChange={setIsSuccessOpen}>
        <DialogContent className="sm:max-w-[400px] md:min-h-[400px] max-h-[95vh] overflow-y-auto flex flex-col justify-center text-center bg-white/95 backdrop-blur-md border-[#D4AF37]/20">
          <div className="py-8 flex flex-col items-center">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 10 }}
              className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6"
            >
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            </motion.div>
            <h2 className="text-2xl font-bold text-[#1A2B4B] mb-2 font-heading">Sale Successful!</h2>
            <p className="text-slate-500 mb-8 text-sm">Transaction ID: {lastSaleId}</p>
            
            <div className="grid grid-cols-2 gap-3 w-full">
              <Button variant="outline" className="gap-2 rounded-xl" onClick={() => setIsSuccessOpen(false)}>
                <Plus className="w-4 h-4" />
                New Sale
              </Button>
              <Button className="gap-2 bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl">
                <Printer className="w-4 h-4" />
                Print Receipt
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(scanned) => {
          const matched = products.find(p => 
            p.barcode?.toLowerCase() === scanned.toLowerCase() ||
            p.sku?.toLowerCase() === scanned.toLowerCase()
          );
          if (matched) {
            addToCart(matched, addQtyMulti);
            toast.success(`Scanned: ${matched.name} added to cart`);
            return;
          }

          const loyaltyMatch = findCustomerByLoyaltyCode(scanned);
          if (loyaltyMatch.customer) {
            handleCustomerSelect(loyaltyMatch.customer.id);
            toast.success(`💳 Loyalty Card Scanned: Selected customer ${loyaltyMatch.customer.name}`);
            return;
          } else if (loyaltyMatch.isLoyaltyCode) {
            toast.error('Loyalty cards apply only to registered customers in the app.');
            return;
          }

          toast.error(`No product or registered customer loyalty card found with barcode "${scanned}"`);
        }}
      />

      {/* Quick Assign Loyalty Card Dialog */}
      <Dialog open={!!assignCardCustomer} onOpenChange={(open) => { if (!open) setAssignCardCustomer(null); }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-amber-900 flex items-center gap-2 font-heading">
              <CreditCard className="w-5 h-5 text-amber-600" /> Assign Loyalty Card
            </DialogTitle>
            <DialogDescription>
              Assign a new active loyalty card to <strong>{assignCardCustomer?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickAssignLoyaltyCard} className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="font-bold">Card Number</Label>
                <button
                  type="button"
                  onClick={() => {
                    const num = 'LC-' + Math.floor(100000 + Math.random() * 900000);
                    setQuickCardNumber(num);
                    if (!quickCardQr) setQuickCardQr(num);
                  }}
                  className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Auto-Generate
                </button>
              </div>
              <Input 
                required
                value={quickCardNumber}
                onChange={(e) => {
                  setQuickCardNumber(e.target.value);
                  if (!quickCardQr) setQuickCardQr(e.target.value);
                }}
                placeholder="Scan barcode or enter e.g. LC-123456"
                className="font-mono font-bold"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-bold">QR Code Payload / Secondary Barcode (Optional)</Label>
              <Input 
                value={quickCardQr}
                onChange={(e) => setQuickCardQr(e.target.value)}
                placeholder="e.g. QR-123456 (Defaults to card number)"
                className="font-mono text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAssignCardCustomer(null)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                <Plus className="w-4 h-4 mr-1" /> Issue & Assign Card
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Consumed / Expired Card Notice Dialog */}
      <Dialog open={!!expiredCardNotice} onOpenChange={(open) => { if (!open) setExpiredCardNotice(null); }}>
        <DialogContent className="sm:max-w-[480px] bg-gradient-to-b from-amber-50 to-white border-amber-200">
          <DialogHeader>
            <DialogTitle className="text-amber-900 flex items-center gap-2 font-heading text-xl">
              <AlertTriangle className="w-6 h-6 text-amber-600" /> Loyalty Card Consumed & Expired!
            </DialogTitle>
            <DialogDescription className="text-slate-700 text-sm">
              Loyalty card <strong>#{expiredCardNotice?.cardNumber}</strong> for customer <strong>{expiredCardNotice?.customerName}</strong> has been consumed during this purchase and marked as <strong>Expired</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-amber-100/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
            <p className="font-bold">⚠️ Assign a new card to continue rewards!</p>
            <p>Please assign a new active loyalty card to <strong>{expiredCardNotice?.customerName}</strong> so they do not miss out on future rewards.</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="outline" onClick={() => setExpiredCardNotice(null)}>
              Dismiss
            </Button>
            <Button 
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              onClick={() => {
                const cust = customers.find(c => c.id === expiredCardNotice?.customerId);
                const custObj = cust || ({ id: expiredCardNotice?.customerId || '', name: expiredCardNotice?.customerName || 'Customer' } as Customer);
                setAssignCardCustomer(custObj);
                setQuickCardNumber('LC-' + Math.floor(100000 + Math.random() * 900000));
                setExpiredCardNotice(null);
              }}
            >
              <CreditCard className="w-4 h-4 mr-1.5" /> Assign New Loyalty Card Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style dangerouslySetInnerHTML={{ __html: `

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}} />
    </motion.div>
  );
};

export default POS;
