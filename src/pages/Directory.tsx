import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Building2,
  Tags,
  Edit2,
  Users,
  MapPin,
  Search,
  BookOpen,
  TrendingUp,
  LayoutGrid,
  CreditCard,
  Gift,
  QrCode,
  Sparkles,
  Barcode,
  CheckCircle2,
  Ticket,
  RefreshCw
} from 'lucide-react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Category, Brand, Supplier, Location, Customer, LoyaltyCard, PromoCode } from '@/types';
import { useSettings } from '@/contexts/SettingsContext';
import { migrateCustomerLoyaltyCounts } from '@/lib/loyalty-migrations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { useAuth } from '@/contexts/AuthContext';
import { logAction } from '@/lib/audit';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Badge } from '@/components/ui/badge';
import { DataTablePagination } from '@/components/DataTablePagination';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
export const Directory: React.FC = () => {
  const { profile, user, isAdmin, isManager } = useAuth();
  const isStaff = !isAdmin && !isManager;
  const { settings, updateLoyaltySettings } = useSettings();
  const [activeTab, setActiveTab] = useState<string>(() => (isAdmin || isManager) ? 'categories' : 'customers');

  useEffect(() => {
    if (isStaff && activeTab !== 'customers' && activeTab !== 'loyaltyCards') {
      setActiveTab('customers');
    }
  }, [isStaff, activeTab]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loyaltyCards, setLoyaltyCards] = useState<LoyaltyCard[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [customerPage, setCustomerPage] = useState(1);
  const [customerPageSize, setCustomerPageSize] = useState(20);
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierPageSize, setSupplierPageSize] = useState(20);

  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true);
  const [loyaltyTier1, setLoyaltyTier1] = useState(50);
  const [loyaltyTier2, setLoyaltyTier2] = useState(100);
  const [isMigratingLoyalty, setIsMigratingLoyalty] = useState(false);
  const [migrationSummary, setMigrationSummary] = useState<any | null>(null);

  useEffect(() => {
    if (settings) {
      setLoyaltyEnabled(settings.loyaltyEnabled ?? true);
      setLoyaltyTier1(settings.loyaltyTier1Discount ?? 50);
      setLoyaltyTier2(settings.loyaltyTier2Discount ?? 100);
    }
  }, [settings]);

  const handleSaveLoyalty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Only administrators can update loyalty settings');
      return;
    }
    try {
      await updateLoyaltySettings(loyaltyEnabled, Number(loyaltyTier1), Number(loyaltyTier2));
      toast.success('Loyalty discount settings updated successfully!');
      await logAction(profile, 'UPDATE_SETTINGS', `Updated loyalty rules: Tier1=${settings.currency}${loyaltyTier1}, Tier2=${settings.currency}${loyaltyTier2}`, 'settings/global', 'setting');
    } catch (error) {
      toast.error('Failed to update loyalty settings');
    }
  };

  const handleRunLoyaltyMigration = async () => {
    if (!isAdmin) {
      toast.error('Only administrators can run database migrations');
      return;
    }
    setIsMigratingLoyalty(true);
    try {
      const result = await migrateCustomerLoyaltyCounts();
      setMigrationSummary(result);
      toast.success(`Migration completed successfully! ${result.updatedCustomersCount} customer records updated.`);
      await logAction(profile, 'DATABASE_MIGRATION', `Migrated customer loyalty counts across ${result.totalCustomers} customers (${result.totalItemsMigrated} total items).`, 'customers', 'customer');
    } catch (error) {
      console.error('Migration error:', error);
      toast.error('Failed to run customer loyalty migration');
    } finally {
      setIsMigratingLoyalty(false);
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    collectionName: string;
    id: string;
    name: string;
  }>({ open: false, collectionName: '', id: '', name: '' });

  const promptDelete = (collectionName: string, id: string, name?: string) => {
    setDeleteConfirm({
      open: true,
      collectionName,
      id,
      name: name || 'this item'
    });
  };
  
  const [newCategory, setNewCategory] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newSupplier, setNewSupplier] = useState({ name: '', contact: '', email: '', address: '' });
  const [newLocation, setNewLocation] = useState({ 
    name: '', 
    addressLine1: '', 
    addressLine2: '', 
    municipality: '', 
    city: 'Pampanga', 
    country: 'Philippines' 
  });
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    billingAddress: '',
    shippingAddress: '',
    municipality: '',
    city: '',
    country: 'Philippines',
    zip: '',
    email: '',
    phone: '',
    loyaltyCardNumber: '',
    loyaltyCardQr: ''
  });
  const [newLoyaltyCard, setNewLoyaltyCard] = useState({
    cardNumber: '',
    qrCode: '',
    customerId: '',
    notes: '',
    status: 'active' as 'active' | 'inactive'
  });
  const [newPromo, setNewPromo] = useState({
    code: '',
    amount: 0,
    isPermanent: true,
    startDate: '',
    endDate: '',
    isActive: true
  });

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingLoyaltyCard, setEditingLoyaltyCard] = useState<LoyaltyCard | null>(null);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const generateCardNumber = () => {
    return `LC-${Math.floor(100000 + Math.random() * 900000)}`;
  };

  useEffect(() => {
    if (!profile) return;

    let unsubscribeCats = () => {};
    let unsubscribeBrands = () => {};
    let unsubscribeSups = () => {};
    let unsubscribeLocs = () => {};
    let unsubscribePromos = () => {};

    if (isAdmin || isManager) {
      unsubscribeCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
        setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
      }, (error) => {
        console.warn("Directory: Error listening to categories:", error);
      });

      unsubscribeBrands = onSnapshot(collection(db, 'brands'), (snapshot) => {
        setBrands(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Brand)));
      }, (error) => {
        console.warn("Directory: Error listening to brands:", error);
      });

      unsubscribeSups = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
        setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
      }, (error) => {
        console.warn("Directory: Error listening to suppliers:", error);
      });

      unsubscribeLocs = onSnapshot(collection(db, 'locations'), (snapshot) => {
        setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
      }, (error) => {
        console.warn("Directory: Error listening to locations:", error);
      });

      unsubscribePromos = onSnapshot(collection(db, 'promos'), (snapshot) => {
        setPromos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PromoCode)));
      }, (error) => {
        console.warn("Directory: Error listening to promos:", error);
      });
    }

    const unsubscribeCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (error) => {
      console.warn("Directory: Error listening to customers:", error);
    });

    const unsubscribeCards = onSnapshot(collection(db, 'loyaltyCards'), (snapshot) => {
      setLoyaltyCards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoyaltyCard)));
    }, (error) => {
      console.warn("Directory: Error listening to loyaltyCards:", error);
    });

    return () => {
      unsubscribeCats();
      unsubscribeBrands();
      unsubscribeSups();
      unsubscribeLocs();
      unsubscribeCustomers();
      unsubscribeCards();
      unsubscribePromos();
    };
  }, [profile?.id, isAdmin, isManager]);

  const handleAddPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromo.code.trim()) return;

    if (newPromo.amount < 0) {
      toast.error('Promo value/discount percentage cannot be negative');
      return;
    }

    if (promos.some(p => p.code.toLowerCase() === newPromo.code.trim().toLowerCase())) {
      toast.error('Promo with this code already exists');
      return;
    }

    try {
      const data: any = {
        code: newPromo.code.trim().toUpperCase(),
        amount: newPromo.amount,
        isPermanent: newPromo.isPermanent,
        isActive: newPromo.isActive,
        createdAt: Timestamp.now()
      };

      if (!newPromo.isPermanent) {
        if (newPromo.startDate) data.startDate = Timestamp.fromDate(new Date(newPromo.startDate));
        if (newPromo.endDate) data.endDate = Timestamp.fromDate(new Date(newPromo.endDate));
      }

      const docRef = await addDoc(collection(db, 'promos'), data);
      await logAction(profile, 'CREATE_PROMO', `Created promo: ${newPromo.code}`, docRef.id, 'promo');
      setNewPromo({ code: '', amount: 0, isPermanent: true, startDate: '', endDate: '', isActive: true });
      toast.success('Promo code created successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'promos');
    }
  };

  const handleUpdatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPromo) return;
    if (editingPromo.amount < 0) {
      toast.error('Promo value/discount percentage cannot be negative');
      return;
    }

    try {
      const { id, ...data } = editingPromo;
      await updateDoc(doc(db, 'promos', id), data);
      await logAction(profile, 'UPDATE_PROMO', `Updated promo: ${data.code}`, id, 'promo');
      setEditingPromo(null);
      toast.success('Promo code updated successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'promos');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    
    if (categories.some(c => c.name.toLowerCase() === newCategory.trim().toLowerCase())) {
      toast.error('Category with this name already exists');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'categories'), { name: newCategory });
      await logAction(profile, 'CREATE_CATEGORY', `Created category: ${newCategory}`, docRef.id, 'category');
      setNewCategory('');
      toast.success('Category added');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
    }
  };

  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrand.trim()) return;
    
    if (brands.some(b => b.name.toLowerCase() === newBrand.trim().toLowerCase())) {
      toast.error('Brand with this name already exists');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'brands'), { name: newBrand });
      await logAction(profile, 'CREATE_BRAND', `Created brand: ${newBrand}`, docRef.id, 'brand');
      setNewBrand('');
      toast.success('Brand added');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'brands');
    }
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.name.trim()) return;

    if (suppliers.some(s => s.name.toLowerCase() === newSupplier.name.trim().toLowerCase())) {
      toast.error('Supplier with this name already exists');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'suppliers'), newSupplier);
      await logAction(profile, 'CREATE_SUPPLIER', `Created supplier: ${newSupplier.name}`, docRef.id, 'supplier');
      setNewSupplier({ name: '', contact: '', email: '', address: '' });
      toast.success('Supplier added');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'suppliers');
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocation.name.trim()) return;

    if (locations.some(l => l.name.toLowerCase() === newLocation.name.trim().toLowerCase())) {
      toast.error('Location with this name already exists');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'locations'), newLocation);
      await logAction(profile, 'CREATE_LOCATION', `Created location: ${newLocation.name}`, docRef.id, 'location');
      setNewLocation({ 
        name: '', 
        addressLine1: '', 
        addressLine2: '', 
        municipality: '', 
        city: 'Pampanga', 
        country: 'Philippines' 
      });
      toast.success('Location added');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'locations');
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name.trim()) return;

    if (customers.some(c => c.name.toLowerCase() === newCustomer.name.trim().toLowerCase())) {
      toast.error('Customer with this name already exists');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...newCustomer,
        createdAt: new Date()
      });
      await logAction(profile, 'CREATE_CUSTOMER', `Created customer: ${newCustomer.name}`, docRef.id, 'customer');

      // If customer was created with a loyalty card number, auto-create loyalty card doc
      if (newCustomer.loyaltyCardNumber.trim()) {
        await addDoc(collection(db, 'loyaltyCards'), {
          cardNumber: newCustomer.loyaltyCardNumber.trim(),
          qrCode: newCustomer.loyaltyCardQr.trim() || newCustomer.loyaltyCardNumber.trim(),
          customerId: docRef.id,
          customerName: newCustomer.name,
          issuedAt: new Date().toISOString(),
          status: 'active'
        });
      }

      setNewCustomer({
        name: '',
        billingAddress: '',
        shippingAddress: '',
        municipality: '',
        city: '',
        country: 'Philippines',
        zip: '',
        email: '',
        phone: '',
        loyaltyCardNumber: '',
        loyaltyCardQr: ''
      });
      toast.success('Customer added successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'customers');
    }
  };

  const handleAddLoyaltyCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoyaltyCard.customerId || newLoyaltyCard.customerId === 'none') {
      toast.error('Loyalty card must be assigned to a registered customer.');
      return;
    }

    const cardNumber = newLoyaltyCard.cardNumber.trim() || generateCardNumber();

    if (loyaltyCards.some(c => c.cardNumber.toLowerCase() === cardNumber.toLowerCase())) {
      toast.error('A loyalty card with this card number already exists');
      return;
    }

    try {
      const assignedCust = customers.find(c => c.id === newLoyaltyCard.customerId);
      if (!assignedCust) {
        toast.error('Selected registered customer not found');
        return;
      }

      const cardRef = await addDoc(collection(db, 'loyaltyCards'), {
        cardNumber,
        qrCode: newLoyaltyCard.qrCode.trim() || cardNumber,
        customerId: assignedCust.id,
        customerName: assignedCust.name,
        issuedAt: new Date().toISOString(),
        status: newLoyaltyCard.status,
        notes: newLoyaltyCard.notes.trim()
      });

      // Update customer with this card number if linked
      await updateDoc(doc(db, 'customers', assignedCust.id), {
        loyaltyCardNumber: cardNumber,
        loyaltyCardQr: newLoyaltyCard.qrCode.trim() || cardNumber
      });

      await logAction(profile, 'CREATE_LOYALTY_CARD', `Issued loyalty card: ${cardNumber} to ${assignedCust.name}`, cardRef.id, 'loyaltyCard');
      setNewLoyaltyCard({
        cardNumber: '',
        qrCode: '',
        customerId: '',
        notes: '',
        status: 'active'
      });
      toast.success(`Loyalty card issued to ${assignedCust.name}!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'loyaltyCards');
    }
  };

  const handleUpdateLoyaltyCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoyaltyCard || !editingLoyaltyCard.cardNumber.trim()) return;
    if (!editingLoyaltyCard.customerId || editingLoyaltyCard.customerId === 'none') {
      toast.error('Loyalty card must be assigned to a registered customer.');
      return;
    }
    try {
      const { id, ...data } = editingLoyaltyCard;
      const assignedCust = customers.find(c => c.id === data.customerId);
      if (!assignedCust) {
        toast.error('Assigned customer not found');
        return;
      }

      const updateData = {
        ...data,
        customerId: assignedCust.id,
        customerName: assignedCust.name
      };

      await updateDoc(doc(db, 'loyaltyCards', id), updateData);

      await updateDoc(doc(db, 'customers', assignedCust.id), {
        loyaltyCardNumber: data.cardNumber,
        loyaltyCardQr: data.qrCode || data.cardNumber
      });

      await logAction(profile, 'UPDATE_LOYALTY_CARD', `Updated loyalty card: ${data.cardNumber}`, id, 'loyaltyCard');
      setEditingLoyaltyCard(null);
      toast.success('Loyalty card updated!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'loyaltyCards');
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editingCategory.name.trim()) return;
    try {
      await updateDoc(doc(db, 'categories', editingCategory.id), { name: editingCategory.name });
      await logAction(profile, 'UPDATE_CATEGORY', `Updated category: ${editingCategory.name}`, editingCategory.id, 'category');
      setEditingCategory(null);
      toast.success('Category updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories');
    }
  };

  const handleUpdateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBrand || !editingBrand.name.trim()) return;
    try {
      await updateDoc(doc(db, 'brands', editingBrand.id), { name: editingBrand.name });
      await logAction(profile, 'UPDATE_BRAND', `Updated brand: ${editingBrand.name}`, editingBrand.id, 'brand');
      setEditingBrand(null);
      toast.success('Brand updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'brands');
    }
  };

  const handleUpdateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier || !editingSupplier.name.trim()) return;
    try {
      const { id, ...data } = editingSupplier;
      await updateDoc(doc(db, 'suppliers', id), data);
      await logAction(profile, 'UPDATE_SUPPLIER', `Updated supplier: ${data.name}`, id, 'supplier');
      setEditingSupplier(null);
      toast.success('Supplier updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'suppliers');
    }
  };

  const handleUpdateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation || !editingLocation.name.trim()) return;
    try {
      const { id, ...data } = editingLocation;
      await updateDoc(doc(db, 'locations', id), data);
      await logAction(profile, 'UPDATE_LOCATION', `Updated location: ${data.name}`, id, 'location');
      setEditingLocation(null);
      toast.success('Location updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'locations');
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !editingCustomer.name.trim()) return;
    try {
      const { id, ...data } = editingCustomer;
      await updateDoc(doc(db, 'customers', id), data);
      await logAction(profile, 'UPDATE_CUSTOMER', `Updated customer: ${data.name}`, id, 'customer');
      setEditingCustomer(null);
      toast.success('Customer updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'customers');
    }
  };

  const handleDelete = async () => {
    const { collectionName, id } = deleteConfirm;
    if (!collectionName || !id) return;

    const isAuthorized = !!user || !!profile || isAdmin || isManager;
    
    if (!isAuthorized) {
      toast.error('You do not have permission to delete this');
      setDeleteConfirm({ open: false, collectionName: '', id: '', name: '' });
      return;
    }
    
    let details = `Deleted item from ${collectionName}`;
    if (collectionName === 'categories') {
      const item = categories.find(c => c.id === id);
      details = `Deleted category: ${item?.name}`;
    } else if (collectionName === 'brands') {
      const item = brands.find(b => b.id === id);
      details = `Deleted brand: ${item?.name}`;
    } else if (collectionName === 'suppliers') {
      const item = suppliers.find(s => s.id === id);
      details = `Deleted supplier: ${item?.name}`;
    } else if (collectionName === 'locations') {
      const item = locations.find(l => l.id === id);
      details = `Deleted location: ${item?.name}`;
    } else if (collectionName === 'customers') {
      const item = customers.find(c => c.id === id);
      details = `Deleted customer: ${item?.name}`;
    } else if (collectionName === 'loyaltyCards') {
      const item = loyaltyCards.find(l => l.id === id);
      details = `Deleted loyalty card: ${item?.cardNumber}`;
    } else if (collectionName === 'promos') {
      const item = promos.find(p => p.id === id);
      details = `Deleted promo code: ${item?.code}`;
    }

    try {
      if (collectionName === 'customers') {
        const cust = customers.find(c => c.id === id);
        
        // Delete any associated loyalty cards from loyaltyCards collection
        const cardsToDelete = loyaltyCards.filter(
          card => card.customerId === id || (cust?.loyaltyCardNumber && card.cardNumber === cust.loyaltyCardNumber)
        );

        for (const card of cardsToDelete) {
          try {
            await deleteDoc(doc(db, 'loyaltyCards', card.id));
          } catch (e) {
            console.warn('Error deleting card doc:', e);
          }
        }

        // Direct Firestore query fallback to catch any un-synced cards
        try {
          if (id) {
            const cardsQuery = query(collection(db, 'loyaltyCards'), where('customerId', '==', id));
            const cardsSnap = await getDocs(cardsQuery);
            for (const cardDoc of cardsSnap.docs) {
              await deleteDoc(doc(db, 'loyaltyCards', cardDoc.id));
            }
          }
          if (cust?.loyaltyCardNumber) {
            const cardNumQuery = query(collection(db, 'loyaltyCards'), where('cardNumber', '==', cust.loyaltyCardNumber));
            const cardNumSnap = await getDocs(cardNumQuery);
            for (const cardDoc of cardNumSnap.docs) {
              await deleteDoc(doc(db, 'loyaltyCards', cardDoc.id));
            }
          }
        } catch (err) {
          console.warn('Error deleting linked loyalty cards from query:', err);
        }

        // Delete customer doc
        await deleteDoc(doc(db, 'customers', id));
      } else if (collectionName === 'loyaltyCards') {
        const card = loyaltyCards.find(l => l.id === id);

        // If linked to customer, clear customer's assigned card
        const matchedCustomers = customers.filter(
          c => (card?.customerId && c.id === card.customerId) || (card?.cardNumber && c.loyaltyCardNumber === card.cardNumber)
        );

        for (const c of matchedCustomers) {
          try {
            await updateDoc(doc(db, 'customers', c.id), {
              loyaltyCardNumber: '',
              loyaltyCardQr: ''
            });
          } catch (e) {
            console.warn('Error clearing customer card reference:', e);
          }
        }

        // Delete loyalty card doc
        await deleteDoc(doc(db, 'loyaltyCards', id));
      } else {
        await deleteDoc(doc(db, collectionName, id));
      }

      await logAction(profile, `DELETE_${collectionName.toUpperCase().replace(/S$/, '')}`, details, id, collectionName.slice(0, -1));
      toast.success(`${collectionName.charAt(0).toUpperCase() + collectionName.slice(1, -1)} deleted successfully`);
    } catch (error) {
      console.error(`Error deleting from ${collectionName}:`, error);
      toast.error(`Failed to delete. Please try again.`);
      handleFirestoreError(error, OperationType.DELETE, collectionName);
    } finally {
      setDeleteConfirm({ open: false, collectionName: '', id: '', name: '' });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-primary tracking-tight font-heading">Directory</h1>
          <p className="text-muted-foreground">Manage your business master data and contacts.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search directory..." 
            className="pl-10 bg-white border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-secondary p-1 rounded-xl w-full md:w-auto overflow-x-auto flex-nowrap justify-start">
          {(isAdmin || isManager) && (
            <>
              <TabsTrigger value="categories" className="gap-2 rounded-lg px-6">
                <Tags className="w-4 h-4" />
                Categories
              </TabsTrigger>
              <TabsTrigger value="brands" className="gap-2 rounded-lg px-6">
                <BookOpen className="w-4 h-4" />
                Brands
              </TabsTrigger>
              <TabsTrigger value="suppliers" className="gap-2 rounded-lg px-6">
                <Building2 className="w-4 h-4" />
                Suppliers
              </TabsTrigger>
            </>
          )}
          {isAdmin && (
            <TabsTrigger value="locations" className="gap-2 rounded-lg px-6">
              <MapPin className="w-4 h-4" />
              Locations
            </TabsTrigger>
          )}
          <TabsTrigger value="customers" className="gap-2 rounded-lg px-6">
            <Users className="w-4 h-4" />
            Customers
          </TabsTrigger>
          <TabsTrigger value="loyaltyCards" className="gap-2 rounded-lg px-6">
            <CreditCard className="w-4 h-4 text-amber-500" />
            Loyalty Cards
          </TabsTrigger>
          {(isAdmin || isManager) && (
            <TabsTrigger value="promos" className="gap-2 rounded-lg px-6">
              <Ticket className="w-4 h-4 text-[#D4AF37]" />
              Promo Codes
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="categories" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 border-none shadow-sm bg-white/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">Add Category</CardTitle>
                <CardDescription>Organize your products by type.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddCategory} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Category Name</Label>
                    <Input 
                      placeholder="e.g. Beverages" 
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Category
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">Category List</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto border border-border rounded-xl">
                  <Table>
                    <TableHeader className="bg-secondary/30">
                      <TableRow>
                        <TableHead className="font-heading">Category Name</TableHead>
                        <TableHead className="text-right font-heading w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                            No categories found
                          </TableCell>
                        </TableRow>
                      ) : (
                        categories
                          .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map((cat) => (
                            <TableRow key={cat.id} className="group hover:bg-secondary/20">
                              <TableCell className="font-semibold text-primary">{cat.name}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onClick={() => setEditingCategory(cat)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      promptDelete('categories', cat.id, cat.name);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="brands" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 border-none shadow-sm bg-white/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">Add Brand</CardTitle>
                <CardDescription>Group products by manufacturer or brand name.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddBrand} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Brand Name</Label>
                    <Input 
                      placeholder="e.g. Nike, Apple" 
                      value={newBrand}
                      onChange={(e) => setNewBrand(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Brand
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">Brand List</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto border border-border rounded-xl">
                  <Table>
                    <TableHeader className="bg-secondary/30">
                      <TableRow>
                        <TableHead className="font-heading">Brand Name</TableHead>
                        <TableHead className="text-right font-heading w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brands.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                            No brands found
                          </TableCell>
                        </TableRow>
                      ) : (
                        brands
                          .filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map((brand) => (
                            <TableRow key={brand.id} className="group hover:bg-secondary/20">
                              <TableCell className="font-semibold text-primary">{brand.name}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onClick={() => setEditingBrand(brand)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      promptDelete('brands', brand.id, brand.name);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 border-none shadow-sm bg-white/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">Add Supplier</CardTitle>
                <CardDescription>Register a new business partner.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddSupplier} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Supplier Name</Label>
                    <Input 
                      value={newSupplier.name}
                      onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                      placeholder="e.g. Agos Wholesale"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Person</Label>
                    <Input 
                      value={newSupplier.contact}
                      onChange={(e) => setNewSupplier({ ...newSupplier, contact: e.target.value })}
                      placeholder="e.g. Juan Dela Cruz"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input 
                      type="email"
                      value={newSupplier.email}
                      onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                      placeholder="juan@agos.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Supplier Address</Label>
                    <Input 
                      value={newSupplier.address}
                      onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                      placeholder="Company address"
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Register Supplier
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">Supplier Directory</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto border border-border rounded-xl">
                  <Table>
                    <TableHeader className="bg-secondary/30">
                      <TableRow>
                        <TableHead className="font-heading">Supplier Name</TableHead>
                        <TableHead className="font-heading">Contact Person</TableHead>
                        <TableHead className="font-heading">Email</TableHead>
                        <TableHead className="font-heading">Address</TableHead>
                        <TableHead className="text-right font-heading w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suppliers.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No suppliers found
                          </TableCell>
                        </TableRow>
                      ) : (
                        suppliers
                          .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                          .slice((supplierPage - 1) * supplierPageSize, supplierPage * supplierPageSize)
                          .map((sup) => (
                            <TableRow key={sup.id} className="group hover:bg-secondary/20">
                              <TableCell className="font-semibold text-primary">{sup.name}</TableCell>
                              <TableCell className="text-muted-foreground">{sup.contact || '-'}</TableCell>
                              <TableCell className="text-muted-foreground">{sup.email || '-'}</TableCell>
                              <TableCell className="text-muted-foreground">{sup.address || '-'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onClick={() => setEditingSupplier(sup)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      promptDelete('suppliers', sup.id, sup.name);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                  <DataTablePagination
                    currentPage={supplierPage}
                    totalPages={Math.ceil(suppliers.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).length / supplierPageSize) || 1}
                    pageSize={supplierPageSize}
                    totalItems={suppliers.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).length}
                    onPageChange={setSupplierPage}
                    onPageSizeChange={size => {
                      setSupplierPageSize(size);
                      setSupplierPage(1);
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="locations" className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="md:col-span-1 border-none shadow-sm bg-white/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="font-heading text-2xl">Add Location</CardTitle>
                  <CardDescription>Branches and warehouses.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddLocation} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Location Name</Label>
                      <Input 
                        value={newLocation.name}
                        onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                        placeholder="e.g. Quezon City Hub"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input 
                        value={newLocation.addressLine1}
                        onChange={(e) => setNewLocation({ ...newLocation, addressLine1: e.target.value })}
                        placeholder="Street address"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Municipality</Label>
                        <Input 
                          value={newLocation.municipality}
                          onChange={(e) => setNewLocation({ ...newLocation, municipality: e.target.value })}
                          placeholder="District"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>City</Label>
                        <Input 
                          value={newLocation.city}
                          onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })}
                          placeholder="City"
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Location
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="md:col-span-2 border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="font-heading text-2xl">Business Locations</CardTitle>
                </CardHeader>
                <CardContent>
                <div className="overflow-x-auto border border-border rounded-xl">
                  <Table>
                    <TableHeader className="bg-secondary/30">
                      <TableRow>
                        <TableHead className="font-heading">Location Name</TableHead>
                        <TableHead className="font-heading">Address</TableHead>
                        <TableHead className="font-heading">Municipality & City</TableHead>
                        <TableHead className="text-right font-heading w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locations.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No locations found
                          </TableCell>
                        </TableRow>
                      ) : (
                        locations
                          .filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map((loc) => (
                            <TableRow key={loc.id} className="group hover:bg-secondary/20">
                              <TableCell className="font-semibold text-primary">{loc.name}</TableCell>
                              <TableCell className="text-muted-foreground">{loc.addressLine1 || '-'}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {loc.municipality ? `${loc.municipality}, ` : ''}{loc.city || ''}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onClick={() => setEditingLocation(loc)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      promptDelete('locations', loc.id, loc.name);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        <TabsContent value="customers" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 border-none shadow-sm bg-white/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">New Customer</CardTitle>
                <CardDescription>Build your customer database.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddCustomer} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input 
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                      placeholder="Customer Name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input 
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      placeholder="0912 345 6789"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input 
                      type="email"
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                      placeholder="customer@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Loyalty Card Number / Barcode</Label>
                      <button 
                        type="button" 
                        onClick={() => setNewCustomer(prev => ({ ...prev, loyaltyCardNumber: generateCardNumber() }))}
                        className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> Auto-Generate
                      </button>
                    </div>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input 
                        value={newCustomer.loyaltyCardNumber}
                        onChange={(e) => setNewCustomer({ ...newCustomer, loyaltyCardNumber: e.target.value })}
                        placeholder="e.g. LC-891234 or Barcode"
                        className="pl-9 font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Loyalty QR Code (Optional Payload)</Label>
                    <div className="relative">
                      <QrCode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input 
                        value={newCustomer.loyaltyCardQr}
                        onChange={(e) => setNewCustomer({ ...newCustomer, loyaltyCardQr: e.target.value })}
                        placeholder="e.g. QR-891234"
                        className="pl-9 font-mono"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Save Customer
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">Customer Database</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto border border-border rounded-xl">
                  <Table>
                    <TableHeader className="bg-secondary/30">
                      <TableRow>
                        <TableHead className="font-heading">Customer Name</TableHead>
                        <TableHead className="font-heading">Phone / Contact</TableHead>
                        <TableHead className="font-heading">Loyalty Card / QR</TableHead>
                        <TableHead className="font-heading">Loyalty Progress</TableHead>
                        <TableHead className="text-right font-heading w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.filter(c => 
                        c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        (c.loyaltyCardNumber && c.loyaltyCardNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        (c.phone && c.phone.includes(searchQuery))
                      ).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No customers found
                          </TableCell>
                        </TableRow>
                      ) : (
                        customers
                          .filter(c => 
                            c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (c.loyaltyCardNumber && c.loyaltyCardNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            (c.phone && c.phone.includes(searchQuery))
                          )
                          .slice((customerPage - 1) * customerPageSize, customerPage * customerPageSize)
                          .map((cust) => (
                            <TableRow key={cust.id} className="group hover:bg-secondary/20">
                              <TableCell className="font-semibold text-primary">{cust.name}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{cust.phone || cust.email || '-'}</TableCell>
                              <TableCell>
                                {cust.loyaltyCardNumber ? (
                                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-800 bg-amber-50/90 border border-amber-200/80 px-2.5 py-1 rounded-lg w-fit">
                                    <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                                    {cust.loyaltyCardNumber}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">No Card Assigned</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-bold">
                                      🎁 {(cust.loyaltyItemCount ?? ((cust.totalItemsPurchased ?? 0) % 10))}/10 in cycle
                                    </Badge>
                                    <span className="text-xs text-slate-500 font-medium">
                                      Total: {cust.totalItemsPurchased ?? 0} items
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onClick={() => setEditingCustomer(cust)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      promptDelete('customers', cust.id, cust.name);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                  <DataTablePagination
                    currentPage={customerPage}
                    totalPages={Math.ceil(customers.filter(c => 
                      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      (c.loyaltyCardNumber && c.loyaltyCardNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
                      (c.phone && c.phone.includes(searchQuery))
                    ).length / customerPageSize) || 1}
                    pageSize={customerPageSize}
                    totalItems={customers.filter(c => 
                      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      (c.loyaltyCardNumber && c.loyaltyCardNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
                      (c.phone && c.phone.includes(searchQuery))
                    ).length}
                    onPageChange={setCustomerPage}
                    onPageSizeChange={size => {
                      setCustomerPageSize(size);
                      setCustomerPage(1);
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="loyaltyCards" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 border-none shadow-sm bg-gradient-to-br from-amber-50/70 to-orange-50/70 backdrop-blur-sm border border-amber-200/60">
              <CardHeader>
                <CardTitle className="font-heading text-2xl flex items-center gap-2 text-amber-900">
                  <CreditCard className="w-5 h-5 text-amber-600" /> Issue Loyalty Card
                </CardTitle>
                <CardDescription className="text-amber-800">Assign a physical or digital card / QR code to a customer.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddLoyaltyCard} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-amber-950 font-bold">Assign to Registered Customer <span className="text-rose-600">*</span></Label>
                    <Select 
                      value={newLoyaltyCard.customerId}
                      onValueChange={(v) => setNewLoyaltyCard({ ...newLoyaltyCard, customerId: v })}
                    >
                      <SelectTrigger className="bg-white border-amber-200">
                        <SelectValue placeholder="Select Registered Customer">
                          {newLoyaltyCard.customerId 
                            ? (customers.find(c => c.id === newLoyaltyCard.customerId)?.name || 'Select Registered Customer')
                            : 'Select Registered Customer *'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.loyaltyCardNumber ? `(Current: ${c.loyaltyCardNumber})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-amber-800">
                      Loyalty cards are strictly issued to registered customers in the app.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-amber-950 font-bold">Loyalty Card # / Barcode</Label>
                      <button 
                        type="button" 
                        onClick={() => setNewLoyaltyCard(prev => ({ ...prev, cardNumber: generateCardNumber() }))}
                        className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> Auto-Generate
                      </button>
                    </div>
                    <Input 
                      value={newLoyaltyCard.cardNumber}
                      onChange={(e) => setNewLoyaltyCard({ ...newLoyaltyCard, cardNumber: e.target.value })}
                      placeholder="e.g. LC-982341"
                      className="bg-white border-amber-200 font-mono font-bold text-slate-800"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-amber-950 font-bold">QR Code Payload / ID</Label>
                    <Input 
                      value={newLoyaltyCard.qrCode}
                      onChange={(e) => setNewLoyaltyCard({ ...newLoyaltyCard, qrCode: e.target.value })}
                      placeholder="e.g. QR-982341 (Same as card # if blank)"
                      className="bg-white border-amber-200 font-mono text-slate-800 text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-amber-950 font-bold">Notes</Label>
                    <Input 
                      value={newLoyaltyCard.notes}
                      onChange={(e) => setNewLoyaltyCard({ ...newLoyaltyCard, notes: e.target.value })}
                      placeholder="e.g. Physical VIP card issued"
                      className="bg-white border-amber-200 text-slate-800 text-xs"
                    />
                  </div>

                  <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Issue Loyalty Card
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl flex items-center justify-between">
                  <span>Loyalty Cards Directory</span>
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                    {loyaltyCards.length} Cards Issued
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto border border-border rounded-xl">
                  <Table>
                    <TableHeader className="bg-secondary/30">
                      <TableRow>
                        <TableHead className="font-heading">Card Number</TableHead>
                        <TableHead className="font-heading">Assigned Customer</TableHead>
                        <TableHead className="font-heading">Cycle Progress</TableHead>
                        <TableHead className="font-heading">Status</TableHead>
                        <TableHead className="text-right font-heading w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loyaltyCards.filter(card => 
                        card.cardNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (card.customerName && card.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        (card.qrCode && card.qrCode.toLowerCase().includes(searchQuery.toLowerCase()))
                      ).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No loyalty cards found
                          </TableCell>
                        </TableRow>
                      ) : (
                        loyaltyCards
                          .filter(card => 
                            card.cardNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (card.customerName && card.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            (card.qrCode && card.qrCode.toLowerCase().includes(searchQuery.toLowerCase()))
                          )
                          .map((card) => {
                            const matchedCust = customers.find(c => c.id === card.customerId || c.loyaltyCardNumber === card.cardNumber);
                            const count = matchedCust ? (matchedCust.loyaltyItemCount ?? ((matchedCust.totalItemsPurchased ?? 0) % 10)) : 0;
                            return (
                              <TableRow key={card.id} className="group hover:bg-secondary/20">
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-mono font-bold text-amber-900 flex items-center gap-1.5">
                                      <CreditCard className="w-4 h-4 text-amber-600" />
                                      {card.cardNumber}
                                    </span>
                                    {card.qrCode && card.qrCode !== card.cardNumber && (
                                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                        <QrCode className="w-3 h-3 text-slate-400" /> {card.qrCode}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {matchedCust ? (
                                    <span className="font-semibold text-primary">{matchedCust.name}</span>
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">Unassigned</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-bold">
                                    🎁 {count}/10 in cycle
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge className={card.status === 'active' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-600'}>
                                    {card.status === 'active' ? 'Active' : 'Inactive'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                                      onClick={() => setEditingLoyaltyCard(card)}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        promptDelete('loyaltyCards', card.id, card.cardNumber);
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Loyalty Discount Program Settings Card */}
          <Card className="border-none shadow-sm bg-gradient-to-br from-amber-50/60 to-orange-50/60 backdrop-blur-sm border border-amber-200/60 mt-6">
            <CardHeader>
              <CardTitle className="font-heading text-2xl flex items-center gap-2 text-amber-900">
                <Gift className="w-6 h-6 text-amber-600" />
                Loyalty Discount Program
              </CardTitle>
              <CardDescription className="text-amber-800">
                Automatically reward returning customers with discounts on their 5th and 10th item purchases in each 10-item cycle.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleSaveLoyalty} className="space-y-4 p-5 bg-white/80 rounded-2xl border border-amber-200 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-amber-100">
                  <div>
                    <Label className="font-bold text-slate-800 text-sm">Enable Loyalty Program</Label>
                    <p className="text-xs text-slate-500">Automatically calculate and apply milestone discounts during checkout.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    checked={loyaltyEnabled}
                    onChange={(e) => setLoyaltyEnabled(e.target.checked)}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-2 p-3 bg-amber-50/60 rounded-xl border border-amber-200/50">
                    <div className="flex justify-between items-center">
                      <Label className="font-bold text-amber-900">Tier 1 Discount (5th Item Milestone)</Label>
                      <Badge variant="outline" className="bg-amber-100 border-amber-300 text-amber-800 text-[10px]">5th Item</Badge>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-snug">Fixed discount automatically deducted when customer purchases their 5th item.</p>
                    <div className="relative pt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">{settings.currency}</span>
                      <Input 
                        type="number" 
                        min="0"
                        step="1"
                        className="pl-7 bg-white border-amber-200 font-bold text-slate-800"
                        value={loyaltyTier1} 
                        onChange={(e) => setLoyaltyTier1(Number(e.target.value))} 
                      />
                    </div>
                  </div>

                  <div className="space-y-2 p-3 bg-orange-50/60 rounded-xl border border-orange-200/50">
                    <div className="flex justify-between items-center">
                      <Label className="font-bold text-orange-900">Tier 2 Discount (10th Item Milestone)</Label>
                      <Badge variant="outline" className="bg-orange-100 border-orange-300 text-orange-800 text-[10px]">10th Item & Cycle Reset</Badge>
                    </div>
                    <p className="text-[11px] text-orange-700 leading-snug">Fixed discount automatically deducted on 10th item. Cycle resets back to 0 after 10th item.</p>
                    <div className="relative pt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">{settings.currency}</span>
                      <Input 
                        type="number" 
                        min="0"
                        step="1"
                        className="pl-7 bg-white border-orange-200 font-bold text-slate-800"
                        value={loyaltyTier2} 
                        onChange={(e) => setLoyaltyTier2(Number(e.target.value))} 
                      />
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold h-11 rounded-xl shadow-md">
                    Save Loyalty Settings
                  </Button>
                )}
              </form>

              <div className="p-5 bg-white/80 rounded-2xl border border-amber-200 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-amber-600" />
                      Loyalty Database Migration Tool
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Scans all historical completed sales and safely initializes or updates customer item counts (<code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">totalItemsPurchased</code> and <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">loyaltyItemCount</code>).
                    </p>
                  </div>
                  {isAdmin && (
                    <Button 
                      onClick={handleRunLoyaltyMigration}
                      disabled={isMigratingLoyalty}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-6 shrink-0 rounded-xl"
                    >
                      {isMigratingLoyalty ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin" /> Running Migration...
                        </span>
                      ) : (
                        'Run Loyalty Migration'
                      )}
                    </Button>
                  )}
                </div>

                {migrationSummary && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs text-emerald-900">
                    <div className="flex items-center justify-between font-bold text-emerald-800">
                      <span>✅ Migration Report Summary</span>
                      <span>{migrationSummary.updatedCustomersCount} / {migrationSummary.totalCustomers} Customers Updated</span>
                    </div>
                    <p>Total Items Backfilled from Historical Sales: <strong>{migrationSummary.totalItemsMigrated} items</strong></p>
                    {migrationSummary.details.length > 0 && (
                      <div className="max-h-36 overflow-y-auto pt-2 border-t border-emerald-200 space-y-1">
                        {migrationSummary.details.map((d: any, i: number) => (
                          <div key={i} className="flex justify-between text-[11px] font-mono text-emerald-700">
                            <span>{d.customerName}</span>
                            <span>Total: {d.newTotalItems} items | Cycle Count: {d.newLoyaltyCount}/10</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="promos" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 border-none shadow-sm bg-white/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl flex items-center gap-2">
                  <Ticket className="w-6 h-6 text-[#D4AF37]" />
                  Add Promo Code
                </CardTitle>
                <CardDescription>Create discount codes for store checkout.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddPromo} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Promo Code</Label>
                    <Input 
                      value={newPromo.code} 
                      onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })} 
                      placeholder="e.g. SUMMER50" 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Discount Amount ({settings.currency})</Label>
                    <Input 
                      type="number"
                      min="0"
                      step="any"
                      value={newPromo.amount} 
                      onChange={(e) => setNewPromo({ ...newPromo, amount: Number(e.target.value) })} 
                      required
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input 
                      type="checkbox" 
                      id="isPermanent"
                      className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      checked={newPromo.isPermanent}
                      onChange={(e) => setNewPromo({ ...newPromo, isPermanent: e.target.checked })}
                    />
                    <Label htmlFor="isPermanent" className="cursor-pointer text-sm font-medium">Permanent Promo</Label>
                  </div>
                  {!newPromo.isPermanent && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Start Date</Label>
                        <Input 
                          type="date"
                          value={newPromo.startDate}
                          onChange={(e) => setNewPromo({ ...newPromo, startDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">End Date</Label>
                        <Input 
                          type="date"
                          value={newPromo.endDate}
                          onChange={(e) => setNewPromo({ ...newPromo, endDate: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <input 
                      type="checkbox" 
                      id="isActive"
                      className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      checked={newPromo.isActive}
                      onChange={(e) => setNewPromo({ ...newPromo, isActive: e.target.checked })}
                    />
                    <Label htmlFor="isActive" className="cursor-pointer text-sm font-medium">Active Immediately</Label>
                  </div>
                  <Button type="submit" className="w-full bg-[#D4AF37] hover:bg-[#B89630] font-bold text-white shadow-sm mt-2">
                    <Plus className="w-4 h-4 mr-2" /> Create Promo Code
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-none shadow-sm bg-white/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="font-heading text-2xl">Active Promo Codes</CardTitle>
                  <CardDescription>Manage discount promo codes across your store.</CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Search code..." 
                    className="pl-9 bg-white"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Validity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {promos
                        .filter(p => p.code.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-bold font-mono">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                                <Ticket className="w-3.5 h-3.5 text-amber-600" />
                                {p.code}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold">
                                -{settings.currency}{Number(p.amount).toFixed(2)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {p.isPermanent ? (
                                <span className="font-medium text-slate-700">Permanent</span>
                              ) : (
                                <span>
                                  {p.startDate ? p.startDate.toDate().toLocaleDateString() : 'N/A'} - {p.endDate ? p.endDate.toDate().toLocaleDateString() : 'N/A'}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {p.isActive ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border-none">Active</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none">Inactive</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-muted-foreground hover:text-primary" 
                                  onClick={() => setEditingPromo(p)}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    promptDelete('promos', p.id, p.code);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      {promos.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No promo codes created yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialogs */}
      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateCategory} className="space-y-4">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input 
                value={editingCategory?.name || ''} 
                onChange={(e) => setEditingCategory(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingCategory(null)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingBrand} onOpenChange={(open) => !open && setEditingBrand(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Brand</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateBrand} className="space-y-4">
            <div className="space-y-2">
              <Label>Brand Name</Label>
              <Input 
                value={editingBrand?.name || ''} 
                onChange={(e) => setEditingBrand(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingBrand(null)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingSupplier} onOpenChange={(open) => !open && setEditingSupplier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateSupplier} className="space-y-4">
            <div className="space-y-2">
              <Label>Supplier Name</Label>
              <Input 
                value={editingSupplier?.name || ''} 
                onChange={(e) => setEditingSupplier(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input 
                value={editingSupplier?.contact || ''} 
                onChange={(e) => setEditingSupplier(prev => prev ? { ...prev, contact: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                value={editingSupplier?.email || ''} 
                onChange={(e) => setEditingSupplier(prev => prev ? { ...prev, email: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input 
                value={editingSupplier?.address || ''} 
                onChange={(e) => setEditingSupplier(prev => prev ? { ...prev, address: e.target.value } : null)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingSupplier(null)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingLocation} onOpenChange={(open) => !open && setEditingLocation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Location</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateLocation} className="space-y-4">
            <div className="space-y-2">
              <Label>Location Name</Label>
              <Input 
                value={editingLocation?.name || ''} 
                onChange={(e) => setEditingLocation(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input 
                value={editingLocation?.addressLine1 || ''} 
                onChange={(e) => setEditingLocation(prev => prev ? { ...prev, addressLine1: e.target.value } : null)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Municipality</Label>
                <Input 
                  value={editingLocation?.municipality || ''} 
                  onChange={(e) => setEditingLocation(prev => prev ? { ...prev, municipality: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input 
                  value={editingLocation?.city || ''} 
                  onChange={(e) => setEditingLocation(prev => prev ? { ...prev, city: e.target.value } : null)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingLocation(null)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCustomer} onOpenChange={(open) => !open && setEditingCustomer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateCustomer} className="space-y-4">
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input 
                value={editingCustomer?.name || ''} 
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input 
                value={editingCustomer?.phone || ''} 
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, phone: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                value={editingCustomer?.email || ''} 
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, email: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Loyalty Card Number / Barcode</Label>
                <button 
                  type="button"
                  onClick={() => setEditingCustomer(prev => prev ? { ...prev, loyaltyCardNumber: generateCardNumber() } : null)}
                  className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Auto-Generate
                </button>
              </div>
              <Input 
                value={editingCustomer?.loyaltyCardNumber || ''} 
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, loyaltyCardNumber: e.target.value } : null)}
                placeholder="e.g. LC-891234"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Loyalty QR Code Payload</Label>
              <Input 
                value={editingCustomer?.loyaltyCardQr || ''} 
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, loyaltyCardQr: e.target.value } : null)}
                placeholder="e.g. QR-891234"
                className="font-mono text-xs"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingCustomer(null)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingLoyaltyCard} onOpenChange={(open) => !open && setEditingLoyaltyCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Loyalty Card</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateLoyaltyCard} className="space-y-4">
            <div className="space-y-2">
              <Label>Loyalty Card Number</Label>
              <Input 
                value={editingLoyaltyCard?.cardNumber || ''} 
                onChange={(e) => setEditingLoyaltyCard(prev => prev ? { ...prev, cardNumber: e.target.value } : null)}
                className="font-mono font-bold"
              />
            </div>
            <div className="space-y-2">
              <Label>QR Code Payload</Label>
              <Input 
                value={editingLoyaltyCard?.qrCode || ''} 
                onChange={(e) => setEditingLoyaltyCard(prev => prev ? { ...prev, qrCode: e.target.value } : null)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Assign to Registered Customer <span className="text-rose-600">*</span></Label>
              <Select 
                value={editingLoyaltyCard?.customerId || ''}
                onValueChange={(v) => setEditingLoyaltyCard(prev => prev ? { ...prev, customerId: v } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Registered Customer">
                    {editingLoyaltyCard?.customerId 
                      ? (customers.find(c => c.id === editingLoyaltyCard.customerId)?.name || 'Select Registered Customer')
                      : 'Select Registered Customer *'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select 
                value={editingLoyaltyCard?.status || 'active'}
                onValueChange={(v) => setEditingLoyaltyCard(prev => prev ? { ...prev, status: v as 'active' | 'inactive' } : null)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input 
                value={editingLoyaltyCard?.notes || ''} 
                onChange={(e) => setEditingLoyaltyCard(prev => prev ? { ...prev, notes: e.target.value } : null)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingLoyaltyCard(null)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Promo Code Dialog */}
      <Dialog open={!!editingPromo} onOpenChange={(open) => !open && setEditingPromo(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Ticket className="w-5 h-5 text-[#D4AF37]" /> Edit Promo Code
            </DialogTitle>
          </DialogHeader>
          {editingPromo && (
            <form onSubmit={handleUpdatePromo} className="space-y-4">
              <div className="space-y-2">
                <Label>Promo Code</Label>
                <Input 
                  value={editingPromo.code}
                  onChange={(e) => setEditingPromo({ ...editingPromo, code: e.target.value.toUpperCase() })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Discount Amount ({settings.currency})</Label>
                <Input 
                  type="number"
                  min="0"
                  step="any"
                  value={editingPromo.amount}
                  onChange={(e) => setEditingPromo({ ...editingPromo, amount: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input 
                  type="checkbox" 
                  id="editIsPermanent"
                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  checked={editingPromo.isPermanent}
                  onChange={(e) => setEditingPromo({ ...editingPromo, isPermanent: e.target.checked })}
                />
                <Label htmlFor="editIsPermanent" className="cursor-pointer text-sm font-medium">Permanent Promo</Label>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input 
                  type="checkbox" 
                  id="editIsActive"
                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  checked={editingPromo.isActive}
                  onChange={(e) => setEditingPromo({ ...editingPromo, isActive: e.target.checked })}
                />
                <Label htmlFor="editIsActive" className="cursor-pointer text-sm font-medium">Active Status</Label>
              </div>
              <DialogFooter className="gap-2 mt-4">
                <Button type="button" variant="outline" onClick={() => setEditingPromo(null)}>Cancel</Button>
                <Button type="submit" className="bg-[#D4AF37] hover:bg-[#B89630] font-bold text-white">Save Changes</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => { if (!open) setDeleteConfirm({ open: false, collectionName: '', id: '', name: '' }); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-rose-600 font-heading text-lg flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-600" /> Confirm Delete
            </DialogTitle>
            <DialogDescription className="text-slate-700 text-sm">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
              {deleteConfirm.collectionName === 'customers' && (
                <span className="block mt-2 text-xs text-amber-700 font-medium bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                  ⚠️ Deleting this customer will also delete their assigned loyalty card.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm({ open: false, collectionName: '', id: '', name: '' })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700 font-bold">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Directory;
