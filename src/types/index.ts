import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'manager' | 'staff';

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  locationId?: string;
}

export interface Customer {
  id: string;
  name: string;
  billingAddress: string;
  shippingAddress: string;
  municipality: string;
  city: string;
  country: string;
  zip: string;
  email?: string;
  phone?: string;
  priceTierId?: string;
  loyaltyCardNumber?: string;
  loyaltyCardQr?: string;
  totalItemsPurchased?: number;
  loyaltyItemCount?: number;
  createdAt: Timestamp;
}

export interface LoyaltyCard {
  id: string;
  cardNumber: string;
  qrCode?: string;
  customerId?: string;
  customerName?: string;
  issuedAt?: string;
  status: 'active' | 'inactive' | 'expired';
  consumedAt?: string;
  expiredAt?: string;
  notes?: string;
}

export interface PriceTier {
  id: string;
  name: string;
  description?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  brand?: string;
  price: number;
  cost: number;
  stock: number;
  lowStockThreshold: number;
  locationThresholds?: { [locationId: string]: number };
  imageUrl?: string;
  description?: string;
  supplierId?: string;
  locationIds: string[];
  stocks: { [locationId: string]: number };
  tierPrices?: { [tierId: string]: number };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PromoCode {
  id: string;
  code: string;
  amount: number; // Peso amount
  startDate?: Timestamp;
  endDate?: Timestamp;
  isPermanent: boolean;
  isActive: boolean;
  createdAt: Timestamp;
}

export interface PaymentOption {
  id: string;
  name: string;
  type: 'bank' | 'ewallet' | 'cash' | 'card';
  active: boolean;
}

export interface PaymentSplit {
  methodId: string;
  methodName: string;
  amount: number;
  reference?: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  originalPrice: number;
  tierId?: string;
  returnedQuantity?: number;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  subtotal: number;
  total: number;
  tax: number;
  discount: number;
  promoId?: string;
  promoCode?: string;
  paymentMethod: string; // Dynamic
  paymentSplits: PaymentSplit[];
  status: 'completed' | 'returned' | 'partially_returned' | 'voided' | 'pending' | 'pending_promo_approval' | 'pending_total_approval';
  staffId: string;
  locationId: string;
  customerId: string;
  customerDetails: Omit<Customer, 'id' | 'createdAt'>;
  timestamp: Timestamp;
  saleType?: 'in-store' | 'online';
  deliveryFee?: number;
  isTotalEdited?: boolean;
  originalTotal?: number;
  promoApprovedBy?: string;
  promoApprovedById?: string;
  promoApprovedAt?: Timestamp;
  totalApprovedBy?: string;
  totalApprovedById?: string;
  totalApprovedAt?: Timestamp;
  loyaltyDiscount?: number;
  loyaltyTier1Earned?: number;
  loyaltyTier2Earned?: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  address?: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Brand {
  id: string;
  name: string;
}

export interface Location {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2: string;
  municipality: string;
  city: string;
  country: string;
  isWarehouse?: boolean;
}

export interface Invite {
  id: string;
  email: string;
  role: UserRole;
  locationId?: string;
  status: 'pending' | 'accepted' | 'expired';
  invitedBy: string;
  createdAt: Timestamp;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  details: string;
  entityId?: string;
  entityType?: string;
  timestamp: Timestamp;
}

export type POStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface POItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  cost: number;
  receivedQuantity: number;
}

export interface PaymentSplit {
  methodId: string;
  methodName: string;
  amount: number;
  reference?: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  items: POItem[];
  totalAmount: number;
  status: POStatus;
  paymentAccountId?: string;
  paymentMethod?: string;
  paymentSplits?: PaymentSplit[];
  isSplitPayment?: boolean;
  notes?: string;
  createdBy: string;
  orderedAt?: Timestamp;
  receivedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StockAdjustment {
  id: string;
  productId: string;
  productName: string;
  locationId: string;
  locationName: string;
  previousStock: number;
  adjustmentQuantity: number;
  newStock: number;
  type: 'add' | 'subtract' | 'set';
  reason: string;
  adjustedBy: string;
  adjustedByName: string;
  timestamp: Timestamp;
}

export interface ReturnItem extends SaleItem {
  returnType: 'return' | 'replacement';
  reason: string;
  restock?: boolean;
}

export interface ReturnTransaction {
  id: string;
  originalSaleId: string;
  items: ReturnItem[];
  totalRefund: number;
  refundMethod?: string;
  refundAccountId?: string;
  staffId: string;
  staffName: string;
  locationId: string;
  timestamp: Timestamp;
  reason: string;
}

export interface FinancialAccount {
  id: string;
  name: string;
  type: 'bank' | 'ewallet' | 'cash' | 'card';
  balance: number;
  lastUpdated: Timestamp;
  active?: boolean;
}

export interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  accountId: string;
  accountName: string;
  locationId?: string;
  locationName?: string;
  category: string;
  description: string;
  timestamp: Timestamp;
  createdBy: string;
  createdByName: string;
  accountBalance?: number;
}

export interface Schedule {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  startTime?: string | null; // HH:mm
  endTime?: string | null; // HH:mm
  locationId?: string;
  isDayOff?: boolean;
  updatedAt?: Timestamp;
}

export interface Attendance {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  timeIn: Timestamp;
  timeOut?: Timestamp | null;
  timeInBackup?: string | null;
  timeOutBackup?: string | null;
  locationId: string;
  locationName: string;
  notes?: string;
}

export interface AttendanceRequest {
  id: string;
  userId: string;
  userName: string;
  type: 'leave' | 'schedule_change' | 'time_correction' | 'overtime';
  status: 'pending' | 'approved' | 'rejected';
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  newStartTime?: string | null; // HH:mm
  newEndTime?: string | null; // HH:mm
  otType?: 'preshift' | 'postshift' | 'both' | 'custom';
  isPreShiftSelected?: boolean;
  isPostShiftSelected?: boolean;
  preShiftOtStart?: string | null; // HH:mm
  preShiftOtEnd?: string | null; // HH:mm
  postShiftOtStart?: string | null; // HH:mm
  postShiftOtEnd?: string | null; // HH:mm
  maxPreShiftStart?: string | null;
  maxPreShiftEnd?: string | null;
  maxPostShiftStart?: string | null;
  maxPostShiftEnd?: string | null;
  schedStart?: string | null;
  schedEnd?: string | null;
  clockInStr?: string | null;
  clockOutStr?: string | null;
  otHours?: number;
  locationId?: string;
  locationName?: string;
  reason: string;
  createdBy?: string;
  createdByName?: string;
  autoApprove?: boolean;
  reviewedBy?: string;
  reviewedByName?: string;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
}
