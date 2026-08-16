import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { DataTablePagination } from '@/components/DataTablePagination';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  doc, 
  updateDoc, 
  addDoc,
  Timestamp, 
  increment,
  getDoc,
  writeBatch,
  arrayUnion
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PurchaseOrder, Product, Location, Supplier, PaymentOption } from '@/types';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Search, 
  PackageCheck, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Eye,
  Truck
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { PurchaseOrderForm } from '@/components/PurchaseOrderForm';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { logAction } from '@/lib/audit';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';

export const Purchasing: React.FC = () => {
  const { user, profile, isAdmin, isManager } = useAuth();
  const { settings } = useSettings();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const isAuthorized = isManager || isAdmin || 
                         ['admin', 'manager'].includes(profile.role) || 
                         ['vanhuxley24@gmail.com', 'v4peavenue@gmail.com'].includes(user?.email?.toLowerCase() || '');

    if (!isAuthorized) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'purchaseOrders'), orderBy('createdAt', 'desc'), limit(200));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder)));
      setLoading(false);
    }, (error) => {
      console.warn("Purchasing: Error listening to purchaseOrders:", error);
      setLoading(false);
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      console.warn("Purchasing: Error listening to products:", error);
    });

    const unsubLocations = onSnapshot(collection(db, 'locations'), (snapshot) => {
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
    }, (error) => {
      console.warn("Purchasing: Error listening to locations:", error);
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
    }, (error) => {
      console.warn("Purchasing: Error listening to suppliers:", error);
    });

    const unsubPayments = onSnapshot(collection(db, 'paymentOptions'), (snapshot) => {
      setPaymentOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentOption)));
    }, (error) => {
      console.warn("Purchasing: Error listening to paymentOptions:", error);
    });

    const unsubAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn("Purchasing: Error listening to accounts:", error);
    });

    return () => {
      unsubscribe();
      unsubProducts();
      unsubLocations();
      unsubSuppliers();
      unsubPayments();
      unsubAccounts();
    };
  }, [profile?.id, user?.uid, isAdmin, isManager]);

  const handleReceiveStock = async (po: PurchaseOrder) => {
    setIsReceiving(true);
    try {
      // 1. Check for insufficient funds first
      if (po.isSplitPayment && po.paymentSplits) {
        for (const split of po.paymentSplits) {
          const account = accounts.find(a => a.id === split.methodId);
          if (account && account.balance < split.amount) {
            toast.error(`Insufficient funds in ${account.name}. Current: ${settings.currency}${account.balance.toLocaleString()}, Required: ${settings.currency}${split.amount.toLocaleString()}`);
            setIsReceiving(false);
            return;
          }
        }
      } else if (po.paymentAccountId) {
        const account = accounts.find(a => a.id === po.paymentAccountId);
        if (account && account.balance < (po.totalAmount ?? 0)) {
          toast.error(`Insufficient funds in ${account.name}. Current: ${settings.currency}${account.balance.toLocaleString()}, Required: ${settings.currency}${(po.totalAmount ?? 0).toLocaleString()}`);
          setIsReceiving(false);
          return;
        }
      }

      const batch = writeBatch(db);
      
      // Update each product's stock
      for (const item of po.items) {
        const productRef = doc(db, 'products', item.productId);
        
        // We need to update both the global stock and the location-specific stock
        batch.update(productRef, {
          stock: increment(item.quantity),
          [`stocks.${po.locationId}`]: increment(item.quantity),
          locationIds: arrayUnion(po.locationId)
        });
      }

      // Update PO status
      const poRef = doc(db, 'purchaseOrders', po.id);
      batch.update(poRef, {
        status: 'received',
        receivedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      // Update financial account balance if specified
      if (po.isSplitPayment && po.paymentSplits) {
        for (const split of po.paymentSplits) {
          const account = accounts.find(a => a.id === split.methodId);
          if (account) {
            const accountRef = doc(db, 'accounts', split.methodId);
            batch.update(accountRef, {
              balance: increment(-split.amount),
              lastUpdated: Timestamp.now()
            });
          }
        }
      } else if (po.paymentAccountId) {
        const accountRef = doc(db, 'accounts', po.paymentAccountId);
        batch.update(accountRef, {
          balance: increment(-(po.totalAmount ?? 0)),
          lastUpdated: Timestamp.now()
        });
      }

      await batch.commit();
      
      if (po.isSplitPayment && po.paymentSplits) {
        for (const split of po.paymentSplits) {
          const account = accounts.find(a => a.id === split.methodId);
          if (account) {
            const currentBalance = account?.balance || 0;
            const newBalance = currentBalance - split.amount;

            await addDoc(collection(db, 'financialTransactions'), {
              amount: split.amount,
              type: 'expense',
              accountId: split.methodId,
              accountName: split.methodName || account.name || 'Unknown',
              locationId: po.locationId || null,
              locationName: locations.find(l => l.id === po.locationId)?.name || null,
              category: 'Supplies',
              description: `Stock Purchase (Split): PO #${po.poNumber}`,
              timestamp: Timestamp.now(),
              createdBy: profile?.id || 'anonymous',
              createdByName: profile?.name || 'Staff',
              accountBalance: newBalance
            });
          }
        }
        await logAction(profile, 'UPDATE_ACCOUNT', `Deducted split payments for PO #${po.poNumber}`, po.id, 'purchaseOrder');
      } else if (po.paymentAccountId) {
        const account = accounts.find(a => a.id === po.paymentAccountId);
        const currentBalance = account?.balance || 0;
        const newBalance = currentBalance - (po.totalAmount ?? 0);

        await addDoc(collection(db, 'financialTransactions'), {
          amount: Number(po.totalAmount),
          type: 'expense',
          accountId: po.paymentAccountId,
          accountName: account?.name || 'Unknown',
          locationId: po.locationId || null,
          locationName: locations.find(l => l.id === po.locationId)?.name || null,
          category: 'Supplies',
          description: `Stock Purchase: PO #${po.poNumber}`,
          timestamp: Timestamp.now(),
          createdBy: profile?.id || 'anonymous',
          createdByName: profile?.name || 'Staff',
          accountBalance: newBalance
        });
        
        await logAction(profile, 'UPDATE_ACCOUNT', `Deducted ${settings.currency}${(po.totalAmount ?? 0).toFixed(2)} for PO #${po.poNumber}`, po.paymentAccountId, 'account');
      }

      await logAction(profile, 'RECEIVE_STOCK', `Received stock for PO: ${po.poNumber}`, po.id, 'purchaseOrder');
      toast.success('Stock received and inventory updated');
      setIsViewOpen(false);
    } catch (error) {
      console.error("Error receiving stock:", error);
      handleFirestoreError(error, OperationType.UPDATE, 'purchaseOrders');
    } finally {
      setIsReceiving(false);
    }
  };

  const handleVoidPO = async (po: PurchaseOrder) => {
    if (!isAdmin && !isManager) {
      toast.error('Only administrators or managers can void purchase orders');
      return;
    }

    if (!window.confirm(`Are you sure you want to ${po.status === 'received' ? 'VOID' : 'CANCEL'} this purchase order?${po.status === 'received' ? ' This will reverse the stock addition.' : ''}`)) return;

    setIsVoiding(true);
    try {
      const batch = writeBatch(db);

      if (po.status === 'received') {
        // Reverse stock addition
        for (const item of po.items) {
          const productRef = doc(db, 'products', item.productId);
          batch.update(productRef, {
            stock: increment(-item.quantity),
            [`stocks.${po.locationId}`]: increment(-item.quantity)
          });
        }
      }

      // Update PO status
      const poRef = doc(db, 'purchaseOrders', po.id);
      batch.update(poRef, {
        status: 'cancelled',
        updatedAt: Timestamp.now()
      });

      // Reverse financial account decrement if it was received
      if (po.status === 'received') {
        if (po.isSplitPayment && po.paymentSplits) {
          for (const split of po.paymentSplits) {
            const account = accounts.find(a => a.id === split.methodId);
            if (account) {
              const accountRef = doc(db, 'accounts', split.methodId);
              batch.update(accountRef, {
                balance: increment(split.amount),
                lastUpdated: Timestamp.now()
              });
              
              const currentBalance = account?.balance || 0;
              const newBalance = currentBalance + split.amount;

              await addDoc(collection(db, 'financialTransactions'), {
                amount: split.amount,
                type: 'income',
                accountId: split.methodId,
                accountName: split.methodName || account.name || 'Unknown',
                locationId: po.locationId || null,
                category: 'Supplies',
                description: `Voided Stock Purchase (Split): PO #${po.poNumber}`,
                timestamp: Timestamp.now(),
                createdBy: profile?.id || 'anonymous',
                createdByName: profile?.name || 'Staff',
                accountBalance: newBalance
              });
            }
          }
        } else if (po.paymentAccountId) {
          const account = accounts.find(a => a.id === po.paymentAccountId);
          const currentBalance = account?.balance || 0;
          const newBalance = currentBalance + (po.totalAmount ?? 0);

          const accountRef = doc(db, 'accounts', po.paymentAccountId);
          batch.update(accountRef, {
            balance: increment(po.totalAmount ?? 0),
            lastUpdated: Timestamp.now()
          });

          // Create financial transaction record (reversed expense)
          await addDoc(collection(db, 'financialTransactions'), {
            amount: Number(po.totalAmount),
            type: 'income',
            accountId: po.paymentAccountId,
            accountName: account?.name || 'Unknown',
            locationId: po.locationId || null,
            locationName: locations.find(l => l.id === po.locationId)?.name || null,
            category: 'Supplies',
            description: `Voided Stock Purchase: PO #${po.poNumber}`,
            timestamp: Timestamp.now(),
            createdBy: profile?.id || 'anonymous',
            createdByName: profile?.name || 'Staff',
            accountBalance: newBalance
          });
        }
      }

      await batch.commit();
      await logAction(profile, 'VOID_PO', `Voided/Cancelled PO: ${po.poNumber}`, po.id, 'purchaseOrder');
      toast.success(`Purchase order ${po.status === 'received' ? 'voided' : 'cancelled'} successfully`);
      setIsViewOpen(false);
    } catch (error) {
      console.error("Error voiding PO:", error);
      handleFirestoreError(error, OperationType.UPDATE, 'purchaseOrders');
    } finally {
      setIsVoiding(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">Draft</Badge>;
      case 'ordered': return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">Ordered</Badge>;
      case 'received': return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">Received</Badge>;
      case 'cancelled': return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredPos = pos.filter(po => 
    po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.supplierName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredPos.length / pageSize) || 1;
  const paginatedPos = filteredPos.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const visibleProducts = products.filter(p => {
    if (isAdmin || isManager) return true;
    const userLocId = profile?.locationId;
    if (!userLocId) return false;
    return (p.locationIds && p.locationIds.includes(userLocId)) || 
           (p.stocks && p.stocks[userLocId] !== undefined && Number(p.stocks[userLocId]) > 0);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchasing & Receiving</h1>
          <p className="text-slate-500">Manage purchase orders and receive stock into inventory.</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Purchase Order
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-lg font-semibold">Purchase Orders</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search POs or suppliers..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Destination</TableHead>
                {isAdmin && <TableHead>Total</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="h-24 text-center">Loading purchase orders...</TableCell>
                </TableRow>
              ) : filteredPos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="h-24 text-center text-slate-500">
                    No purchase orders found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPos.map((po) => (
                  <TableRow key={po.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-mono font-medium">{po.poNumber}</TableCell>
                    <TableCell className="text-xs">
                      {format(po.createdAt.toDate(), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="text-sm">{po.supplierName}</TableCell>
                    <TableCell className="text-xs">
                      {locations.find(l => l.id === po.locationId)?.name || 'Unknown'}
                    </TableCell>
                    {isAdmin && <TableCell className="font-semibold">{settings.currency}{(po.totalAmount ?? 0).toFixed(2)}</TableCell>}
                    <TableCell>{getStatusBadge(po.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setSelectedPO(po);
                          setIsViewOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            </Table>

            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={filteredPos.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={size => {
                setPageSize(size);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Mobile-optimized cards for smartphones */}
          <div className="block md:hidden space-y-4">
            {loading ? (
              <div className="p-6 text-center text-slate-500 font-semibold animate-pulse">
                Loading purchase orders...
              </div>
            ) : filteredPos.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                No purchase orders found.
              </div>
            ) : (
              <>
                {paginatedPos.map((po, index) => (
                <motion.div
                  key={po.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.2) }}
                  className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#1A2B4B] bg-[#1A2B4B]/5 px-2 py-1 rounded-md">
                      {po.poNumber}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {format(po.createdAt.toDate(), 'MMM dd, yyyy')}
                    </span>
                  </div>

                  <div className="space-y-1.5 py-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 font-medium text-xs uppercase tracking-wider">Supplier</span>
                      <span className="font-bold text-slate-800 truncate max-w-[150px]">{po.supplierName}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 font-medium text-xs uppercase tracking-wider">Destination</span>
                      <span className="text-slate-600 font-semibold text-xs">
                        {locations.find(l => l.id === po.locationId)?.name || 'Unknown'}
                      </span>
                    </div>
                    {isAdmin && (
                      <div className="flex justify-between items-center text-sm border-t border-slate-50 pt-1.5 mt-1.5 align-middle">
                        <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Total amount</span>
                        <span className="font-black text-rose-600 text-sm">
                          {settings.currency}{(po.totalAmount ?? 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <div>{getStatusBadge(po.status)}</div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-xs font-bold gap-1.5 border-slate-200"
                      onClick={() => {
                        setSelectedPO(po);
                        setIsViewOpen(true);
                      }}
                    >
                      <Eye className="w-3.5 h-3.5 text-indigo-500" />
                      View Details
                    </Button>
                  </div>
                </motion.div>
              ))}

              <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredPos.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={size => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
            </>
            )}
          </div>
        </CardContent>
      </Card>

      <PurchaseOrderForm 
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        products={visibleProducts}
        locations={locations}
        suppliers={suppliers}
        paymentOptions={paymentOptions}
      />

      {/* PO Details View */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-indigo-600" />
              Purchase Order: {selectedPO?.poNumber}
            </DialogTitle>
          </DialogHeader>
          
          {selectedPO && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Supplier</p>
                  <p className="font-bold">{selectedPO.supplierName}</p>
                </div>
                <div>
                  <p className="text-slate-500">Destination Location</p>
                  <p className="font-bold">{locations.find(l => l.id === selectedPO.locationId)?.name}</p>
                </div>
                <div>
                  <p className="text-slate-500">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedPO.status)}</div>
                </div>
                <div>
                  <p className="text-slate-500">Payment Info</p>
                  <p className="font-bold text-[11px]">
                    {selectedPO.paymentCategory || 'N/A'} - {selectedPO.paymentMethod || 'N/A'}
                    {selectedPO.paymentReference && <span className="block text-[10px] text-slate-400">Ref: {selectedPO.paymentReference}</span>}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Created At</p>
                  <p className="font-medium">{format(selectedPO.createdAt.toDate(), 'PPP')}</p>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs">SKU</TableHead>
                      <TableHead className="text-xs text-center">Qty</TableHead>
                      {isAdmin && <TableHead className="text-xs text-right">Cost</TableHead>}
                      {isAdmin && <TableHead className="text-xs text-right">Subtotal</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-medium">{item.name}</TableCell>
                        <TableCell className="text-xs text-slate-500">{item.sku}</TableCell>
                        <TableCell className="text-xs text-center font-bold">{item.quantity}</TableCell>
                        {isAdmin && <TableCell className="text-xs text-right">{settings.currency}{(item.cost ?? 0).toFixed(2)}</TableCell>}
                        {isAdmin && <TableCell className="text-xs text-right font-bold">{settings.currency}{((item.quantity ?? 0) * (item.cost ?? 0)).toFixed(2)}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {isAdmin && (
                <div className="flex justify-end">
                  <div className="text-right space-y-1">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Total Amount</p>
                    <p className="text-2xl font-black text-slate-900">{settings.currency}{(selectedPO.totalAmount ?? 0).toFixed(2)}</p>
                  </div>
                </div>
              )}

              {selectedPO.notes && (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Notes</p>
                  <p className="text-sm text-slate-600 italic">{selectedPO.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>Close</Button>
            {(isAdmin || isManager) && (selectedPO?.status === 'ordered' || selectedPO?.status === 'received') && (
              <Button 
                variant="destructive" 
                className="gap-2"
                onClick={() => handleVoidPO(selectedPO)}
                disabled={isVoiding}
              >
                {isVoiding ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {selectedPO.status === 'received' ? 'Void PO' : 'Cancel PO'}
              </Button>
            )}
            {selectedPO?.status === 'ordered' && (
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                onClick={() => handleReceiveStock(selectedPO)}
                disabled={isReceiving}
              >
                {isReceiving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <PackageCheck className="w-4 h-4" />
                )}
                {isReceiving ? 'Receiving...' : 'Receive Stock'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Purchasing;
