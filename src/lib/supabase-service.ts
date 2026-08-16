import { supabase } from './supabase';

/**
 * Checks if Supabase credentials are provided in the environment
 */
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key && url.trim() !== '' && key.trim() !== '');
}

/**
 * Supabase Data Service
 * Provides direct CRUD operations to Supabase PostgreSQL database
 */
export const supabaseService = {
  // --- Products ---
  async saveProduct(product: any) {
    if (!isSupabaseConfigured()) return null;
    try {
      const payload = {
        id: product.id,
        name: product.name || '',
        barcode: product.barcode || '',
        sku: product.sku || '',
        category_id: product.category || product.categoryId || null,
        brand_id: product.brand || product.brandId || null,
        cost_price: Number(product.cost || 0),
        selling_price: Number(product.price || 0),
        stock_quantity: Number(product.stock || 0),
        min_stock_level: Number(product.lowStockThreshold || 5),
        location_id: product.locationIds?.[0] || null,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabase.from('products').upsert(payload, { onConflict: 'id' }).select();
      if (error) console.warn('Supabase saveProduct notice:', error.message || error);
      return data;
    } catch (e) {
      console.warn('Supabase product sync notice:', e);
      return null;
    }
  },

  async deleteProduct(id: string) {
    if (!isSupabaseConfigured()) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) console.warn('Supabase deleteProduct notice:', error.message || error);
    } catch (e) {
      console.warn('Supabase deleteProduct notice:', e);
    }
  },

  // --- Sales ---
  async saveSale(sale: any) {
    if (!isSupabaseConfigured()) return null;
    try {
      const payload = {
        id: sale.id,
        receipt_number: sale.receiptNumber || sale.id,
        customer_id: sale.customerId || null,
        customer_name: sale.customerName || null,
        cashier_id: sale.cashierId || null,
        cashier_name: sale.cashierName || null,
        location_id: sale.locationId || null,
        items: sale.items || [],
        subtotal: Number(sale.subtotal || 0),
        discount_amount: Number(sale.discount || 0),
        total_amount: Number(sale.total || 0),
        payment_method: sale.paymentMethod || 'cash',
        payment_details: {
          splits: sale.paymentSplits || [],
          tax: sale.tax || 0,
          promoCode: sale.promoCode || null
        },
        status: sale.status || 'completed',
        notes: sale.notes || null,
        created_at: typeof sale.createdAt === 'string' ? sale.createdAt : new Date().toISOString()
      };
      const { data, error } = await supabase.from('sales').upsert(payload, { onConflict: 'id' }).select();
      if (error) console.warn('Supabase saveSale notice:', error.message || error);
      return data;
    } catch (e) {
      console.warn('Supabase sale sync notice:', e);
      return null;
    }
  },

  // --- Locations ---
  async saveLocation(location: any) {
    if (!isSupabaseConfigured()) return null;
    try {
      const payload = {
        id: location.id,
        name: location.name,
        address: location.address || '',
        phone: location.phone || '',
        is_active: location.isActive !== false
      };
      const { data, error } = await supabase.from('locations').upsert(payload, { onConflict: 'id' }).select();
      if (error) console.warn('Supabase saveLocation notice:', error.message || error);
      return data;
    } catch (e) {
      console.warn('Supabase location sync notice:', e);
      return null;
    }
  },

  async deleteLocation(id: string) {
    if (!isSupabaseConfigured()) return;
    try {
      const { error } = await supabase.from('locations').delete().eq('id', id);
      if (error) console.warn('Supabase deleteLocation notice:', error.message || error);
    } catch (e) {
      console.warn('Supabase deleteLocation notice:', e);
    }
  },

  // --- Customers ---
  async saveCustomer(customer: any) {
    if (!isSupabaseConfigured()) return null;
    try {
      const payload = {
        id: customer.id,
        name: customer.name || '',
        email: customer.email || null,
        phone: customer.phone || null,
        loyalty_points: Number(customer.loyaltyItemCount || customer.loyalty_points || 0),
        price_tier: customer.priceTierId || 'standard'
      };
      const { data, error } = await supabase.from('customers').upsert(payload, { onConflict: 'id' }).select();
      if (error) console.warn('Supabase saveCustomer notice:', error.message || error);
      return data;
    } catch (e) {
      console.warn('Supabase customer sync notice:', e);
      return null;
    }
  },

  // --- Loyalty Cards ---
  async saveLoyaltyCard(card: any) {
    if (!isSupabaseConfigured()) return null;
    try {
      const payload = {
        id: card.id,
        card_number: card.cardNumber,
        customer_id: card.customerId || null,
        balance: Number(card.balance || 0),
        points: Number(card.points || 0),
        status: card.status || 'active'
      };
      const { data, error } = await supabase.from('loyalty_cards').upsert(payload, { onConflict: 'id' }).select();
      if (error) console.warn('Supabase saveLoyaltyCard notice:', error.message || error);
      return data;
    } catch (e) {
      console.warn('Supabase card sync notice:', e);
      return null;
    }
  },

  // --- Attendance ---
  async saveAttendance(attendance: any) {
    if (!isSupabaseConfigured()) return null;
    try {
      const payload = {
        id: attendance.id,
        user_id: attendance.userId || attendance.user_id,
        user_name: attendance.userName || attendance.user_name || '',
        location_id: attendance.locationId || attendance.location_id || null,
        clock_in: attendance.clockIn || attendance.clock_in || new Date().toISOString(),
        clock_out: attendance.clockOut || attendance.clock_out || null,
        total_hours: attendance.totalHours ? Number(attendance.totalHours) : null,
        status: attendance.status || 'completed'
      };
      const { data, error } = await supabase.from('attendance').upsert(payload, { onConflict: 'id' }).select();
      if (error) console.warn('Supabase saveAttendance notice:', error.message || error);
      return data;
    } catch (e) {
      console.warn('Supabase attendance sync notice:', e);
      return null;
    }
  },

  // --- Financial Transactions ---
  async saveFinancialTransaction(tx: any) {
    if (!isSupabaseConfigured()) return null;
    try {
      const payload = {
        id: tx.id,
        account_id: tx.accountId || tx.account_id || null,
        type: tx.type,
        category: tx.category || null,
        amount: Number(tx.amount || 0),
        description: tx.description || '',
        reference_id: tx.referenceId || tx.reference_id || null,
        created_by: tx.createdBy || tx.created_by || null,
        location_id: tx.locationId || tx.location_id || null,
        created_at: tx.createdAt || new Date().toISOString()
      };
      const { data, error } = await supabase.from('financial_transactions').upsert(payload, { onConflict: 'id' }).select();
      if (error) console.warn('Supabase saveFinancialTransaction notice:', error.message || error);
      return data;
    } catch (e) {
      console.warn('Supabase transaction sync notice:', e);
      return null;
    }
  },

  // --- Audit Logs ---
  async logAudit(log: any) {
    if (!isSupabaseConfigured()) return null;
    try {
      const payload = {
        id: log.id || crypto.randomUUID(),
        user_id: log.userId || log.user_id || 'system',
        user_name: log.userName || log.user_name || 'Staff / POS System',
        user_email: log.userEmail || log.user_email || '',
        user_role: log.userRole || log.user_role || 'staff',
        action: log.action || '',
        details: log.details || '',
        created_at: new Date().toISOString()
      };
      const { data, error } = await supabase.from('audit_logs').insert([payload]);
      if (error) {
        // Silently catch or warn if RLS policy restricts anonymous audit logs
        console.warn('Supabase logAudit notice (RLS):', error.message || error);
      }
      return data;
    } catch (e) {
      console.warn('Supabase audit log notice:', e);
      return null;
    }
  }
};
