import React, { useEffect, useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Plus, 
  Trash2, 
  User, 
  Shield, 
  Database,
  Building2,
  Tags,
  Edit2,
  Users,
  Mail,
  Check,
  X,
  History,
  FileText,
  Package,
  Ticket,
  CreditCard,
  Wallet,
  Building,
  Banknote,
  Undo2,
  Download,
  Upload,
  Search,
  Calendar,
  RotateCcw,
  Filter,
  Gift,
  RefreshCw
} from 'lucide-react';
import { migrateCustomerLoyaltyCounts, MigrationResult } from '@/lib/loyalty-migrations';
import { migrateFirestoreToSupabase } from '@/lib/migration';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy, limit, getDocs, writeBatch, Timestamp, setDoc, deleteField, getDoc, increment, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Category, Supplier, UserProfile, Location, Invite, AuditLog, Customer, Product, PromoCode, PaymentOption, Sale } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { MapPin, Coins } from 'lucide-react';
import { logAction } from '@/lib/audit';
import { reconcileSystemData } from '@/lib/reconciliation';
import { motion } from 'motion/react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export const Settings: React.FC = () => {
  const { profile, isAdmin, isManager, updateProfile } = useAuth();
  const { settings, updateCurrency } = useSettings();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  
  const [newInvite, setNewInvite] = useState({ 
    email: '', 
    role: 'staff' as 'admin' | 'manager' | 'staff',
    locationId: ''
  });

  const [newPromo, setNewPromo] = useState({
    code: '',
    amount: 0,
    isPermanent: true,
    startDate: '',
    endDate: '',
    isActive: true
  });

  const [newPayment, setNewPayment] = useState({
    name: '',
    type: 'bank' as 'bank' | 'ewallet' | 'cash' | 'card',
    active: true,
    initialBalance: 0
  });

  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentOption | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(profile?.name || '');

  const [accounts, setAccounts] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');
  const [isRevertDialogOpen, setIsRevertDialogOpen] = useState(false);
  const [revertLog, setRevertLog] = useState<AuditLog | null>(null);
  const [revertEntityData, setRevertEntityData] = useState<any | null>(null);
  const [revertAccountId, setRevertAccountId] = useState<string>('');
  const [isReverting, setIsReverting] = useState(false);

  // Go-Live Reset Wizard states
  const [isResetWizardOpen, setIsResetWizardOpen] = useState(false);
  const [resetType, setResetType] = useState<'transactions' | 'factory'>('transactions');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetStep, setResetStep] = useState('');

  // Backup / Restore states
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isMigratingSupabase, setIsMigratingSupabase] = useState(false);
  const [backupProgress, setBackupProgress] = useState('');
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoreOption, setRestoreOption] = useState<'merge' | 'replace'>('merge');

  const handleMigrateToSupabase = async () => {
    setIsMigratingSupabase(true);
    try {
      toast.info('Starting sync to Supabase PostgreSQL...');
      const res = await migrateFirestoreToSupabase();
      if (res.success) {
        toast.success('Successfully synced Firestore data to Supabase!');
      } else {
        toast.warning(`Sync finished with some issues. Migrated tables: ${Object.keys(res.counts).length}`);
      }
    } catch (err: any) {
      console.error('Supabase migration error:', err);
      toast.error('Migration failed: ' + (err.message || 'Check your Supabase URL & Anon Key'));
    } finally {
      setIsMigratingSupabase(false);
    }
  };

  const handleManualReconcile = async () => {
    setIsReconciling(true);
    try {
      const res = await reconcileSystemData();
      toast.success(res.message || 'System data reconciled successfully!');
    } catch (err: any) {
      toast.error('Reconciliation failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsReconciling(false);
    }
  };


  useEffect(() => {
    if (!profile) return;

    const unsubscribeLocs = onSnapshot(collection(db, 'locations'), (snapshot) => {
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
    }, (error) => {
      console.warn("Settings: Error listening to locations:", error);
    });

    const unsubscribePromos = onSnapshot(collection(db, 'promos'), (snapshot) => {
      setPromos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PromoCode)));
    }, (error) => {
      console.warn("Settings: Error listening to promos:", error);
    });

    const unsubscribePayments = onSnapshot(collection(db, 'paymentOptions'), (snapshot) => {
      setPaymentOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentOption)));
    }, (error) => {
      console.warn("Settings: Error listening to paymentOptions:", error);
    });

    const unsubscribeAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn("Settings: Error listening to accounts:", error);
    });

    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      console.warn("Settings: Error listening to products:", error);
    });

    const unsubscribeSales = onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc'), limit(100)), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
    }, (error) => {
      console.warn("Settings: Error listening to sales:", error);
    });

    let unsubscribeUsers: () => void = () => {};
    let unsubscribeInvites: () => void = () => {};
    let unsubscribeAudit: () => void = () => {};

    if (isAdmin) {
      unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile)));
      }, (error) => {
        console.warn("Settings: Error listening to users:", error);
      });
      unsubscribeInvites = onSnapshot(query(collection(db, 'invites'), orderBy('createdAt', 'desc')), (snapshot) => {
        setInvites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invite)));
      }, (error) => {
        console.warn("Settings: Error listening to invites:", error);
      });
      unsubscribeAudit = onSnapshot(query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(100)), (snapshot) => {
        setAuditLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog)));
      }, (error) => {
        console.warn("Settings: Error listening to audit_logs:", error);
      });
    }

    return () => {
      unsubscribeLocs();
      unsubscribePromos();
      unsubscribePayments();
      unsubscribeAccounts();
      unsubscribeProducts();
      unsubscribeSales();
      unsubscribeUsers();
      unsubscribeInvites();
      unsubscribeAudit();
    };
  }, [profile?.id, isAdmin]);

  useEffect(() => {
    if (profile) setProfileName(profile.name || '');
  }, [profile]);

  const getProductNameFromLog = React.useCallback((log: AuditLog, productsList: Product[], salesList: Sale[] = []) => {
    // 1. Direct product entity
    if (log.entityType === 'product' && log.entityId) {
      const found = productsList.find(p => p.id === log.entityId);
      if (found?.name) return found.name;
    }

    // 2. Sale entity - lookup from loaded sales collection
    if ((log.entityType === 'sale' || (log.action && log.action.includes('SALE'))) && log.entityId) {
      const foundSale = salesList.find(s => s.id === log.entityId);
      if (foundSale?.items && foundSale.items.length > 0) {
        return foundSale.items.map(i => `${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ''}`).join(', ');
      }
    }

    const details = log.details || '';
    if (!details) return null;

    // 3. Extracted from bracket summary in log details (e.g. Processed sale: Total $100 [Black Pod Formula (x2)])
    const matchBracket = details.match(/\[(.*?)\]/);
    if (matchBracket && matchBracket[1]) return matchBracket[1].trim();

    const matchProd = details.match(/(?:Updated|Created|Deleted) product:\s*([^\(]+?)(?:\s*\(SKU:|\s*$)/i);
    if (matchProd && matchProd[1]) return matchProd[1].trim();

    const matchAdj = details.match(/Adjusted stock for\s+(.*?)\s+at/i);
    if (matchAdj && matchAdj[1]) return matchAdj[1].trim();

    const matchAdjRev = details.match(/adjustment to\s+(.*?)(?:\s*$|\s+at|\s+via)/i);
    if (matchAdjRev && matchAdjRev[1] && matchAdjRev[1].toLowerCase() !== 'product') return matchAdjRev[1].trim();

    const matchTrsf = details.match(/units of\s+(.*?)\s+from/i);
    if (matchTrsf && matchTrsf[1]) return matchTrsf[1].trim();

    const matchRet = details.match(/Processed return for Sale #[^:]+:\s*(.*)/i);
    if (matchRet && matchRet[1]) {
      const firstItem = matchRet[1].split(',')[0]?.replace(/\(x\d+\)/g, '').trim();
      if (firstItem) return firstItem;
    }

    if (productsList.length > 0) {
      const sortedProds = [...productsList].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));
      for (const p of sortedProds) {
        if (p.name && p.name.length >= 2 && details.toLowerCase().includes(p.name.toLowerCase())) {
          return p.name;
        }
      }
    }

    return null;
  }, []);

  const filteredAuditLogs = React.useMemo(() => {
    return auditLogs.filter(log => {
      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase().trim();
        const userName = (log.userName || '').toLowerCase();
        const userEmail = (log.userEmail || '').toLowerCase();
        const action = (log.action || '').toLowerCase();
        const details = (log.details || '').toLowerCase();
        const prodName = (getProductNameFromLog(log, products, sales) || '').toLowerCase();
        const entityId = (log.entityId || '').toLowerCase();
        const logId = (log.id || '').toLowerCase();

        const matchesSearch = userName.includes(q) ||
                              userEmail.includes(q) ||
                              action.includes(q) ||
                              details.includes(q) ||
                              prodName.includes(q) ||
                              entityId.includes(q) ||
                              logId.includes(q);

        if (!matchesSearch) return false;
      }

      if (log.timestamp) {
        const logDate = log.timestamp.toDate();

        if (auditStartDate) {
          const start = new Date(auditStartDate);
          start.setHours(0, 0, 0, 0);
          if (logDate < start) return false;
        }

        if (auditEndDate) {
          const end = new Date(auditEndDate);
          end.setHours(23, 59, 59, 999);
          if (logDate > end) return false;
        }
      }

      return true;
    });
  }, [auditLogs, auditSearch, auditStartDate, auditEndDate, products, sales, getProductNameFromLog]);

  // JSON serialization/deserialization helpers for Firestore Timestamps
  const serializeData = (data: any): any => {
    if (data === null || data === undefined) return data;
    if (data instanceof Timestamp) {
      return { _type: 'timestamp', seconds: data.seconds, nanoseconds: data.nanoseconds };
    }
    if (Array.isArray(data)) {
      return data.map(serializeData);
    }
    if (typeof data === 'object') {
      // Check if it looks like a Firestore Timestamp object from a plain serialized perspective
      if (data.seconds !== undefined && data.nanoseconds !== undefined && typeof data.toDate === 'function') {
        return { _type: 'timestamp', seconds: data.seconds, nanoseconds: data.nanoseconds };
      }
      const result: any = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          result[key] = serializeData(data[key]);
        }
      }
      return result;
    }
    return data;
  };

  const deserializeData = (data: any): any => {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) {
      return data.map(deserializeData);
    }
    if (typeof data === 'object') {
      if (data._type === 'timestamp') {
        return new Timestamp(data.seconds, data.nanoseconds);
      }
      const result: any = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          result[key] = deserializeData(data[key]);
        }
      }
      return result;
    }
    return data;
  };

  const COLLECTIONS_TO_BACKUP = [
    'locations',
    'categories',
    'brands',
    'suppliers',
    'priceTiers',
    'promos',
    'paymentOptions',
    'accounts',
    'products',
    'customers',
    'sales',
    'returnTransactions',
    'purchaseOrders',
    'stockAdjustments',
    'financialTransactions',
    'schedules',
    'attendance',
    'audit_logs'
  ];

  const handleBackupData = async () => {
    setIsBackingUp(true);
    setBackupProgress('Initiating database export...');
    try {
      const backupData: Record<string, { id: string; data: any }[]> = {};
      
      for (const colName of COLLECTIONS_TO_BACKUP) {
        setBackupProgress(`Fetching ${colName}...`);
        const snapshot = await getDocs(collection(db, colName));
        backupData[colName] = snapshot.docs.map(doc => ({
          id: doc.id,
          data: serializeData(doc.data())
        }));
      }

      setBackupProgress('Formatting JSON backup payload...');
      const fullBackup = {
        backupVersion: 1,
        timestamp: new Date().toISOString(),
        collections: backupData
      };

      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `inventory_pos_backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await logAction(
        profile, 
        'SYSTEM_BACKUP', 
        `Exported a full database backup consisting of ${Object.values(backupData).reduce((acc, curr) => acc + curr.length, 0)} total records across ${COLLECTIONS_TO_BACKUP.length} collections.`
      );

      toast.success('Database backup created and downloaded successfully!');
    } catch (error) {
      console.error('Backup failed:', error);
      toast.error('Failed to create database backup.');
    } finally {
      setIsBackingUp(false);
      setBackupProgress('');
    }
  };

  const handleRestoreData = async () => {
    if (!restoreFile) {
      toast.error('Please select a valid backup JSON file first.');
      return;
    }
    if (restoreConfirmText !== 'RESTORE') {
      toast.error('Please type RESTORE to confirm this operation.');
      return;
    }

    setIsRestoring(true);
    setBackupProgress('Reading backup file...');
    
    try {
      const fileText = await restoreFile.text();
      const backupObj = JSON.parse(fileText);

      // Simple validation
      if (!backupObj || typeof backupObj !== 'object' || !backupObj.collections) {
        throw new Error('Invalid backup file format.');
      }

      let batch = writeBatch(db);
      let opCount = 0;

      const collections = backupObj.collections;

      // 1. If 'replace' (clean restore), let's clear existing documents in all backed-up collections
      if (restoreOption === 'replace') {
        for (const colName of COLLECTIONS_TO_BACKUP) {
          setBackupProgress(`Purging current ${colName} collection...`);
          const snapshot = await getDocs(collection(db, colName));
          for (const docSnap of snapshot.docs) {
            batch.delete(docSnap.ref);
            opCount++;
            if (opCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }
        }
        if (opCount > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }

      // 2. Load and write backup data doc by doc
      for (const colName of COLLECTIONS_TO_BACKUP) {
        const docs = collections[colName];
        if (!docs || !Array.isArray(docs)) continue;

        setBackupProgress(`Restoring ${docs.length} records into ${colName}...`);
        for (const item of docs) {
          if (!item.id || !item.data) continue;

          const docRef = doc(db, colName, item.id);
          const deserialized = deserializeData(item.data);
          
          batch.set(docRef, deserialized);
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      // 3. Post-restore log entry
      await logAction(
        profile,
        'SYSTEM_RESTORE',
        `Imported database backup from snapshot dated ${backupObj.timestamp || 'unknown'}. Restore mode: ${restoreOption}.`
      );

      toast.success('Database restored successfully from the backup snapshot!');
      setIsRestoreModalOpen(false);
      setRestoreFile(null);
      setRestoreConfirmText('');
    } catch (error: any) {
      console.error('Restore failed:', error);
      toast.error(`Restore failed: ${error.message || 'Malformed JSON file'}`);
    } finally {
      setIsRestoring(false);
      setBackupProgress('');
    }
  };

  const handleProceedReset = async () => {
    if (resetConfirmText !== 'RESET') {
      toast.error('Please enter RESET to confirm');
      return;
    }

    setIsResetting(true);
    try {
      let batch = writeBatch(db);
      let opCount = 0;

      // Helper function to commit and recreate batch to avoid Firestore batch limits
      const safeDeleteDocs = async (snap: any) => {
        for (const docSnap of snap.docs) {
          batch.delete(docSnap.ref);
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
      };

      // 1. Clear Sales & Returns
      setResetStep('Clearing sales and return records...');
      const salesSnap = await getDocs(collection(db, 'sales'));
      await safeDeleteDocs(salesSnap);
      const returnsSnap = await getDocs(collection(db, 'returnTransactions'));
      await safeDeleteDocs(returnsSnap);
      if (opCount > 0) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }

      // 2. Clear POs & Stock Adjustments
      setResetStep('Clearing purchase orders and stock logs...');
      const poSnap = await getDocs(collection(db, 'purchaseOrders'));
      await safeDeleteDocs(poSnap);
      const saSnap = await getDocs(collection(db, 'stockAdjustments'));
      await safeDeleteDocs(saSnap);
      if (opCount > 0) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }

      // 3. Clear Financial Transactions
      setResetStep('Purging financial transaction logs...');
      const finSnap = await getDocs(collection(db, 'financialTransactions'));
      await safeDeleteDocs(finSnap);
      if (opCount > 0) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }

      // 4. Clear Schedules & Attendance
      setResetStep('Clearing employee shifts and schedules...');
      const schedsSnap = await getDocs(collection(db, 'schedules'));
      await safeDeleteDocs(schedsSnap);
      const attendSnap = await getDocs(collection(db, 'attendance'));
      await safeDeleteDocs(attendSnap);
      if (opCount > 0) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }

      // 5. Hard Reset (Option A: Just transaction history + stock reset, Option B: Full wipe of everything)
      if (resetType === 'factory') {
        setResetStep('Executing structural factory reset of all registers...');
        const collectionsToWipe = [
          'products', 'customers', 'suppliers', 'brands', 'categories',
          'priceTiers', 'promos', 'paymentOptions', 'accounts', 'locations', 'invites'
        ];
        for (const colName of collectionsToWipe) {
          const snap = await getDocs(collection(db, colName));
          await safeDeleteDocs(snap);
        }
        if (opCount > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      } else {
        // Option A: Just reset existing product stock counts to zero, reset financial account balances to zero
        setResetStep('Resetting stock counts to zero across all locations...');
        const prodSnap = await getDocs(collection(db, 'products'));
        for (const docSnap of prodSnap.docs) {
          batch.update(docSnap.ref, {
            stock: 0,
            stocks: {},
            lastUpdated: Timestamp.now()
          });
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
        if (opCount > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }

        setResetStep('Setting account balances back to zero...');
        const accsSnap = await getDocs(collection(db, 'accounts'));
        for (const docSnap of accsSnap.docs) {
          batch.update(docSnap.ref, {
            balance: 0,
            lastUpdated: Timestamp.now()
          });
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
        if (opCount > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }

      // 6. Purge Audit Trails
      setResetStep('Purging action audit trials...');
      const auditSnap = await getDocs(collection(db, 'audit_logs'));
      await safeDeleteDocs(auditSnap);
      if (opCount > 0) {
        await batch.commit();
      }

      // Post-reset log entry to mark the dynamic startup
      await logAction(
        profile, 
        'SYSTEM_RESET', 
        `Triggered a database reset to pristine factory settings in ${resetType} mode. All previous test operations reversed.`
      );

      toast.success('Database has been successfully initialized and prepared for production go-live!');
      setIsResetWizardOpen(false);
      setResetConfirmText('');
    } catch (e) {
      console.error("Reset Error:", e);
      toast.error('Could not complete database purge.');
    } finally {
      setIsResetting(false);
      setResetStep('');
    }
  };

  const handleUpdateProfile = async () => {
    try {
      const oldName = profile?.name;
      await updateProfile({ name: profileName });
      await logAction(profile, 'UPDATE_PROFILE', `Updated profile name from "${oldName}" to "${profileName}"`, profile?.id, 'user');
      setEditingProfile(false);
    } catch (error) {
      // Error handled in updateProfile
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvite.email.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'invites'), {
        ...newInvite,
        status: 'pending',
        invitedBy: profile?.id,
        createdAt: new Date()
      });
      await logAction(profile, 'SEND_INVITE', `Sent ${newInvite.role} invite to ${newInvite.email}`, docRef.id, 'invite');
      setNewInvite({ email: '', role: 'staff', locationId: '' });
      toast.success('Invite sent to ' + newInvite.email);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'invites');
    }
  };

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
        code: newPromo.code,
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
      toast.success('Promo created');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'promos');
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayment.name.trim()) return;

    if (paymentOptions.some(p => p.name.toLowerCase() === newPayment.name.trim().toLowerCase())) {
      toast.error('Payment option with this name already exists');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'paymentOptions'), newPayment);
      // Automatically create a financial account for this payment method
      await setDoc(doc(db, 'accounts', docRef.id), {
        name: newPayment.name,
        type: newPayment.type,
        balance: newPayment.initialBalance,
        lastUpdated: Timestamp.now()
      });
      await logAction(profile, 'CREATE_PAYMENT', `Created payment option and sync'd financial account with initial balance of ${newPayment.initialBalance}: ${newPayment.name}`, docRef.id, 'paymentOption');
      setNewPayment({ name: '', type: 'bank', active: true, initialBalance: 0 });
      toast.success('Payment option and financial account added');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'paymentOptions');
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
      toast.success('Promo updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'promos');
    }
  };

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    try {
      const { id, ...data } = editingPayment;
      await updateDoc(doc(db, 'paymentOptions', id), data);
      await logAction(profile, 'UPDATE_PAYMENT', `Updated payment: ${data.name}`, id, 'paymentOption');
      setEditingPayment(null);
      toast.success('Payment updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'paymentOptions');
    }
  };
  const handleUpdateUser = async (userId: string, data: Partial<UserProfile>) => {
    if (userId === profile?.id && data.role) {
      toast.error("You cannot change your own role");
      return;
    }
    try {
      const user = users.find(u => u.id === userId);
      await updateDoc(doc(db, 'users', userId), data);
      await logAction(profile, 'UPDATE_USER', `Updated settings for ${user?.email || userId}`, userId, 'user');
      toast.success('User updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const updateData: any = {
        name: editingUser.name || '',
        email: editingUser.email || '',
        role: editingUser.role || 'staff',
      };
      if (editingUser.locationId) {
        updateData.locationId = editingUser.locationId;
      } else {
        updateData.locationId = deleteField();
      }

      await updateDoc(doc(db, 'users', editingUser.id), updateData);
      await logAction(profile, 'UPDATE_USER', `Updated user account details for ${editingUser.email}`, editingUser.id, 'user');
      toast.success('User account updated successfully');
      setEditingUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const handleDelete = async (collectionName: string, id: string) => {
    const isAuthorized = isAdmin || isManager;
    
    if (!isAuthorized) {
      toast.error('You do not have permission to delete this');
      return;
    }
    
    let details = `Deleted item from ${collectionName}`;
    if (collectionName === 'invites') {
      const item = invites.find(i => i.id === id);
      details = `Cancelled invite for: ${item?.email}`;
    } else if (collectionName === 'users') {
      const item = users.find(u => u.id === id);
      details = `Removed user: ${item?.email}`;
    } else if (collectionName === 'paymentOptions') {
      const item = paymentOptions.find(p => p.id === id);
      details = `Deleted payment option: ${item?.name}`;
    } else if (collectionName === 'promos') {
      const item = promos.find(p => p.id === id);
      details = `Deleted promo code: ${item?.code}`;
    }

    if (window.confirm('Are you sure you want to delete this?')) {
      try {
        // If deleting a payment option, also delete its account or warn the user
        // The user request implies they are connected, so we delete both
        if (collectionName === 'paymentOptions') {
          await deleteDoc(doc(db, 'accounts', id));
          await logAction(profile, `DELETE_ACCOUNT`, `Deleted financial account sync'd with payment option: ${id}`, id, 'account');
        }

        await deleteDoc(doc(db, collectionName, id));
        await logAction(profile, `DELETE_${collectionName.toUpperCase().replace(/S$/, '')}`, details, id, collectionName.slice(0, -1));
        toast.success('Deleted successfully');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, collectionName);
      }
    }
  };

  const handleOpenRevertFromAudit = async (log: AuditLog) => {
    setRevertLog(log);
    setRevertEntityData(null);
    setRevertAccountId('');
    setIsRevertDialogOpen(true);

    try {
      if (log.action === 'RETURN_TRANSACTION' || log.action === 'VOID_RETURN') {
        const returnRef = doc(db, 'returnTransactions', log.entityId || '');
        const returnSnap = await getDoc(returnRef);
        if (returnSnap.exists()) {
          const returnData = { id: returnSnap.id, ...returnSnap.data() };
          setRevertEntityData(returnData);
          
          let defaultAccId = (returnData as any).refundAccountId || '';
          if (!defaultAccId && accounts.length > 0) {
            defaultAccId = accounts[0].id;
          }
          setRevertAccountId(defaultAccId);
        } else {
          setRevertEntityData({ id: log.entityId, parseFallback: true });
        }
      } else if (log.action === 'VOID_SALE' || log.action === 'CREATE_SALE' || log.action === 'CREATE_PENDING_SALE' || log.action === 'RESTORE_SALE' || log.action === 'MARK_SALE_PAID') {
        const saleRef = doc(db, 'sales', log.entityId || '');
        const saleSnap = await getDoc(saleRef);
        if (saleSnap.exists()) {
          const saleData = { id: saleSnap.id, ...saleSnap.data() };
          setRevertEntityData(saleData);

          let defaultAccId = (saleData as any).paymentMethod || '';
          if (!defaultAccId && accounts.length > 0) {
            defaultAccId = accounts[0].id;
          }
          setRevertAccountId(defaultAccId);
        } else {
          setRevertEntityData({ id: log.entityId, parseFallback: true });
        }
      } else if (log.action === 'RECEIVE_STOCK' || log.action === 'CREATE_PO' || log.action === 'VOID_PO') {
        const poRef = doc(db, 'purchaseOrders', log.entityId || '');
        const poSnap = await getDoc(poRef);
        if (poSnap.exists()) {
          const poData = { id: poSnap.id, ...poSnap.data() };
          setRevertEntityData(poData);
          
          let defaultAccId = (poData as any).paymentAccountId || '';
          if (!defaultAccId && accounts.length > 0) {
            defaultAccId = accounts[0].id;
          }
          setRevertAccountId(defaultAccId);
        } else {
          setRevertEntityData({ id: log.entityId, parseFallback: true });
        }
      } else if (log.action === 'STOCK_ADJUSTMENT') {
        const prodRef = doc(db, 'products', log.entityId || '');
        const prodSnap = await getDoc(prodRef);
        if (prodSnap.exists()) {
          setRevertEntityData({ id: log.entityId, name: prodSnap.data()?.name || 'Product', type: 'stock_adjustment' });
        } else {
          setRevertEntityData({ id: log.entityId, parseFallback: true, type: 'stock_adjustment' });
        }
      } else {
        setRevertEntityData({ id: log.entityId || 'system', details: log.details });
      }
    } catch (error) {
      console.error("Error fetching revert entity:", error);
      toast.error('Error loading transaction details.');
    }
  };

  const handleConfirmRevert = async () => {
    if (!revertLog || !revertEntityData) return;

    setIsReverting(true);
    try {
      const batch = writeBatch(db);

      if (revertLog.action === 'RETURN_TRANSACTION') {
        const returnToReverse = revertEntityData;
        
        if (returnToReverse.status === 'voided') {
          toast.error('This return transaction is already voided.');
          setIsReverting(false);
          return;
        }
        
        if (returnToReverse.totalRefund > 0) {
          if (!revertAccountId) {
            toast.error('Please select an account to adjust the refund');
            setIsReverting(false);
            return;
          }
          const account = accounts.find(a => a.id === revertAccountId);
          if (!account) {
            toast.error('Selected account not found');
            setIsReverting(false);
            return;
          }

          const accountRef = doc(db, 'accounts', revertAccountId);
          batch.update(accountRef, {
            balance: increment(returnToReverse.totalRefund),
            lastUpdated: Timestamp.now()
          });

          const newTransRef = doc(collection(db, 'financialTransactions'));
          batch.set(newTransRef, {
            amount: returnToReverse.totalRefund,
            type: 'income',
            accountId: revertAccountId,
            accountName: account.name,
            locationId: returnToReverse.locationId || null,
            locationName: locations.find(l => l.id === returnToReverse.locationId)?.name || null,
            category: 'Sales',
            description: `Audit Reversal: Cancelled refund from Return #${returnToReverse.id.substring(0, 8)}`,
            timestamp: Timestamp.now(),
            createdBy: profile?.id || 'anonymous',
            createdByName: profile?.name || 'Staff',
            accountBalance: (account.balance || 0) + returnToReverse.totalRefund
          });
        }

        if (returnToReverse.items) {
          for (const item of returnToReverse.items) {
            if (item.restock) {
              const productRef = doc(db, 'products', item.productId);
              batch.update(productRef, {
                stock: increment(-item.quantity),
                [`stocks.${returnToReverse.locationId}`]: increment(-item.quantity)
              });
            }
          }
        }

        const saleRef = doc(db, 'sales', returnToReverse.originalSaleId);
        const saleSnap = await getDoc(saleRef);
        if (saleSnap.exists()) {
          const saleData = saleSnap.data() as any;
          const updatedItems = saleData.items.map((item: any) => {
            const returnedItem = returnToReverse.items?.find((i: any) => i.productId === item.productId);
            if (returnedItem) {
              const currentReturned = item.returnedQuantity || 0;
              return {
                ...item,
                returnedQuantity: Math.max(0, currentReturned - returnedItem.quantity)
              };
            }
            return item;
          });

          const hasAnyReturnsLeft = updatedItems.some((i: any) => (i.returnedQuantity || 0) > 0);
          const newStatus = hasAnyReturnsLeft ? 'partially_returned' : 'completed';

          batch.update(saleRef, {
            items: updatedItems,
            status: newStatus,
            updatedAt: Timestamp.now()
          });
        } else {
          batch.update(saleRef, {
            status: 'completed',
            updatedAt: Timestamp.now()
          });
        }

        const returnRef = doc(db, 'returnTransactions', returnToReverse.id);
        batch.update(returnRef, {
          status: 'voided',
          updatedAt: Timestamp.now()
        });

        await batch.commit();

        await logAction(
          profile, 
          'VOID_RETURN', 
          `Voided Return #${returnToReverse.id.substring(0, 8)} for Sale #${returnToReverse.originalSaleId.substring(0, 8)} via Audit Log reversion`, 
          returnToReverse.id, 
          'return'
        );

        toast.success(`Return transaction ${returnToReverse.id.substring(0, 6)} reversed and sales restored successfully.`);
      } 
      else if (revertLog.action === 'VOID_RETURN') {
        const returnToRestore = revertEntityData;
        if (returnToRestore.status !== 'voided') {
          toast.error('This return transaction is not voided.');
          setIsReverting(false);
          return;
        }

        const returnRef = doc(db, 'returnTransactions', returnToRestore.id);
        batch.update(returnRef, {
          status: 'completed',
          updatedAt: Timestamp.now()
        });

        if (returnToRestore.items) {
          for (const item of returnToRestore.items) {
            if (item.restock) {
              const productRef = doc(db, 'products', item.productId);
              batch.update(productRef, {
                stock: increment(item.quantity),
                [`stocks.${returnToRestore.locationId}`]: increment(item.quantity)
              });
            }
          }
        }

        if (revertAccountId && returnToRestore.totalRefund > 0) {
          const account = accounts.find(a => a.id === revertAccountId);
          if (account) {
            const accountRef = doc(db, 'accounts', revertAccountId);
            batch.update(accountRef, {
              balance: increment(-returnToRestore.totalRefund),
              lastUpdated: Timestamp.now()
            });

            const newTransRef = doc(collection(db, 'financialTransactions'));
            batch.set(newTransRef, {
              amount: returnToRestore.totalRefund,
              type: 'expense',
              accountId: revertAccountId,
              accountName: account.name,
              locationId: returnToRestore.locationId || null,
              category: 'Returns',
              description: `Audit Reversal: Re-applied Refund for Return #${returnToRestore.id.substring(0, 8)}`,
              timestamp: Timestamp.now(),
              createdBy: profile?.id || 'anonymous',
              accountBalance: (account.balance || 0) - returnToRestore.totalRefund
            });
          }
        }

        await batch.commit();
        await logAction(profile, 'RETURN_TRANSACTION', `Reversed void return: Restored Return #${returnToRestore.id.substring(0, 8)}`, returnToRestore.id, 'return');
        toast.success('Return transaction status restored to completed.');
      }
      else if (revertLog.action === 'VOID_SALE') {
        const saleToRestore = revertEntityData;
        
        if (saleToRestore.status !== 'voided') {
          toast.error('This sale is not voided.');
          setIsReverting(false);
          return;
        }

        for (const item of saleToRestore.items) {
          const productRef = doc(db, 'products', item.productId);
          batch.update(productRef, {
            stock: increment(-item.quantity),
            [`stocks.${saleToRestore.locationId}`]: increment(-item.quantity)
          });
        }

        const saleRef = doc(db, 'sales', saleToRestore.id);
        batch.update(saleRef, {
          status: 'completed',
          updatedAt: Timestamp.now()
        });

        if (revertAccountId) {
          const account = accounts.find(a => a.id === revertAccountId);
          if (account) {
            const accountRef = doc(db, 'accounts', revertAccountId);
            batch.update(accountRef, {
              balance: increment(saleToRestore.total),
              lastUpdated: Timestamp.now()
            });

            const newTransRef = doc(collection(db, 'financialTransactions'));
            batch.set(newTransRef, {
              amount: saleToRestore.total,
              type: 'income',
              accountId: revertAccountId,
              accountName: account.name,
              locationId: saleToRestore.locationId || null,
              locationName: locations.find(l => l.id === saleToRestore.locationId)?.name || null,
              category: 'Sales',
              description: `Restored Sale from Audit: Sale #${saleToRestore.id.substring(0, 8)}`,
              timestamp: Timestamp.now(),
              createdBy: profile?.id || 'anonymous',
              createdByName: profile?.name || 'Staff',
              accountBalance: (account.balance || 0) + saleToRestore.total
            });
          }
        }

        await batch.commit();
        await logAction(profile, 'RESTORE_SALE', `Unvoided/restored sale: ${saleToRestore.id} via Audit Log reversion`, saleToRestore.id, 'sale');
        toast.success('Sale restored successfully. Stock has been re-deducted and payments restored.');
      }
      else if (revertLog.action === 'CREATE_SALE' || revertLog.action === 'CREATE_PENDING_SALE') {
        const saleToVoid = revertEntityData;
        
        if (saleToVoid.status === 'voided') {
          toast.error('This sale is already voided.');
          setIsReverting(false);
          return;
        }

        if (saleToVoid.items && saleToVoid.stockDeducted !== false) {
          for (const item of saleToVoid.items) {
            const prodId = item.productId || (item as any).id;
            if (!prodId) continue;
            const returnedQty = item.returnedQuantity || 0;
            const netQtyToReturn = Math.max(0, item.quantity - returnedQty);
            if (netQtyToReturn <= 0) continue;

            const productRef = doc(db, 'products', prodId);
            const stockUpdates: Record<string, any> = {
              stock: increment(netQtyToReturn),
              updatedAt: Timestamp.now()
            };
            if (saleToVoid.locationId) {
              stockUpdates[`stocks.${saleToVoid.locationId}`] = increment(netQtyToReturn);
            }
            batch.update(productRef, stockUpdates);
          }
        }

        const saleRef = doc(db, 'sales', saleToVoid.id);
        batch.update(saleRef, {
          status: 'voided',
          stockDeducted: false,
          updatedAt: Timestamp.now()
        });

        if (revertAccountId && saleToVoid.total > 0) {
          const account = accounts.find(a => a.id === revertAccountId);
          if (account) {
            const accountRef = doc(db, 'accounts', revertAccountId);
            batch.update(accountRef, {
              balance: increment(-saleToVoid.total),
              lastUpdated: Timestamp.now()
            });

            const newTransRef = doc(collection(db, 'financialTransactions'));
            batch.set(newTransRef, {
              amount: saleToVoid.total,
              type: 'expense',
              accountId: revertAccountId,
              accountName: account.name,
              locationId: saleToVoid.locationId || null,
              locationName: locations.find(l => l.id === saleToVoid.locationId)?.name || null,
              category: 'Voided Sale',
              description: `Voided Sale via Audit: Sale #${saleToVoid.id.substring(0, 8)}`,
              timestamp: Timestamp.now(),
              createdBy: profile?.id || 'anonymous',
              createdByName: profile?.name || 'Staff',
              accountBalance: (account.balance || 0) - saleToVoid.total,
              reference: saleToVoid.id,
              saleId: saleToVoid.id,
              isVoidTransaction: true
            });
          }
        }

        await batch.commit();
        await logAction(profile, 'VOID_SALE', `Voided sale: ${saleToVoid.id} via Audit Log reversion`, saleToVoid.id, 'sale');
        toast.success('Sale successfully voided. Stock returned, account deducted.');
      }
      else if (revertLog.action === 'STOCK_ADJUSTMENT') {
        const adjSnap = await getDocs(
          query(
            collection(db, 'stockAdjustments'), 
            where('productId', '==', revertLog.entityId)
          )
        );

        if (!adjSnap.empty) {
          const sortedDocs = adjSnap.docs.slice().sort((a, b) => {
            const tA = a.data().timestamp?.toMillis ? a.data().timestamp.toMillis() : (a.data().timestamp?.toDate ? a.data().timestamp.toDate().getTime() : 0);
            const tB = b.data().timestamp?.toMillis ? b.data().timestamp.toMillis() : (b.data().timestamp?.toDate ? b.data().timestamp.toDate().getTime() : 0);
            return tB - tA;
          });
          const adjDoc = sortedDocs[0];
          const adjData = adjDoc.data();
          const pId = adjData.productId;
          const locId = adjData.locationId;
          const prev = adjData.previousStock || 0;
          const qty = adjData.adjustmentQuantity || 0;
          const type = adjData.type;

          const productRef = doc(db, 'products', pId);

          let undoDelta = -qty;
          if (type === 'subtract' && qty > 0) {
            undoDelta = qty;
          }

          batch.update(productRef, {
            stock: increment(undoDelta),
            [`stocks.${locId}`]: increment(undoDelta),
            updatedAt: Timestamp.now()
          });

          batch.delete(adjDoc.ref);
          await batch.commit();
          await logAction(profile, 'STOCK_ADJUSTMENT_REVERTED', `Reverted stock adjustment to ${adjData.productName}`, pId, 'product');
          toast.success('Stock adjustment reversed. Levels restored.');
        } else {
          const details = revertLog.details;
          let parsedQty = 0;
          let isAdd = true;
          if (details.includes('add')) {
            const match = details.match(/add (\d+)/);
            if (match) { parsedQty = parseInt(match[1]); isAdd = true; }
          } else if (details.includes('subtract')) {
            const match = details.match(/subtract (\d+)/);
            if (match) { parsedQty = parseInt(match[1]); isAdd = false; }
          }

          if (parsedQty > 0) {
            const productRef = doc(db, 'products', revertLog.entityId || '');
            const undoVal = isAdd ? -parsedQty : parsedQty;
            const updatePayload: any = {
              stock: increment(undoVal),
              updatedAt: Timestamp.now()
            };
            if (revertLog.locationId) {
              updatePayload[`stocks.${revertLog.locationId}`] = increment(undoVal);
            }
            batch.update(productRef, updatePayload);
            await batch.commit();
            await logAction(profile, 'STOCK_ADJUSTMENT_REVERTED', `Reverted stock adjustment for product`, revertLog.entityId || 'system', 'product');
            toast.success(`Stock levels adjusted by ${undoVal} to offset.`);
          } else {
            toast.error('Could not find specific stock adjustment record.');
            setIsReverting(false);
            return;
          }
        }
      }
      else if (revertLog.action === 'RECEIVE_STOCK') {
        const po = revertEntityData;
        if (po.status !== 'received') {
          toast.error('This PO status is not received.');
          setIsReverting(false);
          return;
        }

        if (po.items) {
          for (const item of po.items) {
            const productRef = doc(db, 'products', item.productId);
            batch.update(productRef, {
              stock: increment(-item.quantity),
              [`stocks.${po.locationId}`]: increment(-item.quantity)
            });
          }
        }

        const poRef = doc(db, 'purchaseOrders', po.id);
        batch.update(poRef, {
          status: 'ordered',
          updatedAt: Timestamp.now()
        });

        if (revertAccountId && po.totalAmount > 0) {
          const account = accounts.find(a => a.id === revertAccountId);
          if (account) {
            const accountRef = doc(db, 'accounts', revertAccountId);
            batch.update(accountRef, {
              balance: increment(po.totalAmount),
              lastUpdated: Timestamp.now()
            });

            const newTransRef = doc(collection(db, 'financialTransactions'));
            batch.set(newTransRef, {
              amount: po.totalAmount,
              type: 'income',
              accountId: revertAccountId,
              accountName: account.name,
              locationId: po.locationId || null,
              category: 'Supplies',
              description: `Reverted PO Stock Receipt: PO #${po.poNumber}`,
              timestamp: Timestamp.now(),
              createdBy: profile?.id || 'anonymous',
              accountBalance: (account.balance || 0) + po.totalAmount
            });
          }
        }

        await batch.commit();
        await logAction(profile, 'VOID_PO', `Voided stock receipt for PO: ${po.poNumber} via Reversion`, po.id, 'purchaseOrder');
        toast.success('PO Stock Receipt reversed successfully. Stock decremented.');
      }
      else if (revertLog.action === 'CREATE_PO') {
        const po = revertEntityData;
        const poRef = doc(db, 'purchaseOrders', po.id);
        batch.update(poRef, {
          status: 'cancelled',
          updatedAt: Timestamp.now()
        });
        await batch.commit();
        await logAction(profile, 'CANCEL_PO', `Cancelled PO creation: ${po.poNumber}`, po.id, 'purchaseOrder');
        toast.success('PO has been cancelled.');
      }
      else if (revertLog.action === 'VOID_PO') {
        const po = revertEntityData;
        const poRef = doc(db, 'purchaseOrders', po.id);
        batch.update(poRef, {
          status: 'ordered',
          updatedAt: Timestamp.now()
        });
        await batch.commit();
        await logAction(profile, 'CREATE_PO', `Restored cancelled PO: ${po.poNumber}`, po.id, 'purchaseOrder');
        toast.success('PO has been unvoided / set back as ordered.');
      }
      else if (revertLog.action.startsWith('CREATE_')) {
        let collectionName = '';
        const act = revertLog.action;
        if (act === 'CREATE_PRODUCT') collectionName = 'products';
        else if (act === 'CREATE_CUSTOMER') collectionName = 'customers';
        else if (act === 'CREATE_LOCATION') collectionName = 'locations';
        else if (act === 'CREATE_SUPPLIER') collectionName = 'suppliers';
        else if (act === 'CREATE_BRAND') collectionName = 'brands';
        else if (act === 'CREATE_CATEGORY') collectionName = 'categories';
        else if (act === 'CREATE_PRICE_TIER') collectionName = 'priceTiers';
        else if (act === 'CREATE_PROMO') collectionName = 'promos';
        else if (act === 'CREATE_PAYMENT') collectionName = 'paymentOptions';
        else if (act === 'CREATE_ACCOUNT') collectionName = 'accounts';

        if (collectionName && revertLog.entityId) {
          batch.delete(doc(db, collectionName, revertLog.entityId));
          await batch.commit();
          await logAction(profile, 'REVERT_CREATION', `Reverted creation: ${revertLog.details}`, revertLog.entityId, collectionName.slice(0, -1));
          toast.success(`Successfully deleted newly-created ${collectionName.slice(0, -1)} entry.`);
        } else {
          toast.error('This action creation cannot be automatically deleted.');
          setIsReverting(false);
          return;
        }
      }
      else if (revertLog.action.startsWith('DELETE_')) {
        let collectionName = '';
        const act = revertLog.action;
        if (act === 'DELETE_PRODUCT') collectionName = 'products';
        else if (act === 'DELETE_CUSTOMER') collectionName = 'customers';
        else if (act === 'DELETE_LOCATION') collectionName = 'locations';
        else if (act === 'DELETE_SUPPLIER') collectionName = 'suppliers';
        else if (act === 'DELETE_BRAND') collectionName = 'brands';
        else if (act === 'DELETE_CATEGORY') collectionName = 'categories';
        else if (act === 'DELETE_PRICE_TIER') collectionName = 'priceTiers';
        else if (act === 'DELETE_PROMO') collectionName = 'promos';
        else if (act === 'DELETE_PAYMENT') collectionName = 'paymentOptions';
        else if (act === 'DELETE_ACCOUNT') collectionName = 'accounts';

        if (collectionName && revertLog.entityId) {
          const details = revertLog.details || '';
          const dataToRestore: any = {
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
          };

          if (collectionName === 'products') {
            const match = details.match(/Deleted product: (.*?) \(SKU: (.*?)\)/);
            if (match) {
              dataToRestore.name = match[1];
              dataToRestore.sku = match[2];
            } else {
              dataToRestore.name = details.replace('Deleted product: ', '');
              dataToRestore.sku = 'RESTORED';
            }
            dataToRestore.stock = 0;
            dataToRestore.stocks = {};
            dataToRestore.price = 0;
          } 
          else if (collectionName === 'paymentOptions') {
            const name = details.split(': ').pop() || 'Restored Method';
            dataToRestore.name = name;
            dataToRestore.type = 'ewallet';
            dataToRestore.initialBalance = 0;
          }
          else if (collectionName === 'accounts') {
            const name = details.split(': ').pop()?.split(' with ')[0] || 'Restored Account';
            dataToRestore.name = name;
            dataToRestore.balance = 0;
            dataToRestore.type = 'bank';
          }
          else if (collectionName === 'customers') {
            dataToRestore.name = details.replace('Deleted customer: ', '');
            dataToRestore.city = 'Restored';
          }
          else {
            const nameVal = details.split(': ').pop() || 'Restored Record';
            dataToRestore.name = nameVal;
          }

          await setDoc(doc(db, collectionName, revertLog.entityId), dataToRestore);
          await logAction(profile, 'REVERT_DELETION', `Re-created deleted entry: ${revertLog.details}`, revertLog.entityId, collectionName.slice(0, -1));
          toast.success(`Successfully restored deleted record: ${dataToRestore.name || 'entry'}.`);
        } else {
          toast.error('Reversing deletion not supported for this entity.');
          setIsReverting(false);
          return;
        }
      }
      else if (revertLog.action.startsWith('UPDATE_')) {
        toast.info(`Please make manual edits inside the relevant Catalog module for targeting precise property revisions.`);
      }

      setIsRevertDialogOpen(false);
      setRevertLog(null);
      setRevertEntityData(null);
    } catch (error) {
      console.error("Error confirming audit reversion:", error);
      toast.error('Reversal failed: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-4xl font-bold text-primary tracking-tight font-heading">
          {isAdmin ? 'System' : 'My Profile'}
        </h1>
        <p className="text-muted-foreground">
          {isAdmin ? 'Manage system configurations and user access.' : 'View and update your profile details.'}
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        {isAdmin && (
          <TabsList className="bg-secondary p-1 rounded-xl">
            <TabsTrigger value="profile" className="gap-2 rounded-lg px-6">
              <User className="w-4 h-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2 rounded-lg px-6">
              <Users className="w-4 h-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="system" className="gap-2 rounded-lg px-6">
              <Shield className="w-4 h-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2 rounded-lg px-6">
              <History className="w-4 h-4" />
              Audit
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="profile">
          <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="font-heading text-2xl">User Profile</CardTitle>
                <CardDescription>Your personal information and role.</CardDescription>
              </div>
              {!editingProfile ? (
                <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)} className="gap-2">
                  <Edit2 className="w-4 h-4" />
                  Edit Profile
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingProfile(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                  <Button variant="default" size="sm" onClick={handleUpdateProfile} className="gap-2">
                    <Check className="w-4 h-4" />
                    Save
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input 
                    value={editingProfile ? profileName : (profile?.name || '')} 
                    onChange={(e) => setProfileName(e.target.value)}
                    readOnly={!editingProfile} 
                    className={cn("bg-secondary/50 border-none", !editingProfile && "cursor-not-allowed")} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input value={profile?.email || ''} readOnly className="bg-secondary/50 border-none cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value={profile?.role || ''} readOnly className="bg-secondary/50 border-none cursor-not-allowed capitalize" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-4 border-none shadow-sm bg-white/50 backdrop-blur-sm h-fit">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-slate-900">Invite User</CardTitle>
                <CardDescription>Send an invitation to join the application.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSendInvite} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-700">Email Address</Label>
                    <Input 
                      type="email"
                      value={newInvite.email}
                      onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                      placeholder="e.g. colleague@example.com"
                      className="bg-white border-slate-200"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-700">Role</Label>
                    <Select 
                      value={newInvite.role} 
                      onValueChange={(v: 'admin' | 'manager' | 'staff') => setNewInvite({ ...newInvite, role: v })}
                    >
                      <SelectTrigger className="bg-white border-slate-200">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrator</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-700">Assigned Location</Label>
                    <Select 
                      value={newInvite.locationId} 
                      onValueChange={(v) => setNewInvite({ ...newInvite, locationId: v })}
                    >
                      <SelectTrigger className="bg-white border-slate-200">
                        <SelectValue placeholder="Select a location">
                          {newInvite.locationId === 'none' ? 'No specific location' : (locations.find(l => l.id === newInvite.locationId)?.name || 'Select a location')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No specific location</SelectItem>
                        {locations.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full gap-2 bg-[#1A2B4B] hover:bg-[#1A2B4B]/90 text-white font-medium">
                    <Mail className="w-4 h-4" />
                    Send Invitation
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="lg:col-span-8 border-none shadow-sm bg-white">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-900">Active Users & Invites</CardTitle>
                    <CardDescription>Manage user permissions, roles, and branch assignments.</CardDescription>
                  </div>
                  <Badge variant="secondary" className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100">
                    {users.length} {users.length === 1 ? 'User' : 'Users'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Users</h4>
                  </div>
                  <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-xs bg-white">
                    <Table>
                      <TableHeader className="bg-slate-50/90">
                        <TableRow className="hover:bg-transparent border-slate-200/80">
                          <TableHead className="font-bold text-slate-700 text-xs uppercase tracking-wider py-3">User</TableHead>
                          <TableHead className="font-bold text-slate-700 text-xs uppercase tracking-wider py-3">Branch Location</TableHead>
                          <TableHead className="font-bold text-slate-700 text-xs uppercase tracking-wider py-3">Role</TableHead>
                          <TableHead className="font-bold text-slate-700 text-xs uppercase tracking-wider py-3 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center text-slate-500 italic">
                              No users found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          users.map(u => {
                            const isCurrentUser = u.id === profile?.id;
                            const initials = (u.name || u.email || 'U').slice(0, 2).toUpperCase();
                            return (
                              <TableRow key={u.id} className="hover:bg-slate-50/60 transition-colors border-slate-100">
                                <TableCell className="py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                                      {initials}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-slate-900 text-sm truncate">{u.name || 'Unnamed User'}</span>
                                        {isCurrentUser && (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200 font-semibold">
                                            You
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                
                                <TableCell className="py-3">
                                  <Select 
                                    value={u.locationId || 'none'} 
                                    onValueChange={(v: string) => handleUpdateUser(u.id, { locationId: v === 'none' ? deleteField() as any : v })}
                                  >
                                    <SelectTrigger className="w-[150px] h-8 text-xs bg-white border-slate-200 font-medium">
                                      <SelectValue placeholder="Location">
                                        {u.locationId ? (locations.find(l => l.id === u.locationId)?.name || 'Location') : 'No Location'}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No Location</SelectItem>
                                      {locations.map(loc => (
                                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>

                                <TableCell className="py-3">
                                  <Select 
                                    value={u.role} 
                                    onValueChange={(v: 'admin' | 'manager' | 'staff') => handleUpdateUser(u.id, { role: v })}
                                    disabled={isCurrentUser}
                                  >
                                    <SelectTrigger className="w-[110px] h-8 text-xs bg-white border-slate-200 font-medium">
                                      <SelectValue>
                                        {u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : ''}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="admin">Admin</SelectItem>
                                      <SelectItem value="manager">Manager</SelectItem>
                                      <SelectItem value="staff">Staff</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>

                                <TableCell className="py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      className="h-8 text-xs font-semibold gap-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 border-slate-200"
                                      onClick={() => setEditingUser(u)}
                                    >
                                      <Edit2 className="w-3.5 h-3.5" /> Edit
                                    </Button>
                                    {!isCurrentUser && (
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDelete('users', u.id);
                                        }}
                                        title="Delete User"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Invitations</h4>
                    {invites.filter(i => i.status === 'pending').length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {invites.filter(i => i.status === 'pending').length} Pending
                      </Badge>
                    )}
                  </div>

                  {invites.filter(i => i.status === 'pending').length === 0 ? (
                    <div className="p-5 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <p className="text-xs text-slate-500 italic">No pending invitations.</p>
                    </div>
                  ) : (
                    <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-xs bg-white">
                      <Table>
                        <TableHeader className="bg-slate-50/90">
                          <TableRow className="hover:bg-transparent border-slate-200/80">
                            <TableHead className="font-bold text-slate-700 text-xs uppercase tracking-wider py-2.5">Email Address</TableHead>
                            <TableHead className="font-bold text-slate-700 text-xs uppercase tracking-wider py-2.5">Role</TableHead>
                            <TableHead className="font-bold text-slate-700 text-xs uppercase tracking-wider py-2.5">Status</TableHead>
                            <TableHead className="font-bold text-slate-700 text-xs uppercase tracking-wider py-2.5 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invites.filter(i => i.status === 'pending').map(inv => (
                            <TableRow key={inv.id} className="hover:bg-slate-50/60 transition-colors border-slate-100">
                              <TableCell className="py-2.5 font-medium text-slate-900 text-xs">
                                {inv.email}
                              </TableCell>
                              <TableCell className="py-2.5 text-xs text-slate-600 capitalize">
                                {inv.role}
                              </TableCell>
                              <TableCell className="py-2.5">
                                <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] font-semibold">
                                  Pending
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2.5 text-right">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete('invites', inv.id);
                                  }}
                                >
                                  <X className="w-3.5 h-3.5" /> Revoke
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="system">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-2xl">System Information</CardTitle>
              <CardDescription>Advanced system details and maintenance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-5 bg-secondary/50 rounded-2xl border border-border">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Database className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-primary">Cloud Sync Status</p>
                    <p className="text-xs text-muted-foreground">All data is currently synchronized with the cloud.</p>
                  </div>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Online</Badge>
              </div>
              <div className="flex items-center justify-between p-5 bg-secondary/50 rounded-2xl border border-border">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-primary">Security Rules</p>
                    <p className="text-xs text-muted-foreground">Firestore security rules are active and protecting data.</p>
                  </div>
                </div>
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-5 bg-secondary/50 rounded-2xl border border-border">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Coins className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-primary">System Currency</p>
                    <p className="text-xs text-muted-foreground">Select the currency symbol used across the system.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select 
                    value={settings.currency} 
                    onValueChange={(val) => {
                      updateCurrency(val);
                      toast.success(`Currency updated to ${val}`);
                    }}
                  >
                    <SelectTrigger className="w-[100px] bg-white">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="₱">₱ (PHP)</SelectItem>
                      <SelectItem value="$">$ (USD)</SelectItem>
                      <SelectItem value="€">€ (EUR)</SelectItem>
                      <SelectItem value="£">£ (GBP)</SelectItem>
                      <SelectItem value="¥">¥ (JPY)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isAdmin && (
                <div className="border border-border rounded-2xl p-5 bg-slate-50/50 mt-2 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-200">
                      <Database className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Database Backup &amp; Restore</p>
                      <p className="text-xs text-slate-500 max-w-lg">
                        Export your entire storefront catalog and historical ledger records into an offline JSON backup file, or restore existing snapshots from local storage to recover lost data.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBackupData}
                      disabled={isBackingUp || isRestoring}
                      className="gap-2 font-semibold shadow-sm text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50 border-indigo-200"
                    >
                      <Download className="w-4 h-4" />
                      {isBackingUp ? (backupProgress || 'Exporting...') : 'Export JSON Backup'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRestoreFile(null);
                        setRestoreConfirmText('');
                        setIsRestoreModalOpen(true);
                      }}
                      disabled={isBackingUp || isRestoring || isReconciling}
                      className="gap-2 font-semibold shadow-sm text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200"
                    >
                      <Upload className="w-4 h-4" />
                      Import &amp; Restore Backup
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleManualReconcile}
                      disabled={isBackingUp || isRestoring || isReconciling || isMigratingSupabase}
                      className="gap-2 font-semibold shadow-sm text-slate-700 hover:text-slate-800 hover:bg-slate-100 border-slate-200"
                    >
                      <RefreshCw className={cn("w-4 h-4", isReconciling && "animate-spin")} />
                      {isReconciling ? 'Reconciling Data...' : 'Reconcile Data'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleMigrateToSupabase}
                      disabled={isBackingUp || isRestoring || isReconciling || isMigratingSupabase}
                      className="gap-2 font-semibold shadow-sm text-sky-700 hover:text-sky-800 hover:bg-sky-50 border-sky-200"
                    >
                      <RefreshCw className={cn("w-4 h-4", isMigratingSupabase && "animate-spin")} />
                      {isMigratingSupabase ? 'Syncing to Supabase...' : 'Sync Firestore to Supabase'}
                    </Button>
                  </div>
                </div>
              )}

              {isAdmin && (
                <div className="flex items-center justify-between p-5 bg-rose-50/40 rounded-2xl border border-rose-100 mt-2">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-white rounded-lg shadow-sm border border-rose-100">
                      <Trash2 className="w-5 h-5 text-rose-600" />
                    </div>
                    <div>
                      <p className="font-bold text-rose-950">Go-Live / Production Reset Wizard</p>
                      <p className="text-xs text-rose-800/80">Purge initial test transactions, log data, and stock figures to prepare for real-world storefront usage.</p>
                    </div>
                  </div>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => {
                      setResetConfirmText('');
                      setIsResetWizardOpen(true);
                    }}
                    className="gap-2 font-semibold shadow-sm hover:bg-rose-600 bg-rose-500"
                  >
                    Reset for Production
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 font-heading text-2xl">
                    <History className="w-6 h-6 text-primary" />
                    Audit Trail
                  </CardTitle>
                  <CardDescription>Real-time log of all system movements, stock adjustments, and user actions.</CardDescription>
                </div>
                <div className="text-xs text-muted-foreground font-medium bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 self-start md:self-auto">
                  Showing <span className="font-bold text-slate-900">{filteredAuditLogs.length}</span> of <span className="font-bold text-slate-900">{auditLogs.length}</span> logs
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Searchbar and Date Filters */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  {/* Search Input */}
                  <div className="md:col-span-5 space-y-1.5">
                    <Label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-slate-400" /> Search Audit Logs
                    </Label>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="Search user, action, details, or product..."
                        value={auditSearch}
                        onChange={e => setAuditSearch(e.target.value)}
                        className="pl-9 pr-8 bg-white border-slate-200 h-9 text-xs focus-visible:ring-1 focus-visible:ring-slate-400"
                      />
                      {auditSearch && (
                        <button
                          type="button"
                          onClick={() => setAuditSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Date Range Inputs */}
                  <div className="md:col-span-5 grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> Start Date
                      </Label>
                      <Input
                        type="date"
                        value={auditStartDate}
                        onChange={e => setAuditStartDate(e.target.value)}
                        className="bg-white border-slate-200 h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> End Date
                      </Label>
                      <Input
                        type="date"
                        value={auditEndDate}
                        onChange={e => setAuditEndDate(e.target.value)}
                        className="bg-white border-slate-200 h-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* Clear Button */}
                  <div className="md:col-span-2 flex items-center justify-end">
                    {(auditSearch || auditStartDate || auditEndDate) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAuditSearch('');
                          setAuditStartDate('');
                          setAuditEndDate('');
                        }}
                        className="h-9 px-3 text-xs font-semibold border-slate-200 hover:bg-slate-100 text-slate-600 flex items-center gap-1.5 w-full md:w-auto justify-center"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
                      </Button>
                    ) : (
                      <div className="hidden md:block h-9" />
                    )}
                  </div>
                </div>

                {/* Quick Date Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/60 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                    <Filter className="w-3 h-3" /> Quick Presets:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setAuditStartDate(today);
                      setAuditEndDate(today);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                      auditStartDate === new Date().toISOString().split('T')[0] && auditEndDate === new Date().toISOString().split('T')[0]
                        ? 'bg-[#1A2B4B] text-white border-[#1A2B4B]'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setDate(end.getDate() - 7);
                      setAuditStartDate(start.toISOString().split('T')[0]);
                      setAuditEndDate(end.toISOString().split('T')[0]);
                    }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white border border-slate-200 hover:border-slate-300 text-slate-600 transition-all"
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setDate(end.getDate() - 30);
                      setAuditStartDate(start.toISOString().split('T')[0]);
                      setAuditEndDate(end.toISOString().split('T')[0]);
                    }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white border border-slate-200 hover:border-slate-300 text-slate-600 transition-all"
                  >
                    Last 30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuditStartDate('');
                      setAuditEndDate('');
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                      !auditStartDate && !auditEndDate
                        ? 'bg-[#1A2B4B] text-white border-[#1A2B4B]'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    All Time
                  </button>
                </div>
              </div>

              {/* Table Section */}
              <div className="rounded-2xl border border-border overflow-hidden bg-white shadow-xs">
                <div className="grid grid-cols-12 bg-slate-100/90 p-3.5 border-b border-border text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <div className="col-span-2">User</div>
                  <div className="col-span-2">Action</div>
                  <div className="col-span-2">Product Involved</div>
                  <div className="col-span-3">Details</div>
                  <div className="col-span-2 text-right pr-2">Time</div>
                  <div className="col-span-1 text-right">Revert</div>
                </div>
                <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                  {filteredAuditLogs.length === 0 && (
                    <div className="p-12 text-center text-muted-foreground italic">
                      {auditLogs.length === 0 ? "No audit logs found." : "No audit logs match your search or date filters."}
                    </div>
                  )}
                  {filteredAuditLogs.map((log) => {
                    const nonRevertible = ['LOGIN', 'LOGOUT', 'SYNC_STOCK', 'SEND_INVITE', 'TIME_IN', 'TIME_OUT'];
                    const isRevertible = !nonRevertible.includes(log.action);
                    const productName = getProductNameFromLog(log, products, sales);

                    return (
                      <div key={log.id} className="grid grid-cols-12 p-3.5 text-xs items-center hover:bg-slate-50/80 transition-colors">
                        <div className="flex flex-col col-span-2 pr-2">
                          <span className="font-bold text-slate-900 truncate" title={log.userName}>{log.userName}</span>
                          <span className="text-[10px] text-slate-400 truncate" title={log.userEmail}>{log.userEmail}</span>
                        </div>
                        <div className="col-span-2 pr-2">
                          <Badge variant="outline" className="text-[10px] font-mono bg-white border-slate-200 text-slate-700">
                            {log.action}
                          </Badge>
                        </div>
                        <div className="col-span-2 pr-2">
                          {productName ? (
                            <Badge variant="outline" className="bg-indigo-50/90 text-indigo-700 border-indigo-200/80 text-[10px] font-semibold truncate max-w-[130px] inline-flex items-center gap-1" title={productName}>
                              <Package className="w-3 h-3 shrink-0 text-indigo-500" />
                              <span className="truncate">{productName}</span>
                            </Badge>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">-</span>
                          )}
                        </div>
                        <div className="text-slate-600 pr-3 truncate col-span-3 font-normal" title={log.details}>
                          {log.details}
                        </div>
                        <div className="text-right text-[11px] text-slate-400 col-span-2 block pr-2 font-mono">
                          {log.timestamp?.toDate().toLocaleString()}
                        </div>
                        <div className="text-right col-span-1 flex items-center justify-end">
                          {isRevertible && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 text-[10px] font-bold uppercase tracking-wider py-1 px-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-all flex items-center justify-center gap-1"
                              onClick={() => handleOpenRevertFromAudit(log)}
                            >
                              <Undo2 className="w-3 h-3" />
                              Revert
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isRevertDialogOpen} onOpenChange={(open) => !open && setIsRevertDialogOpen(false)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-lg text-rose-600">
              <Undo2 className="w-5 h-5 text-rose-500" />
              Revert {revertLog?.action.replace(/_/g, ' ')}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to retract/reverse this processed action? This operation will restore status, adjust inventories, and revert financial transactions.
            </DialogDescription>
          </DialogHeader>

          {revertLog && revertEntityData ? (
            <div className="space-y-4 py-4 border-t border-b border-border my-2 text-sm text-slate-700">
              <div className="grid grid-cols-3 gap-1">
                <span className="font-semibold text-muted-foreground">Log ID:</span>
                <span className="col-span-2 font-mono text-xs">{revertLog.id.substring(0, 8)}</span>
                
                <span className="font-semibold text-muted-foreground">Original ID:</span>
                <span className="col-span-2 font-mono text-xs">{revertLog.entityId?.substring(0, 8) || 'N/A'}</span>

                <span className="font-semibold text-muted-foreground">Details:</span>
                <span className="col-span-2 text-slate-900">{revertLog.details}</span>

                {revertLog.action === 'RETURN_TRANSACTION' && (
                  <>
                    <span className="font-semibold text-muted-foreground">Refunded Amount:</span>
                    <span className="col-span-2 text-rose-600 font-bold">{settings.currency}{revertEntityData.totalRefund?.toFixed(2)}</span>
                    
                    <span className="font-semibold text-muted-foreground">Current Status:</span>
                    <span className="col-span-2">
                      <Badge variant={revertEntityData.status === 'voided' ? 'destructive' : 'outline'} className="text-[10px] font-mono uppercase">
                        {revertEntityData.status || 'active'}
                      </Badge>
                    </span>
                  </>
                )}

                {revertLog.action === 'VOID_SALE' && (
                  <>
                    <span className="font-semibold text-muted-foreground">Sale Total:</span>
                    <span className="col-span-2 text-primary font-bold">{settings.currency}{revertEntityData.total?.toFixed(2)}</span>
                    
                    <span className="font-semibold text-muted-foreground">Current Status:</span>
                    <span className="col-span-2">
                      <Badge variant={revertEntityData.status === 'voided' ? 'destructive' : 'outline'} className="text-[10px] font-mono uppercase">
                        {revertEntityData.status}
                      </Badge>
                    </span>
                  </>
                )}
              </div>

              <div className="mt-2 text-xs text-muted-foreground leading-relaxed p-3 rounded-lg bg-orange-50 border border-orange-100 text-orange-850">
                <strong className="block text-orange-950 mb-1">Reversion Outcome:</strong>
                {revertLog.action === 'RETURN_TRANSACTION' && "This will void the return. Stock numbers are decremented and refund cash will be returned from the selected account."}
                {revertLog.action === 'VOID_SALE' && "This will restore the voided sale. Product inventory is re-deducted and cash will be re-credited to the account."}
                {(revertLog.action === 'CREATE_SALE' || revertLog.action === 'CREATE_PENDING_SALE') && "This will void the completed/pending sale. Inventory stock will be replenished, and sale proceeds will be deducted from your account balance."}
                {revertLog.action === 'VOID_RETURN' && "This will re-apply the returned status to the sale, adjust inventory levels, and process the refund."}
                {revertLog.action === 'STOCK_ADJUSTMENT' && "This will undo the manual stock adjustment. Quantity counts across physical locations will sync to pre-adjusted levels."}
                {revertLog.action === 'RECEIVE_STOCK' && "This will undo the received inventory batch from this PO. Product stock drops accordingly, and supplier payment is retracted/refunded."}
                {revertLog.action === 'CREATE_PO' && "This will mark the purchase order as cancelled."}
                {revertLog.action === 'VOID_PO' && "This will un-cancel the purchase order and set its status back to ordered."}
                {revertLog.action.startsWith('CREATE_') && revertLog.action !== 'CREATE_SALE' && revertLog.action !== 'CREATE_PENDING_SALE' && "This will delete this catalog/metadata entry from your database."}
                {revertLog.action.startsWith('DELETE_') && "This will recreate/restore this deleted document to the database with its key recorded details."}
                {revertLog.action.startsWith('UPDATE_') && "Highly targeted edits are best corrected directly inside their specific modules (Directory, Finance, Inventory)."}
              </div>

              {((revertLog.action === 'RETURN_TRANSACTION' && revertEntityData.totalRefund > 0) || 
                (revertLog.action === 'VOID_SALE' && revertEntityData.total > 0) || 
                ((revertLog.action === 'CREATE_SALE' || revertLog.action === 'CREATE_PENDING_SALE') && revertEntityData.total > 0) ||
                (revertLog.action === 'VOID_RETURN' && revertEntityData.totalRefund > 0) ||
                (revertLog.action === 'RECEIVE_STOCK' && revertEntityData.totalAmount > 0)) && (
                <div className="space-y-2 pt-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block">
                    Account to replenish with cancelled funds
                  </Label>
                  <Select value={revertAccountId} onValueChange={(val) => setRevertAccountId(val)}>
                    <SelectTrigger className="w-full h-10 bg-slate-50 border-slate-200">
                      <SelectValue placeholder="Select asset account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.filter((acc: any) => acc.active !== false).map((acc: any) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} (Balance: {settings.currency}{(acc.balance || 0).toFixed(2)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    The chosen account will be updated with the reversed amount. A new transaction tracking ledger entry will be logged under Financial transactions.
                  </p>
                </div>
              )}

              {revertLog.action === 'RETURN_TRANSACTION' && revertEntityData.status === 'voided' && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 font-medium">
                  Warning: This return transaction has already been voided and cannot be reversed again.
                </div>
              )}

              {revertLog.action === 'VOID_SALE' && revertEntityData.status !== 'voided' && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 font-medium">
                  Warning: This sale has already been unvoided or restored.
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 items-center justify-center py-6 text-sm text-muted-foreground italic">
              <span>Loading transaction details...</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setIsRevertDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmRevert} 
              disabled={
                isReverting || 
                !revertEntityData || 
                (revertLog?.action === 'RETURN_TRANSACTION' && revertEntityData?.status === 'voided') ||
                (revertLog?.action === 'VOID_SALE' && revertEntityData?.status !== 'voided') ||
                (revertLog?.action === 'VOID_RETURN' && revertEntityData?.status === 'completed') ||
                (revertLog?.action === 'RECEIVE_STOCK' && revertEntityData?.status !== 'received') ||
                ((
                  ((revertLog?.action === 'RETURN_TRANSACTION' || revertLog?.action === 'VOID_RETURN') && (revertEntityData?.totalRefund || 0) > 0) || 
                  ((revertLog?.action === 'VOID_SALE' || revertLog?.action === 'CREATE_SALE' || revertLog?.action === 'CREATE_PENDING_SALE') && (revertEntityData?.total || 0) > 0) ||
                  (revertLog?.action === 'RECEIVE_STOCK' && (revertEntityData?.totalAmount || 0) > 0)
                ) && !revertAccountId)
              }
            >
              {isReverting ? 'Reverting...' : 'Confirm Revert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isResetWizardOpen} onOpenChange={(open) => !open && !isResetting && setIsResetWizardOpen(false)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-xl text-rose-600">
              <Trash2 className="w-5 h-5 text-rose-500" />
              Go-Live Production Reset Wizard
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 pt-1">
              Are you preparing to deploy or transition this register and stock management system to real production use? Use this utility to purge testing noise and begin with a pristine log stack.
            </DialogDescription>
          </DialogHeader>

          {!isResetting ? (
            <div className="space-y-4 py-4 border-t border-b border-border my-2 text-sm text-slate-700">
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Reset Intensity:</Label>
                
                <div 
                  onClick={() => setResetType('transactions')}
                  className={cn(
                    "p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-1",
                    resetType === 'transactions' 
                      ? "border-primary bg-primary/5 shadow-sm" 
                      : "border-border bg-slate-50 hover:bg-slate-100"
                  )}
                >
                  <span className="font-bold text-slate-900 flex items-center justify-between">
                    <span>1. Clear Transactional History Only (Recommended)</span>
                    {resetType === 'transactions' && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="text-xs text-slate-500 leading-normal mt-1">
                    Completely purges all test data including **Sales invoices, Refund records, Purchase Orders, inventory adjustments, employee shifts/attendance, financial ledgers, and audit trials**. Resets stock counts back to zero and account balances back to zero.
                  </span>
                  <span className="text-xs font-semibold text-emerald-600 mt-1">
                    ✓ Keeps catalog setups (locations, products, customers, suppliers) intact so you don't have to re-enter them.
                  </span>
                </div>

                <div 
                  onClick={() => setResetType('factory')}
                  className={cn(
                    "p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-1",
                    resetType === 'factory' 
                      ? "border-rose-500 bg-rose-50/40 shadow-sm" 
                      : "border-border bg-slate-50 hover:bg-slate-100"
                  )}
                >
                  <span className="font-bold text-rose-950 flex items-center justify-between">
                    <span>2. Full Structural Factory Reset (Nuclear)</span>
                    {resetType === 'factory' && <span className="h-2 w-2 rounded-full bg-rose-500" />}
                  </span>
                  <span className="text-xs text-slate-500 leading-normal mt-1">
                    Wipes absolutely every collection inside your Firestore database. The system resets back to an absolute slate of an empty database. All custom products, price tiers, promos, suppliers, and locations will be permanently deleted.
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wide text-rose-700 block">
                  Security Confirmation
                </Label>
                <p className="text-xs text-slate-500 leading-normal mb-1">
                  Type the word <strong className="font-mono text-rose-600">RESET</strong> below to confirm you want to proceed. This operation cannot be undone.
                </p>
                <Input 
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="Type RESET here"
                  className="font-mono text-center h-10 border-rose-200 focus-visible:ring-rose-400 bg-rose-50/10"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 items-center justify-center py-12 text-sm text-slate-700">
              <div className="relative flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600" />
                <Trash2 className="w-5 h-5 text-rose-500 absolute" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-rose-600 animate-pulse">Database Purging Active</p>
                <p className="text-xs text-muted-foreground italic max-w-[320px]">{resetStep}</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setIsResetWizardOpen(false)} disabled={isResetting}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleProceedReset} 
              disabled={isResetting || resetConfirmText !== 'RESET'}
              className="bg-rose-600 hover:bg-rose-700 font-semibold"
            >
              Initialize Purge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRestoreModalOpen} onOpenChange={(open) => !open && !isRestoring && setIsRestoreModalOpen(false)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-xl text-emerald-600">
              <Upload className="w-5 h-5 text-emerald-500" />
              Import &amp; Restore Database
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 pt-1">
              Restore an existing offline JSON backup file into your cloud database. This will rebuild collections back to snapshot state.
            </DialogDescription>
          </DialogHeader>

          {!isRestoring ? (
            <div className="space-y-4 py-4 border-t border-b border-border my-2 text-sm text-slate-700">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Backup JSON File:</Label>
                <Input 
                  type="file" 
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setRestoreFile(file);
                  }}
                  className="cursor-pointer file:text-emerald-700 file:font-semibold"
                />
              </div>

              <div className="space-y-3 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Select Restore Strategy:</Label>
                
                <div 
                  onClick={() => setRestoreOption('merge')}
                  className={cn(
                    "p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1",
                    restoreOption === 'merge' 
                      ? "border-primary bg-primary/5 shadow-sm" 
                      : "border-border bg-slate-50 hover:bg-slate-100"
                  )}
                >
                  <span className="font-bold text-slate-900 flex items-center justify-between">
                    <span>1. Merge &amp; Update (Safe)</span>
                    {restoreOption === 'merge' && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="text-xs text-slate-500 leading-normal">
                    Overwrites documents that match IDs in the backup while leaving other current documents completely untouched. Best for non-destructive repairs.
                  </span>
                </div>

                <div 
                  onClick={() => setRestoreOption('replace')}
                  className={cn(
                    "p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1",
                    restoreOption === 'replace' 
                      ? "border-rose-500 bg-rose-50/40 shadow-sm" 
                      : "border-border bg-slate-50 hover:bg-slate-100"
                  )}
                >
                  <span className="font-bold text-rose-950 flex items-center justify-between">
                    <span>2. Pure Overwrite (Clean Replace)</span>
                    {restoreOption === 'replace' && <span className="h-2 w-2 rounded-full bg-rose-500" />}
                  </span>
                  <span className="text-xs text-slate-500 leading-normal">
                    Completely purges all current database collections before injecting the backup records. Fully syncs database with your JSON backup file.
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wide text-rose-700 block">
                  Security Confirmation
                </Label>
                <p className="text-xs text-slate-500 leading-normal mb-1">
                  Type the word <strong className="font-mono text-rose-600">RESTORE</strong> below to confirm you want to proceed. This operation cannot be undone.
                </p>
                <Input 
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="Type RESTORE here"
                  className="font-mono text-center h-10 border-rose-200 focus-visible:ring-rose-400 bg-rose-50/10"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 items-center justify-center py-12 text-sm text-slate-700">
              <div className="relative flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
                <Upload className="w-5 h-5 text-emerald-500 absolute" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-emerald-600 animate-pulse">Restoring Database State</p>
                <p className="text-xs text-muted-foreground italic max-w-[320px]">{backupProgress}</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setIsRestoreModalOpen(false)} disabled={isRestoring}>
              Cancel
            </Button>
            <Button 
              variant="default" 
              onClick={handleRestoreData} 
              disabled={isRestoring || !restoreFile || restoreConfirmText !== 'RESTORE'}
              className="bg-emerald-600 hover:bg-emerald-700 font-semibold"
            >
              Initialize Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Account Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <User className="w-5 h-5 text-[#1A2B4B]" /> Edit Staff Account Details
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Update account display name, email, assigned location, or user role.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <form onSubmit={handleSaveUserEdit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-bold">Full Name</Label>
                <Input 
                  value={editingUser.name || ''} 
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  placeholder="e.g. Jane Doe"
                  className="h-10 text-xs font-bold"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold">Email Address</Label>
                <Input 
                  type="email"
                  value={editingUser.email || ''} 
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  placeholder="e.g. jane@company.com"
                  className="h-10 text-xs font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Role</Label>
                  <Select 
                    value={editingUser.role} 
                    onValueChange={(v: 'admin' | 'manager' | 'staff') => setEditingUser({ ...editingUser, role: v })}
                    disabled={editingUser.id === profile?.id}
                  >
                    <SelectTrigger className="h-10 text-xs font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold">Assigned Location</Label>
                  <Select 
                    value={editingUser.locationId || 'none'} 
                    onValueChange={(v: string) => setEditingUser({ ...editingUser, locationId: v === 'none' ? undefined : v })}
                  >
                    <SelectTrigger className="h-10 text-xs font-bold">
                      <SelectValue placeholder="Select Location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Location</SelectItem>
                      {locations.map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="gap-2 mt-6">
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#1A2B4B] hover:bg-[#2C3E50] font-bold text-white px-6">
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default Settings;
