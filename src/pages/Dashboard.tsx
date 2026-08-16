import React, { useEffect, useState, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  Timestamp,
  getDocs
} from 'firebase/firestore';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';
import { 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingBag,
  Plus,
  History,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Terminal,
  ShieldCheck,
  Search,
  Filter,
  Award,
  TrendingDown,
  Users,
  User,
  Clock,
  Timer
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocations } from '../contexts/LocationContext';
import { useSettings } from '../contexts/SettingsContext';
import { Product, Sale, AuditLog, UserProfile, Attendance as AttendanceType } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend
} from 'recharts';

interface LowStockAlert {
  product: Product;
  locationId: string;
  locationName: string;
  stock: number;
  threshold: number;
}

import { 
  format, 
  startOfDay, 
  subDays, 
  isSameDay, 
  eachDayOfInterval, 
  eachMonthOfInterval, 
  eachYearOfInterval,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isSameMonth,
  isSameYear,
  addDays,
  subMonths,
  subYears
} from 'date-fns';
import { motion } from 'motion/react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

export const Dashboard: React.FC = () => {
  const { isAdmin } = useAuth();
  const { selectedLocationId, locations } = useLocations();
  const { settings } = useSettings();
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    lowStockCount: 0,
    totalProducts: 0,
    salesTrend: 0,
  });
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlert[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [locationChartData, setLocationChartData] = useState<any[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New states for filters
  const [timeRange, setTimeRange] = useState<string>('7days');
  const [customStartDate, setCustomStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [groupBy, setGroupBy] = useState<'day' | 'month' | 'year'>('day');
  
  // States for quantities sold analysis
  const [activeDashboardTab, setActiveDashboardTab] = useState<'overview' | 'analysis' | 'performance'>('overview');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [analysisSearch, setAnalysisSearch] = useState('');
  const [analysisCategory, setAnalysisCategory] = useState('all');
  const [analysisBrand, setAnalysisBrand] = useState('all');

  // Employee Performance Tab States
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceType[]>([]);
  const [performanceSearch, setPerformanceSearch] = useState('');
  const [performanceRole, setPerformanceRole] = useState('all');
  const [performanceChartMetric, setPerformanceChartMetric] = useState<'units' | 'hours' | 'revenue' | 'efficiency'>('units');

  const activeDateRange = useMemo(() => {
    const now = new Date();
    let start = subDays(now, 7);
    let end = now;

    if (timeRange === 'today') start = startOfDay(now);
    else if (timeRange === '30days') start = subDays(now, 30);
    else if (timeRange === 'month') {
      start = startOfMonth(now);
      end = endOfMonth(now);
    }
    else if (timeRange === 'lastMonth') {
      start = startOfMonth(subMonths(now, 1));
      end = endOfMonth(subMonths(now, 1));
    }
    else if (timeRange === 'year') {
      start = startOfYear(now);
      end = endOfYear(now);
    }
    else if (timeRange === 'lastYear') {
      start = startOfYear(subYears(now, 1));
      end = endOfYear(subYears(now, 1));
    }
    else if (timeRange === 'custom') {
      start = startOfDay(new Date(customStartDate));
      end = startOfDay(addDays(new Date(customEndDate), 1)); // inclusive end of day
    }
    return { start, end };
  }, [timeRange, customStartDate, customEndDate]);

  // 1. Static reference data listeners (only re-subscribe if role/location changes, NOT date filter)
  useEffect(() => {
    if (!isAdmin) return;

    // Listen to products for low stock alerts and top products
    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setAllProducts(allProducts);
      
      const filteredProducts = selectedLocationId === 'all' 
        ? allProducts 
        : allProducts.filter(p => 
            (p.locationIds && p.locationIds.includes(selectedLocationId)) ||
            (p.stocks && p.stocks[selectedLocationId] !== undefined && Number(p.stocks[selectedLocationId]) > 0)
          );

      let alerts: LowStockAlert[] = [];
      if (selectedLocationId === 'all') {
        allProducts.forEach(p => {
          const productLocations = Array.from(new Set([
            ...(p.locationIds || []),
            ...Object.keys(p.stocks || {})
          ]));
          
          productLocations.forEach(locId => {
            const loc = locations.find(l => l.id === locId);
            if (!loc) return;

            const stock = Number(p.stocks?.[locId] || 0);
            const threshold = p.locationThresholds?.[locId] ?? p.lowStockThreshold;

            if (stock > 0 && stock <= threshold) {
              alerts.push({
                product: p,
                locationId: locId,
                locationName: loc.name,
                stock,
                threshold
              });
            }
          });
        });
      } else {
        const loc = locations.find(l => l.id === selectedLocationId);
        filteredProducts.forEach(p => {
          const stock = Number(p.stocks?.[selectedLocationId] || 0);
          const threshold = p.locationThresholds?.[selectedLocationId] ?? p.lowStockThreshold;

          if (stock > 0 && stock <= threshold) {
            alerts.push({
              product: p,
              locationId: selectedLocationId,
              locationName: loc?.name || 'Unknown',
              stock,
              threshold
            });
          }
        });
      }

      setLowStockAlerts(alerts);
      setStats(prev => ({ ...prev, lowStockCount: alerts.length, totalProducts: filteredProducts.length }));
    }, (error) => {
      console.warn("Dashboard: Error listening to products:", error);
    });

    // Listen to audit logs
    const auditQuery = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(5));
    const unsubscribeAudit = onSnapshot(auditQuery, (snapshot) => {
      setRecentActivity(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog)));
    }, (error) => {
      console.warn("Dashboard: Error listening to audit_logs:", error);
    });

    const unsubscribePayments = onSnapshot(collection(db, 'paymentOptions'), (snapshot) => {
      setPaymentOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubscribeAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      console.warn("Dashboard: Error listening to users:", error);
    });

    const unsubscribeAttendance = onSnapshot(collection(db, 'attendance'), (snapshot) => {
      setAllAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceType)));
    }, (error) => {
      console.warn("Dashboard: Error listening to attendance:", error);
    });

    return () => {
      unsubscribeProducts();
      unsubscribeAudit();
      unsubscribePayments();
      unsubscribeAccounts();
      unsubscribeUsers();
      unsubscribeAttendance();
    };
  }, [isAdmin, selectedLocationId, locations]);

  // 2. Date range dependent sales listener
  useEffect(() => {
    if (!isAdmin) return;

    const startDate = activeDateRange.start;
    const endDate = activeDateRange.end;

    const salesQuery = query(
      collection(db, 'sales'),
      where('timestamp', '>=', Timestamp.fromDate(startDate)),
      where('timestamp', '<=', Timestamp.fromDate(endDate)),
      orderBy('timestamp', 'desc'),
      limit(500)
    );

    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
      let sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      sales = sales.filter(s => s.status !== 'voided' && s.status !== 'pending' && s.status !== 'pending_total_approval' && s.status !== 'pending_promo_approval');

      if (selectedLocationId !== 'all') {
        sales = sales.filter(s => s.locationId === selectedLocationId);
      }
      
      setFilteredSales(sales);
      
      const totalSales = sales.reduce((sum, s) => {
        const returnedAmount = (s.items || []).reduce((subSum, item) => subSum + ((item.price ?? 0) * (item.returnedQuantity || 0)), 0);
        const netTotal = Math.max(0, (s.total ?? 0) - returnedAmount);
        return sum + netTotal;
      }, 0);
      setStats(prev => ({ ...prev, totalSales, totalOrders: sales.length }));
      setRecentSales(sales.slice(0, 5));

      // Top products
      const productSales: { [key: string]: { name: string, quantity: number, total: number } } = {};
      sales.forEach(sale => {
        sale.items.forEach(item => {
          if (!productSales[item.productId]) {
            productSales[item.productId] = { name: item.name, quantity: 0, total: 0 };
          }
          const netQty = Math.max(0, item.quantity - (item.returnedQuantity || 0));
          const netSubtotal = item.quantity > 0 ? (item.subtotal / item.quantity) * netQty : 0;
          productSales[item.productId].quantity += netQty;
          productSales[item.productId].total += netSubtotal;
        });
      });

      const top = Object.values(productSales).sort((a, b) => b.total - a.total).slice(0, 5);
      setTopProducts(top);

      // Prepare Chart Data
      let interval: Date[] = [];
      if (groupBy === 'day') {
        interval = eachDayOfInterval({ start: startDate, end: endDate });
      } else if (groupBy === 'month') {
        interval = eachMonthOfInterval({ start: startDate, end: endDate });
      } else {
        interval = eachYearOfInterval({ start: startDate, end: endDate });
      }

      const revenueData = interval.map(date => {
        let bucketSales = [];
        let label = '';
        let subLabel = '';

        if (groupBy === 'day') {
          bucketSales = sales.filter(s => isSameDay(s.timestamp.toDate(), date));
          label = format(date, 'dd');
          subLabel = format(date, 'MMM yy');
        } else if (groupBy === 'month') {
          bucketSales = sales.filter(s => isSameMonth(s.timestamp.toDate(), date));
          label = format(date, 'MMM');
          subLabel = format(date, 'yyyy');
        } else {
          bucketSales = sales.filter(s => isSameYear(s.timestamp.toDate(), date));
          label = format(date, 'yyyy');
        }

        return {
          name: label,
          subLabel,
          amount: bucketSales.reduce((sum, s) => {
            const returnedAmount = (s.items || []).reduce((subSum, item) => subSum + ((item.price ?? 0) * (item.returnedQuantity || 0)), 0);
            return sum + Math.max(0, (s.total ?? 0) - returnedAmount);
          }, 0),
          orders: bucketSales.length,
          fullDate: date
        };
      });
      setChartData(revenueData);

      // Revenue by Location Data
      const locationData = interval.map(date => {
        const item: any = {
          name: groupBy === 'day' ? format(date, 'dd') : (groupBy === 'month' ? format(date, 'MMM') : format(date, 'yyyy')),
          subLabel: groupBy === 'day' ? format(date, 'MMM yy') : (groupBy === 'month' ? format(date, 'yyyy' ) : ''),
          fullDate: date
        };

        locations.forEach(loc => {
          let locSales = sales.filter(s => s.locationId === loc.id);
          if (groupBy === 'day') {
            locSales = locSales.filter(s => isSameDay(s.timestamp.toDate(), date));
          } else if (groupBy === 'month') {
            locSales = locSales.filter(s => isSameMonth(s.timestamp.toDate(), date));
          } else {
            locSales = locSales.filter(s => isSameYear(s.timestamp.toDate(), date));
          }
          item[loc.name] = locSales.reduce((sum, s) => {
            const returnedAmount = (s.items || []).reduce((subSum, item) => subSum + ((item.price ?? 0) * (item.returnedQuantity || 0)), 0);
            return sum + Math.max(0, (s.total ?? 0) - returnedAmount);
          }, 0);
        });

        return item;
      });
      setLocationChartData(locationData);

      setLoading(false);
    }, (error) => {
      console.warn("Dashboard: Error listening to sales:", error);
      setLoading(false);
    });

    return () => {
      unsubscribeSales();
    };
  }, [isAdmin, selectedLocationId, groupBy, locations, activeDateRange.start.getTime(), activeDateRange.end.getTime()]);

  // Dynamically extract unique categories and brands for the analysis filters
  const categories = useMemo(() => {
    const list = new Set<string>();
    allProducts.forEach(p => {
      if (p.category) list.add(p.category);
    });
    return ['all', ...Array.from(list).sort()];
  }, [allProducts]);

  const brands = useMemo(() => {
    const list = new Set<string>();
    allProducts.forEach(p => {
      if (p.brand) list.add(p.brand);
    });
    return ['all', ...Array.from(list).sort()];
  }, [allProducts]);

  // Main compilation for quantities sold analysis
  const quantityAnalysisData = useMemo(() => {
    let totalUnitsSold = 0;
    let totalReturnedUnits = 0;
    const productQuantityMap: { 
      [id: string]: { 
        id: string;
        name: string; 
        sku: string; 
        quantity: number; 
        returned: number; 
        totalRevenue: number; 
        category: string; 
        brand: string; 
      } 
    } = {};
    const categoryQuantityMap: { [cat: string]: number } = {};
    const brandQuantityMap: { [brand: string]: number } = {};

    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        const netQty = Math.max(0, item.quantity - (item.returnedQuantity || 0));
        const returnedQty = item.returnedQuantity || 0;
        
        totalUnitsSold += netQty;
        totalReturnedUnits += returnedQty;

        // Find product details
        const prod = allProducts.find(p => p.id === item.productId);
        const category = prod?.category || 'Uncategorized';
        const brand = prod?.brand || 'Generic';
        const sku = prod?.sku || 'N/A';

        if (!productQuantityMap[item.productId]) {
          productQuantityMap[item.productId] = {
            id: item.productId,
            name: item.name,
            sku,
            quantity: 0,
            returned: 0,
            totalRevenue: 0,
            category,
            brand
          };
        }
        productQuantityMap[item.productId].quantity += netQty;
        productQuantityMap[item.productId].returned += returnedQty;
        productQuantityMap[item.productId].totalRevenue += (item.subtotal || 0);

        // Category map
        categoryQuantityMap[category] = (categoryQuantityMap[category] || 0) + netQty;

        // Brand map
        brandQuantityMap[brand] = (brandQuantityMap[brand] || 0) + netQty;
      });
    });

    // Convert map to sorted list
    const rawProductsList = Object.values(productQuantityMap);

    // Apply search and dropdown filters
    const filteredProductsList = rawProductsList.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(analysisSearch.toLowerCase()) || 
                            p.sku.toLowerCase().includes(analysisSearch.toLowerCase());
      const matchesCategory = analysisCategory === 'all' || p.category === analysisCategory;
      const matchesBrand = analysisBrand === 'all' || p.brand === analysisBrand;
      return matchesSearch && matchesCategory && matchesBrand;
    }).sort((a, b) => b.quantity - a.quantity);

    // Also get the full non-filtered top products for most sold item calculation
    const sortedAllProductsByQty = [...rawProductsList].sort((a, b) => b.quantity - a.quantity);
    const mostPopular = sortedAllProductsByQty[0] || null;

    const categoriesList = Object.entries(categoryQuantityMap)
      .map(([name, qty]) => ({ name, quantity: qty }))
      .sort((a, b) => b.quantity - a.quantity);

    const brandsList = Object.entries(brandQuantityMap)
      .map(([name, qty]) => ({ name, quantity: qty }))
      .sort((a, b) => b.quantity - a.quantity);

    // Quantities sold trend data matches chartData dates exactly
    const quantityTrendData = chartData.map(d => {
      let bucketSales = [];
      if (groupBy === 'day') {
        bucketSales = filteredSales.filter(s => isSameDay(s.timestamp.toDate(), d.fullDate));
      } else if (groupBy === 'month') {
        bucketSales = filteredSales.filter(s => isSameMonth(s.timestamp.toDate(), d.fullDate));
      } else {
        bucketSales = filteredSales.filter(s => isSameYear(s.timestamp.toDate(), d.fullDate));
      }

      const units = bucketSales.reduce((sum, s) => {
        return sum + s.items.reduce((itemSum, item) => itemSum + Math.max(0, item.quantity - (item.returnedQuantity || 0)), 0);
      }, 0);

      const returns = bucketSales.reduce((sum, s) => {
        return sum + s.items.reduce((itemSum, item) => itemSum + (item.returnedQuantity || 0), 0);
      }, 0);

      return {
        name: d.name,
        subLabel: d.subLabel,
        unitsSold: units,
        returns,
      };
    });

    return {
      totalUnitsSold,
      totalReturnedUnits,
      productsList: filteredProductsList,
      categoriesList,
      brandsList,
      mostPopular,
      quantityTrendData
    };
  }, [filteredSales, allProducts, chartData, groupBy, analysisSearch, analysisCategory, analysisBrand]);

  // Employee Performance data calculation
  const employeePerformanceData = useMemo(() => {
    // 1. Filter attendance logs by active range & location
    const filteredAttendance = allAttendance.filter(log => {
      const logDate = log.timeIn?.toDate?.() || new Date(log.date);
      const inRange = logDate >= activeDateRange.start && logDate <= activeDateRange.end;
      const matchesLocation = selectedLocationId === 'all' || log.locationId === selectedLocationId;
      return inRange && matchesLocation;
    });

    // We only care about employees who are 'staff' or 'manager' or have any sales/attendance records
    const relevantUsers = allUsers.filter(u => u.role === 'staff' || u.role === 'manager' || u.role === 'admin');

    const performanceList = relevantUsers.map(user => {
      // Sales for this user (filteredSales is already filtered by location and active range!)
      const userSales = filteredSales.filter(s => s.staffId === user.id);
      
      const totalOrders = userSales.length;
      
      const totalRevenue = userSales.reduce((sum, s) => {
        const returnedAmount = (s.items || []).reduce((subSum, item) => subSum + ((item.price ?? 0) * (item.returnedQuantity || 0)), 0);
        return sum + Math.max(0, (s.total ?? 0) - returnedAmount);
      }, 0);

      const totalQuantitiesSold = userSales.reduce((sum, s) => {
        return sum + (s.items || []).reduce((itemSum, item) => itemSum + Math.max(0, item.quantity - (item.returnedQuantity || 0)), 0);
      }, 0);

      const totalReturnedQuantities = userSales.reduce((sum, s) => {
        return sum + (s.items || []).reduce((itemSum, item) => itemSum + (item.returnedQuantity || 0), 0);
      }, 0);

      // Attendance for this user
      const userAttendance = filteredAttendance.filter(log => log.userId === user.id);
      const shiftsWorked = userAttendance.length;
      
      const totalMinutesWorked = userAttendance.reduce((sum, log) => {
        if (!log.timeIn || !log.timeOut) return sum;
        const inTime = log.timeIn.toDate();
        const outTime = log.timeOut.toDate();
        return sum + Math.max(0, Math.floor((outTime.getTime() - inTime.getTime()) / 60000));
      }, 0);

      const totalHoursWorked = Number((totalMinutesWorked / 60).toFixed(1));

      // KPIs
      const revenuePerShift = shiftsWorked > 0 ? Number((totalRevenue / shiftsWorked).toFixed(2)) : 0;
      const revenuePerHour = totalHoursWorked > 0 ? Number((totalRevenue / totalHoursWorked).toFixed(2)) : 0;
      const quantitiesSoldPerShift = shiftsWorked > 0 ? Number((totalQuantitiesSold / shiftsWorked).toFixed(1)) : 0;
      const quantitiesSoldPerHour = totalHoursWorked > 0 ? Number((totalQuantitiesSold / totalHoursWorked).toFixed(1)) : 0;
      const salesAccuracyRate = (totalQuantitiesSold + totalReturnedQuantities) > 0 
        ? Number(((totalQuantitiesSold / (totalQuantitiesSold + totalReturnedQuantities)) * 100).toFixed(1)) 
        : 100;

      return {
        id: user.id,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        role: user.role,
        locationId: user.locationId,
        totalOrders,
        totalRevenue,
        totalQuantitiesSold,
        totalReturnedQuantities,
        shiftsWorked,
        totalHoursWorked,
        revenuePerShift,
        revenuePerHour,
        quantitiesSoldPerShift,
        quantitiesSoldPerHour,
        salesAccuracyRate
      };
    });

    // Filter by name and role
    const filteredList = performanceList.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(performanceSearch.toLowerCase()) ||
                            p.email.toLowerCase().includes(performanceSearch.toLowerCase());
      const matchesRole = performanceRole === 'all' || p.role === performanceRole;
      return matchesSearch && matchesRole;
    });

    // Find Leaders
    const salesVolumeLeader = [...performanceList].sort((a, b) => b.totalQuantitiesSold - a.totalQuantitiesSold)[0] || null;
    const revenueLeader = [...performanceList].sort((a, b) => b.totalRevenue - a.totalRevenue)[0] || null;
    const hoursLeader = [...performanceList].sort((a, b) => b.totalHoursWorked - a.totalHoursWorked)[0] || null;
    const efficiencyLeader = [...performanceList]
      .filter(p => p.totalHoursWorked > 0)
      .sort((a, b) => b.quantitiesSoldPerHour - a.quantitiesSoldPerHour)[0] || null;

    return {
      employees: filteredList,
      allEmployeesRaw: performanceList,
      leaders: {
        salesVolume: salesVolumeLeader && salesVolumeLeader.totalQuantitiesSold > 0 ? salesVolumeLeader : null,
        revenue: revenueLeader && revenueLeader.totalRevenue > 0 ? revenueLeader : null,
        hours: hoursLeader && hoursLeader.totalHoursWorked > 0 ? hoursLeader : null,
        efficiency: efficiencyLeader && efficiencyLeader.quantitiesSoldPerHour > 0 ? efficiencyLeader : null
      }
    };
  }, [allUsers, allAttendance, filteredSales, activeDateRange, selectedLocationId, performanceSearch, performanceRole]);

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

  const StatCard = ({ title, value, icon: Icon, description, trend, trendValue, className }: any) => {
    const isRevenue = title.toLowerCase().includes('revenue');
    const isOrders = title.toLowerCase().includes('orders');
    const isLowStock = title.toLowerCase().includes('low stock');

    if (isRevenue) {
      return (
        <Card className={cn("overflow-hidden bg-gradient-to-br from-[#1C2D4E] to-[#0D1627] text-white border-none shadow-md shadow-indigo-950/10 relative group hover:scale-[1.02] transition-all duration-300", className)}>
          <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 group-hover:scale-125 transition-transform duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-bold text-white/70 uppercase tracking-widest">{title}</CardTitle>
            <div className="p-1.5 bg-white/10 rounded-lg relative z-10">
              <Icon className="h-3.5 w-3.5 text-[#D4AF37]" />
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3.5">
            <div className="text-xl font-black tracking-tight font-heading text-white">{value}</div>
            <p className="text-[10px] text-[#D4AF37] mt-0.5 flex items-center gap-1 font-semibold">
              {trend && (
                <span className="flex items-center text-emerald-400">
                  <ArrowUpRight className="w-3 h-3 stroke-[2.5px]" />
                  {trendValue}%
                </span>
              )}
              <span className="text-white/60 font-normal">{description}</span>
            </p>
          </CardContent>
        </Card>
      );
    }

    if (isOrders) {
      return (
        <Card className={cn("overflow-hidden bg-gradient-to-br from-[#A0522D] to-[#804224] text-white border-none shadow-md shadow-amber-950/10 relative group hover:scale-[1.02] transition-all duration-300", className)}>
          <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 group-hover:scale-125 transition-transform duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-bold text-white/70 uppercase tracking-widest">{title}</CardTitle>
            <div className="p-1.5 bg-white/10 rounded-lg relative z-10">
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3.5">
            <div className="text-xl font-black tracking-tight font-heading text-white">{value}</div>
            <p className="text-[10px] text-white/80 mt-0.5 flex items-center gap-1 font-semibold">
              {trend && (
                <span className="flex items-center text-amber-300">
                  <ArrowUpRight className="w-3 h-3 stroke-[2.5px]" />
                  {trendValue}%
                </span>
              )}
              <span className="text-white/50 font-normal">{description}</span>
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={cn("overflow-hidden bg-white hover:bg-slate-50/50 border-slate-200/60 shadow-sm relative group hover:scale-[1.01] transition-all duration-300", className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
          <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</CardTitle>
          <div className={cn("p-1.5 rounded-lg transition-colors", isLowStock && value > 0 ? "bg-rose-100" : "bg-slate-100")}>
            <Icon className={cn("h-3.5 w-3.5", isLowStock && value > 0 ? "text-rose-600" : "text-[#1A2B4B]")} />
          </div>
        </CardHeader>
        <CardContent className="pb-3 px-3.5">
          <div className={cn("text-xl font-black tracking-tight font-heading", isLowStock && value > 0 ? "text-rose-600 font-bold" : "text-[#1A2B4B]")}>{value}</div>
          <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
            {description}
          </p>
        </CardContent>
      </Card>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5 pb-8"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1A2B4B] tracking-tight font-heading flex items-center gap-1.5">
            Dashboard
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Real-time overview of your inventory and sales performance.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/pos">
            <Button className="bg-gradient-to-r from-[#1C2D4E] to-[#0D1627] hover:from-[#253D68] hover:to-[#14233F] text-white shadow-md shadow-[#1A2B4B]/10 border-none transition-all duration-300 gap-1.5 h-8 px-3 text-xs font-bold">
              <Plus className="w-3.5 h-3.5" />
              New Sale
            </Button>
          </Link>
          <Link to="/inventory">
            <Button variant="outline" className="gap-1.5 border-[#D4AF37]/25 hover:bg-[#D4AF37]/5 text-slate-700 h-8 px-3 text-xs font-semibold">
              <Package className="w-3.5 h-3.5" />
              Add Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="border-b border-slate-200/60 pb-1.5 flex items-center">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveDashboardTab('overview')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
              activeDashboardTab === 'overview'
                ? "bg-white text-[#1A2B4B] shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveDashboardTab('analysis')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5",
              activeDashboardTab === 'analysis'
                ? "bg-white text-[#1A2B4B] shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Quantities Sold Analysis
          </button>
          <button
            onClick={() => setActiveDashboardTab('performance')}
            className={cn(
              "px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5",
              activeDashboardTab === 'performance'
                ? "bg-white text-[#1A2B4B] shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            Employee Performance
          </button>
        </div>
      </div>

      {/* Shared Range Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white/75 backdrop-blur-sm p-3 rounded-xl border border-slate-200/50 shadow-sm">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Range:</Label>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px] h-9 bg-white text-xs">
              <SelectValue>
                {timeRange === 'today' ? 'Today' : 
                 timeRange === '7days' ? 'Last 7 Days' : 
                 timeRange === '30days' ? 'Last 30 Days' : 
                 timeRange === 'month' ? 'This Month' : 
                 timeRange === 'lastMonth' ? 'Last Month' : 
                 timeRange === 'year' ? 'This Year' : 
                 timeRange === 'lastYear' ? 'Last Year' : 
                 timeRange === 'custom' ? 'Custom Range' : timeRange}
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
        </div>

        {timeRange === 'custom' && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-4 animate-in fade-in slide-in-from-left-2 duration-300">
            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">From:</Label>
            <Input 
              type="date" 
              value={customStartDate} 
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="h-9 text-xs w-[130px] bg-white border-slate-200 focus:ring-[#1A2B4B]"
            />
            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">To:</Label>
            <Input 
              type="date" 
              value={customEndDate} 
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="h-9 text-xs w-[130px] bg-white border-slate-200 focus:ring-[#1A2B4B]"
            />
          </div>
        )}

        <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Group By:</Label>
          <div className="flex p-1 bg-slate-100 rounded-lg">
            {(['day', 'month', 'year'] as const).map(p => (
              <button
                key={p}
                onClick={() => setGroupBy(p)}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase tracking-tight rounded-md transition-all",
                  groupBy === p ? "bg-white text-[#1A2B4B] shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeDashboardTab === 'overview' ? (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard 
              title="Total Revenue" 
              value={`${settings.currency}${stats.totalSales.toLocaleString()}`} 
              icon={DollarSign}
              description={`Filtered period`}
              trend="up"
              trendValue="12.5"
            />
            <StatCard 
              title="Sales Orders" 
              value={stats.totalOrders} 
              icon={ShoppingBag}
              description={`Filtered period`}
              trend="up"
              trendValue="8.2"
            />
            <StatCard 
              title="Inventory Items" 
              value={stats.totalProducts} 
              icon={Package}
              description="Total products"
            />
            <StatCard 
              title="Low Stock Alerts" 
              value={stats.lowStockCount} 
              icon={AlertTriangle}
              description="Items needing restock"
              className={stats.lowStockCount > 0 ? "border-amber-200 bg-amber-50/50" : ""}
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-heading text-[#1A2B4B]">Revenue Overview</CardTitle>
              <CardDescription>Sales across the selected period grouped by {groupBy}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-[350px] pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1A2B4B" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#1A2B4B" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  dy={5}
                />
                <XAxis 
                  dataKey="subLabel"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 600 }}
                  interval={groupBy === 'day' ? (chartData.length > 15 ? 5 : 0) : 0}
                  xAxisId="sub"
                  dy={-5}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(value) => `${settings.currency}${value.toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`${settings.currency}${value.toLocaleString()}`, 'Revenue']}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      const data = payload[0].payload;
                      return `${data.name} ${data.subLabel || ''}`;
                    }
                    return label;
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#1A2B4B" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorAmount)" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Selling Products - moved here */}
        <Card className="shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg font-heading text-[#1A2B4B]">Top Selling Products</CardTitle>
            <CardDescription>By revenue generated this period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts.length === 0 ? (
                <div className="text-center py-8 text-slate-400 italic">No sales data yet</div>
              ) : (
                topProducts.map((product, idx) => (
                  <div key={idx} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-300 w-4 group-hover:text-[#D4AF37] transition-colors">{idx + 1}</span>
                      <span className="text-sm font-medium text-slate-700">{product.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#1A2B4B]">{settings.currency}{(product.total ?? 0).toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500">{product.quantity} units sold</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-heading text-[#1A2B4B]">Revenue by Location</CardTitle>
              <CardDescription>Distribution of revenue across different branches</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-[350px] pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={locationChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <XAxis 
                  dataKey="subLabel"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 600 }}
                  interval={groupBy === 'day' ? (locationChartData.length > 15 ? 5 : 0) : 0}
                  xAxisId="sub"
                  dy={-10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(value) => `${settings.currency}${value.toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`${settings.currency}${value.toLocaleString()}`, '']}
                  cursor={{ fill: '#f1f5f9' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                {locations.filter(l => selectedLocationId === 'all' || l.id === selectedLocationId).map((loc, index) => {
                  const colors = ['#1A2B4B', '#D4AF37', '#22c55e', '#ef4444', '#a855f7', '#3b82f6'];
                  return (
                    <Bar 
                      key={loc.id} 
                      dataKey={loc.name} 
                      fill={colors[index % colors.length]} 
                      radius={[4, 4, 0, 0]} 
                      stackId="location"
                      animationDuration={1500}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Sales - existing card */}
        <Card className="shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-heading text-[#1A2B4B]">Recent Sales</CardTitle>
              <CardDescription>Latest transactions</CardDescription>
            </div>
            <History className="w-5 h-5 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center gap-4 group cursor-pointer">
                  <div className="w-9 h-9 rounded-lg bg-[#1A2B4B]/5 flex items-center justify-center text-[#1A2B4B] font-bold group-hover:bg-[#1A2B4B] group-hover:text-white transition-all">
                    {(getPaymentMethodName(sale.paymentMethod)?.[0] || 'S').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#1A2B4B] truncate">
                      {sale.items.map(i => i.name).join(', ')}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {format(sale.timestamp.toDate(), 'HH:mm')} • {getPaymentMethodName(sale.paymentMethod)}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-0.5">
                    <div className="text-xs font-bold text-[#1A2B4B]">
                      +{settings.currency}{(() => {
                        const returnedAmount = (sale.items || []).reduce((sum, item) => sum + ((item.price ?? 0) * (item.returnedQuantity || 0)), 0);
                        const netTotal = Math.max(0, (sale.total ?? 0) - returnedAmount);
                        return netTotal.toFixed(2);
                      })()}
                    </div>
                    {sale.status === 'returned' && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 font-bold leading-none">Returned</span>
                    )}
                    {sale.status === 'partially_returned' && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-600 font-bold leading-none">Partially Returned</span>
                    )}
                  </div>
                </div>
              ))}
              <Link to="/reports" className="block pt-2">
                <Button variant="ghost" className="w-full text-[10px] h-8 text-[#1A2B4B] uppercase tracking-wider font-bold gap-1">
                  Full Sales Report <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Low Stock Alerts - existing but updated */}
        <Card className="shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2 text-[#1A2B4B]">
              Low Stock Alerts
              {lowStockAlerts.length > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px] bg-rose-500">
                  {lowStockAlerts.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Items needing replenishment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {lowStockAlerts.length === 0 ? (
                <div className="text-center py-8 text-emerald-500 font-medium flex flex-col items-center gap-2 col-span-2">
                  <CheckCircle2 className="w-8 h-8 opacity-20" />
                  All stock levels healthy
                </div>
              ) : (
                lowStockAlerts.slice(0, 10).map((alert, idx) => (
                  <div key={`${alert.product.id}-${alert.locationId}-${idx}`} className="flex items-center justify-between p-3 rounded-xl bg-rose-50/30 border border-rose-100">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#1A2B4B] truncate">{alert.product.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge variant="outline" className="text-[8px] h-3 px-1 py-0 border-indigo-100 bg-indigo-50 text-indigo-600 font-bold uppercase tracking-tighter">
                          {alert.locationName}
                        </Badge>
                        <span className="text-[9px] text-slate-400 font-mono">SKU: {alert.product.sku}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-rose-600">
                        {alert.stock}
                      </p>
                      <p className="text-[9px] text-slate-400">Target: {alert.threshold}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {lowStockAlerts.length > 10 && (
              <p className="text-[10px] text-center text-slate-400 mt-4 italic">And {lowStockAlerts.length - 10} more alerts...</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity - existing but updated */}
        <Card className="shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg font-heading text-[#1A2B4B]">Recent Activity</CardTitle>
            <CardDescription>Audit trails and system logs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((log) => (
                <div key={log.id} className="flex gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="w-2 h-2 rounded-full bg-[#D4AF37] mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#1A2B4B] leading-snug">
                      {log.details}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="w-4 h-4 rounded px-1 bg-slate-100 text-[8px] font-bold text-slate-500 flex items-center justify-center">
                        {log.userName[0]}
                      </div>
                      <p className="text-[9px] text-slate-400">
                        {format(log.timestamp.toDate(), 'HH:mm')} • {log.userName}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* System Patch Notes - Admin Restricted */}
        {isAdmin && (
          <Card className="shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm flex flex-col">
            <CardHeader className="pb-3 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg font-heading text-[#1A2B4B] flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#D4AF37]" />
                  System Patch Notes
                </CardTitle>
                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200 text-[8px] uppercase font-bold tracking-wider py-0.5 shrink-0">
                  <ShieldCheck className="w-3 h-3 mr-1 inline-block" />
                  Admin Secure
                </Badge>
              </div>
              <CardDescription>Official release history & developer protections</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[380px] overflow-y-auto pr-1 flex-1">
              {/* Support Terms Warning */}
              <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs space-y-1.5">
                <div className="font-bold text-amber-800 flex items-center gap-1.5 uppercase tracking-wide text-[10px]">
                  <span>⚠️ Developer Support Guarantee</span>
                </div>
                <p className="text-slate-600 text-[10px] leading-relaxed">
                  This system receives <strong>permanent technical support</strong> (lifetime bug-fixes, database updates, and performance optimizations). 
                </p>
                <p className="text-slate-600 text-[10px] leading-relaxed font-semibold">
                  Note: Any duplication, redistribution, or resale of this application to third parties will result in immediate, automatic termination of free lifetime support.
                </p>
              </div>

              {/* Patch 1.9 */}
              <div className="space-y-1.5 border-l-2 border-[#D4AF37] pl-3 py-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-[#1A2B4B]">Patch v1.9: POS Customer Autocomplete, Staff Directory Access & Management Authorization</h4>
                  <span className="text-[8px] font-mono text-[#D4AF37] bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold animate-pulse">Latest</span>
                </div>
                <ul className="text-[10px] text-slate-600 list-disc list-inside space-y-1 leading-relaxed">
                  <li><strong>POS Customer Autocomplete Search:</strong> Replaced the customer dropdown with an interactive search input featuring real-time suggestions, name/phone/email filtering, and hardware/barcode loyalty card scanning (defaults to Walk-In Customer).</li>
                  <li><strong>Staff Directory & Loyalty Registration:</strong> Extended Directory access to Staff role users, restricted specifically to viewing and registering Customers and Loyalty Cards.</li>
                  <li><strong>Branch Selector Access:</strong> Allowed Staff & Managers to switch or filter locations dynamically across POS, Inventory, and Purchasing.</li>
                  <li><strong>Manager Void Authorization:</strong> Updated Sales History, Returns, and Purchasing permissions allowing Managers alongside Administrators to void sales, void returns, and void purchase orders.</li>
                </ul>
              </div>

              {/* Patch 1.8 */}
              <div className="space-y-1.5 border-l-2 border-slate-300 pl-3 py-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-[#1A2B4B]">Patch v1.8: Customer Search & Default Selection Rework</h4>
                  <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-bold">Stable</span>
                </div>
                <ul className="text-[10px] text-slate-600 list-disc list-inside space-y-1 leading-relaxed">
                  <li><strong>Customer Name Search:</strong> Allowed searching customer names directly in the Sales History searchbox, filtering records across Sales, Returns, and Pending Payments.</li>
                  <li><strong>Finance Cash Account Alignment:</strong> Tied the default Cash filter and ledger aggregation directly to the configured Cash account created in Finance/Accounts rather than hardcoded fallbacks.</li>
                  <li><strong>Saturday–Friday Weekly Cycle:</strong> Updated weekly date ranges to run from Saturday to Friday (matching the Friday cutoff). On Saturdays, the filter retains the week that ended Friday, rolling over to the new Saturday–Friday week on Sundays.</li>
                </ul>
              </div>

              {/* Patch 1.7 */}
              <div className="space-y-1.5 border-l-2 border-slate-300 pl-3 py-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-[#1A2B4B]">Patch v1.7: Editable Checkout, Range Schedules, & Admin Controls</h4>
                  <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-bold">Stable</span>
                </div>
                <ul className="text-[10px] text-slate-600 list-disc list-inside space-y-1 leading-relaxed">
                  <li><strong>Editable Checkout Totals & Approvals:</strong> Staff and managers can now override the computed total during checkout. Overridden checkout totals are flagged as pending total approval, preventing immediate transaction ledger postings until approved by an Admin or Manager.</li>
                  <li><strong>Date Ranges & Auto-Plot on Schedule Changes:</strong> Staff schedule change requests now support start/end date ranges (with optional end date). Once approved, the changes are automatically plotted across the selected date range in the schedules database.</li>
                  <li><strong>Admin-Restricted Expense Deletion:</strong> Expense history items can now only be deleted by Administrators. Deletion automatically reverses the entry and refunds the original account's balance.</li>
                  <li><strong>Negative Promo Safeguards:</strong> Prevented negative values when configuring or updating promotion codes.</li>
                  <li><strong>Ledger Reference Auditing:</strong> Standardized display of transaction and payment split references inside Sales lists and the Unified Ledger.</li>
                </ul>
              </div>

              {/* Patch 1.6 */}
              <div className="space-y-1.5 border-l-2 border-slate-300 pl-3 py-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-[#1A2B4B]">Patch v1.6: Account Control & Logistical Categories</h4>
                  <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-bold">Stable</span>
                </div>
                <ul className="text-[10px] text-slate-600 list-disc list-inside space-y-1 leading-relaxed">
                  <li><strong>Account Status Control:</strong> Admins can now toggle the active status of any financial account directly in the Finance Accounts Overview. Inactive accounts are automatically hidden from selection in POS checkouts, returns, expense tabs, and transfers.</li>
                  <li><strong>Delivery & Shipping Category:</strong> Added "Delivery/Shipping Fee" as a standard category inside the Expense logs and claims selectors for more precise logistical cost tracking.</li>
                </ul>
              </div>

              {/* Patch 1.5 */}
              <div className="space-y-1.5 border-l-2 border-slate-300 pl-3 py-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-[#1A2B4B]">Patch v1.5: Unified Financial Ledger & Net Flows</h4>
                  <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-bold">Stable</span>
                </div>
                <ul className="text-[10px] text-slate-600 list-disc list-inside space-y-1 leading-relaxed">
                  <li><strong>Unified Ledger Tab:</strong> Introduced a new 'Unified Ledger' tab in Sales & Returns History displaying all inflows and outflows (Sales, Returns, Voids, Expenses, Transfers) line-by-line.</li>
                  <li><strong>Balance Sheet KPI:</strong> Added aggregate summaries showing Total Cash In, Total Cash Out, and the Net Cash Balance Impact dynamically reflecting chosen filters.</li>
                  <li><strong>Account Auditing:</strong> Included direct account balances, transaction descriptors, and transfer flow pathways (source ➔ destination) for comprehensive auditing.</li>
                </ul>
              </div>

              {/* Patch 1.4 */}
              <div className="space-y-1.5 border-l-2 border-slate-300 pl-3 py-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-[#1A2B4B]">Patch v1.4: Delivery Fees & Tappable Presets</h4>
                  <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-bold">Stable</span>
                </div>
                <ul className="text-[10px] text-slate-600 list-disc list-inside space-y-1 leading-relaxed">
                  <li><strong>Cumulative Presets:</strong> Enabled POS quick bill buttons (e.g., +50, +100) to accumulate on consecutive taps instead of replacing the input.</li>
                  <li><strong>Standardized Defaults:</strong> Added default delivery fee of 50 for Online orders, while keeping In-Store order delivery fees defaulted to zero.</li>
                </ul>
              </div>

              {/* Patch 1.3 */}
              <div className="space-y-1.5 border-l-2 border-slate-300 pl-3 py-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-[#1A2B4B]">Patch v1.3: Expenses & Transfers</h4>
                  <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-bold">Stable</span>
                </div>
                <ul className="text-[10px] text-slate-600 list-disc list-inside space-y-1 leading-relaxed">
                  <li><strong>POS Calculator:</strong> Added instant change computation at checkout to prevent mental math mistakes.</li>
                  <li><strong>Expense Tracking:</strong> Added an Expenses tab for all users to record overhead, track date/entered-by, and select source accounts.</li>
                  <li><strong>Fund Transfers:</strong> Enabled moving money between liquid accounts with source and destination tracking.</li>
                  <li><strong>Employee KPIs:</strong> Created performance dashboards analyzing individual sold volume, shifts, and productivity.</li>
                </ul>
              </div>

              {/* Patch 1.2 */}
              <div className="space-y-1.5 border-l-2 border-slate-300 pl-3 py-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-[#1A2B4B]">Patch v1.2: Stock Permissions</h4>
                  <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-bold">Stable</span>
                </div>
                <ul className="text-[10px] text-slate-600 list-disc list-inside space-y-1 leading-relaxed">
                  <li><strong>Security Bounds:</strong> Staff accounts are strictly restricted to seeing inventory stock quantities associated only with their assigned branch/location.</li>
                  <li><strong>Admin Deck:</strong> Multi-branch global distribution matrix and stock maps remain restricted to authorized Admin accounts to deter unauthorized leaks.</li>
                </ul>
              </div>

              {/* Patch 1.1 */}
              <div className="space-y-1.5 border-l-2 border-slate-300 pl-3 py-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-[#1A2B4B]">Patch v1.1: Multi-Mode POS</h4>
                  <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-bold">Stable</span>
                </div>
                <ul className="text-[10px] text-slate-600 list-disc list-inside space-y-1 leading-relaxed">
                  <li><strong>Grouped List View:</strong> Introduced default Category & Brand hierarchically grouped register view to streamline lists under deep catalogs.</li>
                  <li><strong>Grid View Toggle:</strong> Enabled interactive controls to alternate list layouts with standard graphic product cards.</li>
                  <li><strong>Bulk Cart Controls:</strong> Added fast-action "Add Qty" increment blocks to scale register feeds.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  ) : activeDashboardTab === 'analysis' ? (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Analysis Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="overflow-hidden bg-gradient-to-br from-[#1C2D4E] to-[#0D1627] text-white border-none shadow-md shadow-indigo-950/10 relative group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 group-hover:scale-125 transition-transform duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Net Units Sold</CardTitle>
            <div className="p-1.5 bg-white/10 rounded-lg">
              <ShoppingBag className="h-3.5 w-3.5 text-[#D4AF37]" />
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3.5">
            <div className="text-xl font-black tracking-tight font-heading text-white">
              {quantityAnalysisData.totalUnitsSold.toLocaleString()}
            </div>
            <p className="text-[10px] text-white/60 mt-0.5">
              Net items purchased across period
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-white border-slate-200/60 shadow-sm relative group hover:scale-[1.02] transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Returned Units</CardTitle>
            <div className="p-1.5 bg-rose-50 rounded-lg">
              <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3.5">
            <div className={cn("text-xl font-black tracking-tight font-heading", quantityAnalysisData.totalReturnedUnits > 0 ? "text-rose-600" : "text-[#1A2B4B]")}>
              {quantityAnalysisData.totalReturnedUnits.toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Units returned by customers
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-white border-slate-200/60 shadow-sm relative group hover:scale-[1.02] transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Most Popular Item</CardTitle>
            <div className="p-1.5 bg-amber-50 rounded-lg">
              <Award className="h-3.5 w-3.5 text-[#D4AF37]" />
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3.5">
            <div className="text-sm font-bold text-[#1A2B4B] truncate max-w-full">
              {quantityAnalysisData.mostPopular ? quantityAnalysisData.mostPopular.name : 'N/A'}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5 font-semibold">
              {quantityAnalysisData.mostPopular 
                ? `${quantityAnalysisData.mostPopular.quantity} units sold`
                : 'No units sold'
              }
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-white border-slate-200/60 shadow-sm relative group hover:scale-[1.02] transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unit Return Rate</CardTitle>
            <div className="p-1.5 bg-slate-100 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5 text-slate-500" />
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3.5">
            <div className="text-xl font-black tracking-tight font-heading text-[#1A2B4B]">
              {(() => {
                const total = quantityAnalysisData.totalUnitsSold + quantityAnalysisData.totalReturnedUnits;
                if (total === 0) return '0.0%';
                return `${((quantityAnalysisData.totalReturnedUnits / total) * 100).toFixed(1)}%`;
              })()}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Percentage of sold items returned
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Units Sold Trend Chart */}
      <Card className="shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-lg font-heading text-[#1A2B4B]">Units Sold & Returns Trend</CardTitle>
            <CardDescription>Product volumes and returns over the selected time range</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="h-[300px] pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={quantityAnalysisData.quantityTrendData}>
              <defs>
                <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1A2B4B" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#1A2B4B" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorReturns" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#64748b' }}
                dy={5}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Area 
                type="monotone" 
                name="Units Sold"
                dataKey="unitsSold" 
                stroke="#1A2B4B" 
                strokeWidth={2.5}
                fillOpacity={1} 
                fill="url(#colorUnits)" 
              />
              <Area 
                type="monotone" 
                name="Units Returned"
                dataKey="returns" 
                stroke="#f43f5e" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorReturns)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Category & Brand Leaders */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-md font-heading text-[#1A2B4B] flex items-center gap-1.5">
              Category Breakdown
            </CardTitle>
            <CardDescription>Total quantities sold by category</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[300px] overflow-y-auto">
            {quantityAnalysisData.categoriesList.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">No category sales found</p>
            ) : (
              <div className="space-y-3">
                {quantityAnalysisData.categoriesList.map((cat, idx) => {
                  const maxQty = Math.max(...quantityAnalysisData.categoriesList.map(c => c.quantity), 1);
                  const pct = (cat.quantity / maxQty) * 100;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">{cat.name}</span>
                        <span className="font-bold text-[#1A2B4B]">{cat.quantity} units</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-[#1A2B4B] h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-md font-heading text-[#1A2B4B] flex items-center gap-1.5">
              Brand Breakdown
            </CardTitle>
            <CardDescription>Total quantities sold by brand</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[300px] overflow-y-auto">
            {quantityAnalysisData.brandsList.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">No brand sales found</p>
            ) : (
              <div className="space-y-3">
                {quantityAnalysisData.brandsList.map((br, idx) => {
                  const maxQty = Math.max(...quantityAnalysisData.brandsList.map(b => b.quantity), 1);
                  const pct = (br.quantity / maxQty) * 100;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">{br.name}</span>
                        <span className="font-bold text-[#1A2B4B]">{br.quantity} units</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-[#D4AF37] h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Product Quantities Grid / Table */}
      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <CardTitle className="text-lg font-heading text-[#1A2B4B]">Detailed Quantities Sold</CardTitle>
            <CardDescription>Product volume sold breakdown with filters</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative w-full sm:w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search product/SKU..."
                value={analysisSearch}
                onChange={(e) => setAnalysisSearch(e.target.value)}
                className="pl-9 h-9 text-xs w-full bg-slate-50 border-slate-200 focus:ring-[#1A2B4B] rounded-lg"
              />
            </div>

            {/* Category select */}
            <div className="w-[130px] sm:w-[150px]">
              <Select value={analysisCategory} onValueChange={setAnalysisCategory}>
                <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 rounded-lg">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Brand select */}
            <div className="w-[120px] sm:w-[140px]">
              <Select value={analysisBrand} onValueChange={setAnalysisBrand}>
                <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 rounded-lg">
                  <SelectValue placeholder="Brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map(brand => (
                    <SelectItem key={brand} value={brand}>
                      {brand === 'all' ? 'All Brands' : brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Desktop and Tablet Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Product details</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Category / Brand</th>
                  <th className="py-3 px-4 text-right">Sold (Net)</th>
                  <th className="py-3 px-4 text-right">Returned</th>
                  <th className="py-3 px-4 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {quantityAnalysisData.productsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                      No matching products found
                    </td>
                  </tr>
                ) : (
                  quantityAnalysisData.productsList.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-[#1A2B4B]">{product.name}</p>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[10px] text-slate-500">
                        {product.sku}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className="bg-slate-100 text-[9px] hover:bg-slate-100 text-slate-600 font-semibold px-2">
                            {product.category}
                          </Badge>
                          <Badge variant="secondary" className="bg-amber-50 text-[9px] hover:bg-amber-50 text-amber-700 font-semibold px-2">
                            {product.brand}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-[#1A2B4B]">
                        {product.quantity}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {product.returned > 0 ? (
                          <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded text-[10px]">
                            {product.returned}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-700">
                        {settings.currency}{product.totalRevenue.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile list view layout to ensure pristine responsiveness */}
          <div className="block sm:hidden divide-y divide-slate-100">
            {quantityAnalysisData.productsList.length === 0 ? (
              <p className="py-8 text-center text-slate-400 italic text-xs">No matching products found</p>
            ) : (
              quantityAnalysisData.productsList.map((product) => (
                <div key={product.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-[#1A2B4B]">{product.name}</h4>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">SKU: {product.sku}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400">Net Sold</span>
                      <p className="font-black text-sm text-[#1A2B4B]">{product.quantity} units</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="bg-slate-100 text-[8px] text-slate-500 hover:bg-slate-100">
                        {product.category}
                      </Badge>
                      <Badge variant="secondary" className="bg-amber-50 text-[8px] text-amber-600 hover:bg-amber-50">
                        {product.brand}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 mr-2">Rev:</span>
                      <span className="font-bold text-slate-700 text-xs">{settings.currency}{product.totalRevenue.toLocaleString()}</span>
                    </div>
                  </div>

                  {product.returned > 0 && (
                    <div className="bg-rose-50/50 border border-rose-100 rounded-lg p-2 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Customer Returns</span>
                      <span className="text-rose-600 font-bold">{product.returned} returned</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  ) : (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Performance Leaders Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Sales Volume Leader */}
        <Card className="overflow-hidden bg-gradient-to-br from-[#1C2D4E] to-[#0D1627] text-white border-none shadow-md relative group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 group-hover:scale-125 transition-transform duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Top Sales Volume</CardTitle>
            <div className="p-1.5 bg-white/10 rounded-lg">
              <Award className="h-3.5 w-3.5 text-[#D4AF37]" />
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3.5">
            <div className="text-lg font-bold tracking-tight text-white truncate">
              {employeePerformanceData.leaders.salesVolume?.name || 'No sales'}
            </div>
            <p className="text-[10px] text-[#D4AF37] mt-0.5 font-semibold">
              {employeePerformanceData.leaders.salesVolume 
                ? `${employeePerformanceData.leaders.salesVolume.totalQuantitiesSold.toLocaleString()} units sold` 
                : 'No sales recorded yet'}
            </p>
          </CardContent>
        </Card>

        {/* Revenue Leader */}
        <Card className="overflow-hidden bg-gradient-to-br from-[#2D1C4E] to-[#160D27] text-white border-none shadow-md relative group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 group-hover:scale-125 transition-transform duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Top Revenue Generator</CardTitle>
            <div className="p-1.5 bg-white/10 rounded-lg">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3.5">
            <div className="text-lg font-bold tracking-tight text-white truncate">
              {employeePerformanceData.leaders.revenue?.name || 'No sales'}
            </div>
            <p className="text-[10px] text-emerald-400 mt-0.5 font-semibold">
              {employeePerformanceData.leaders.revenue 
                ? `${settings.currency}${employeePerformanceData.leaders.revenue.totalRevenue.toLocaleString()}` 
                : 'No sales recorded yet'}
            </p>
          </CardContent>
        </Card>

        {/* Hours / Attendance Leader */}
        <Card className="overflow-hidden bg-gradient-to-br from-[#1C4E3D] to-[#0D271E] text-white border-none shadow-md relative group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 group-hover:scale-125 transition-transform duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Most Hours Worked</CardTitle>
            <div className="p-1.5 bg-white/10 rounded-lg">
              <Clock className="h-3.5 w-3.5 text-sky-400" />
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3.5">
            <div className="text-lg font-bold tracking-tight text-white truncate">
              {employeePerformanceData.leaders.hours?.name || 'No hours'}
            </div>
            <p className="text-[10px] text-sky-400 mt-0.5 font-semibold">
              {employeePerformanceData.leaders.hours 
                ? `${employeePerformanceData.leaders.hours.totalHoursWorked} hrs (${employeePerformanceData.leaders.hours.shiftsWorked} shifts)` 
                : 'No hours recorded yet'}
            </p>
          </CardContent>
        </Card>

        {/* Efficiency Leader */}
        <Card className="overflow-hidden bg-gradient-to-br from-[#A0522D] to-[#804224] text-white border-none shadow-md relative group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 group-hover:scale-125 transition-transform duration-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3.5 px-3.5">
            <CardTitle className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Sales Efficiency</CardTitle>
            <div className="p-1.5 bg-white/10 rounded-lg">
              <Timer className="h-3.5 w-3.5 text-amber-300" />
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3.5">
            <div className="text-lg font-bold tracking-tight text-white truncate">
              {employeePerformanceData.leaders.efficiency?.name || 'No hours'}
            </div>
            <p className="text-[10px] text-amber-300 mt-0.5 font-semibold">
              {employeePerformanceData.leaders.efficiency 
                ? `${employeePerformanceData.leaders.efficiency.quantitiesSoldPerHour} units/hour` 
                : 'No hours recorded yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter toolbar and performance metrics visualization chart */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Performance Chart Card */}
        <Card className="shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg font-heading text-[#1A2B4B]">KPI Comparison Chart</CardTitle>
              <CardDescription>Visual comparisons between team members</CardDescription>
            </div>
            <Select 
              value={performanceChartMetric} 
              onValueChange={(val: any) => setPerformanceChartMetric(val)}
            >
              <SelectTrigger className="w-[160px] h-8 bg-white text-xs">
                <SelectValue placeholder="Select Metric" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="units" className="text-xs">Net Units Sold</SelectItem>
                <SelectItem value="hours" className="text-xs">Hours Worked</SelectItem>
                <SelectItem value="revenue" className="text-xs">Revenue Generated</SelectItem>
                <SelectItem value="efficiency" className="text-xs">Units Sold / Hour</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {employeePerformanceData.employees.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 italic text-xs">
                  No matching employees to compare
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={employeePerformanceData.employees.map(emp => ({
                      name: emp.name,
                      value: performanceChartMetric === 'units' ? emp.totalQuantitiesSold :
                             performanceChartMetric === 'hours' ? emp.totalHoursWorked :
                             performanceChartMetric === 'revenue' ? emp.totalRevenue :
                             emp.quantitiesSoldPerHour
                    }))}
                    margin={{ top: 20, right: 10, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      stroke="#94a3b8" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(value) => 
                        performanceChartMetric === 'revenue' 
                          ? `${settings.currency}${value.toLocaleString()}` 
                          : value
                      }
                    />
                    <Tooltip
                      contentStyle={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelClassName="text-xs font-bold text-slate-700 font-heading"
                      formatter={(value: any) => [
                        performanceChartMetric === 'revenue' 
                          ? `${settings.currency}${value.toLocaleString()}` 
                          : performanceChartMetric === 'units' 
                          ? `${value} units` 
                          : performanceChartMetric === 'hours' 
                          ? `${value} hours` 
                          : `${value} units/hour`,
                        performanceChartMetric === 'revenue' ? 'Net Revenue' :
                        performanceChartMetric === 'units' ? 'Net Units Sold' :
                        performanceChartMetric === 'hours' ? 'Hours Worked' :
                        'Units Sold / Hour'
                      ]}
                      cursor={{ fill: '#f1f5f9' }}
                    />
                    <Bar 
                      dataKey="value" 
                      fill={
                        performanceChartMetric === 'units' ? '#1A2B4B' :
                        performanceChartMetric === 'hours' ? '#10b981' :
                        performanceChartMetric === 'revenue' ? '#8b5cf6' :
                        '#f59e0b'
                      } 
                      radius={[4, 4, 0, 0]} 
                      animationDuration={1000}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Overview & Tips Card */}
        <Card className="shadow-sm border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg font-heading text-[#1A2B4B]">KPI Insights & Tips</CardTitle>
            <CardDescription>Understanding performance calculations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1 text-xs font-sans">
              <h4 className="font-bold text-indigo-950 flex items-center gap-1.5 uppercase tracking-wide text-[10px]">
                <Award className="w-3.5 h-3.5 text-[#D4AF37]" />
                Efficiency Index Formula
              </h4>
              <p className="text-slate-600 text-[10.5px] leading-relaxed font-sans">
                Calculated by dividing net units sold by total logged attendance hours. This metric allows you to compare sales volumes equitably across part-time and full-time shifts.
              </p>
            </div>

            <div className="p-3.5 bg-amber-50/50 border border-amber-100 rounded-xl space-y-1 text-xs font-sans">
              <h4 className="font-bold text-amber-950 flex items-center gap-1.5 uppercase tracking-wide text-[10px]">
                ⚠️ Returns Deterrence
              </h4>
              <p className="text-slate-600 text-[10.5px] leading-relaxed font-sans">
                High return rates can signal over-selling or product mismatches. Monitor Return Accuracies on the performance board to keep customer satisfaction metrics high.
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              <h4 className="text-xs font-bold text-slate-700">Team Statistics Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 text-[10px] block">Average Units/Shift</span>
                  <span className="font-bold text-slate-700">
                    {(() => {
                      const withShifts = employeePerformanceData.allEmployeesRaw.filter(e => e.shiftsWorked > 0);
                      if (withShifts.length === 0) return '0.0';
                      const avg = withShifts.reduce((sum, e) => sum + e.quantitiesSoldPerShift, 0) / withShifts.length;
                      return avg.toFixed(1);
                    })()}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 text-[10px] block">Average Sales Accuracy</span>
                  <span className="font-bold text-slate-700 font-mono">
                    {(() => {
                      const withSales = employeePerformanceData.allEmployeesRaw.filter(e => e.totalQuantitiesSold > 0);
                      if (withSales.length === 0) return '100%';
                      const avg = withSales.reduce((sum, e) => sum + e.salesAccuracyRate, 0) / withSales.length;
                      return `${avg.toFixed(1)}%`;
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-heading text-[#1A2B4B]">Staff Performance Ledger</CardTitle>
              <CardDescription>Individual metrics across sales volume and attendance</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative w-[180px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search staff..."
                  className="pl-8 h-8 text-xs bg-slate-50/50"
                  value={performanceSearch}
                  onChange={(e) => setPerformanceSearch(e.target.value)}
                />
              </div>

              {/* Role Filter */}
              <Select value={performanceRole} onValueChange={setPerformanceRole}>
                <SelectTrigger className="w-[120px] h-8 bg-slate-50/50 text-xs">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Roles</SelectItem>
                  <SelectItem value="staff" className="text-xs">Staff</SelectItem>
                  <SelectItem value="manager" className="text-xs">Manager</SelectItem>
                  <SelectItem value="admin" className="text-xs">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4 font-bold">Employee</th>
                  <th className="py-3.5 px-4 font-bold">Role</th>
                  <th className="py-3.5 px-4 font-bold text-center">Attendance Logs</th>
                  <th className="py-3.5 px-4 font-bold text-right">Net Units Sold</th>
                  <th className="py-3.5 px-4 font-bold text-right">Returns Acc.</th>
                  <th className="py-3.5 px-4 font-bold text-right">Net Revenue</th>
                  <th className="py-3.5 px-4 font-bold text-right">Sales / Hour</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {employeePerformanceData.employees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 italic text-xs">
                      No matching employee records found
                    </td>
                  </tr>
                ) : (
                  employeePerformanceData.employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/40 transition-colors font-medium text-slate-600">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-extrabold uppercase">
                            {emp.name[0]}
                          </div>
                          <div>
                            <span className="font-bold text-[#1A2B4B] block">{emp.name}</span>
                            <span className="text-[10px] text-slate-400 block font-normal">{emp.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[9px] px-1.5 py-0 font-bold uppercase tracking-wide",
                            emp.role === 'admin' ? "bg-rose-50 text-rose-600 border-rose-100" :
                            emp.role === 'manager' ? "bg-amber-50 text-amber-600 border-amber-100" :
                            "bg-indigo-50 text-indigo-600 border-indigo-100"
                          )}
                        >
                          {emp.role}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div>
                          <span className="font-bold text-slate-700 block">{emp.shiftsWorked} shifts</span>
                          <span className="text-[10px] text-slate-400 block font-normal">{emp.totalHoursWorked} hrs worked</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                        {emp.totalQuantitiesSold} units
                      </td>
                      <td className="py-3.5 px-4 text-right font-sans">
                        <div>
                          <span className={cn(
                            "font-bold block",
                            emp.salesAccuracyRate >= 95 ? "text-emerald-600" :
                            emp.salesAccuracyRate >= 85 ? "text-amber-500" :
                            "text-rose-500"
                          )}>
                            {emp.salesAccuracyRate}%
                          </span>
                          <span className="text-[10px] text-slate-400 block font-normal">{emp.totalReturnedQuantities} returns</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                        {settings.currency}{emp.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-[#1A2B4B]">
                        {emp.quantitiesSoldPerHour} / hr
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View for Responsiveness */}
          <div className="block sm:hidden divide-y divide-slate-100 font-sans">
            {employeePerformanceData.employees.length === 0 ? (
              <p className="py-8 text-center text-slate-400 italic text-xs">No matching employee records found</p>
            ) : (
              employeePerformanceData.employees.map((emp) => (
                <div key={emp.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold uppercase">
                        {emp.name[0]}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-[#1A2B4B]">{emp.name}</h4>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[8px] px-1 font-bold uppercase py-0 mt-0.5",
                            emp.role === 'admin' ? "bg-rose-50 text-rose-600 border-rose-100" :
                            emp.role === 'manager' ? "bg-amber-50 text-amber-600 border-amber-100" :
                            "bg-indigo-50 text-indigo-600 border-indigo-100"
                          )}
                        >
                          {emp.role}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-normal">Sales / Hr</span>
                      <p className="font-black text-sm text-[#1A2B4B]">{emp.quantitiesSoldPerHour} units</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-1.5 border-y border-dashed border-slate-100 text-center text-xs">
                    <div>
                      <span className="text-[9px] text-slate-400 block font-normal font-sans">Attendance</span>
                      <span className="font-bold text-slate-700 font-sans">{emp.shiftsWorked} shifts ({emp.totalHoursWorked}h)</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block font-normal font-sans">Units Sold</span>
                      <span className="font-bold text-slate-700 font-sans">{emp.totalQuantitiesSold}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block font-normal font-sans">Revenue</span>
                      <span className="font-bold text-slate-700 font-sans">{settings.currency}{Math.round(emp.totalRevenue).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-sans">
                    <span>Returns Accuracy Rate:</span>
                    <span className={cn(
                      "font-bold",
                      emp.salesAccuracyRate >= 95 ? "text-emerald-600" :
                      emp.salesAccuracyRate >= 85 ? "text-amber-500" :
                      "text-rose-500"
                    )}>
                      {emp.salesAccuracyRate}% ({emp.totalReturnedQuantities} returned)
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )}
</motion.div>
  );
};

export default Dashboard;
