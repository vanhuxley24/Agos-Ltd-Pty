import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingCart, 
  Package, 
  LayoutDashboard, 
  BookOpen, 
  History, 
  TrendingUp, 
  Wallet, 
  Clock, 
  Settings, 
  Building2, 
  ArrowRight,
  Waves,
  Zap,
  CheckCircle2,
  Sparkles,
  BarChart3,
  Layers,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocations } from '../contexts/LocationContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export const Home: React.FC = () => {
  const { profile, user } = useAuth();
  const { selectedLocation } = useLocations();
  const navigate = useNavigate();

  const activeLocationName = selectedLocation ? selectedLocation.name : 'All Store Locations';

  const modules = [
    {
      title: 'POS Register',
      description: 'Fast barcode scanning, multi-payment checkout, and instant print receipt processing.',
      icon: ShoppingCart,
      path: '/pos',
      accentColor: 'from-emerald-500 to-teal-600',
      badge: 'Active Workstation',
      roles: ['admin', 'manager', 'staff']
    },
    {
      title: 'Inventory Catalog',
      description: 'Stock management, low stock warnings, barcode assignment, and pricing tiers.',
      icon: Package,
      path: '/inventory',
      accentColor: 'from-[#1C2D4E] to-[#2B4570]',
      roles: ['admin', 'manager', 'staff']
    },
    {
      title: 'Directory & Loyalty',
      description: 'Customer profiles, VIP loyalty cards, supplier index, and staff roster.',
      icon: BookOpen,
      path: '/directory',
      accentColor: 'from-purple-600 to-indigo-700',
      roles: ['admin', 'manager', 'staff']
    },
    {
      title: 'Sales History',
      description: 'Daily transaction records, refund manager, discounts log, and receipt reprints.',
      icon: History,
      path: '/sales',
      accentColor: 'from-amber-500 to-amber-700',
      roles: ['admin', 'manager', 'staff']
    },
    {
      title: 'Financial Ledger',
      description: 'Cash registers, store accounts, daily expense entries, and cash flow audit.',
      icon: Wallet,
      path: '/finance',
      accentColor: 'from-blue-600 to-cyan-700',
      roles: ['admin', 'manager', 'staff']
    },
    {
      title: 'Timeclock & Schedule',
      description: 'Staff shift schedules, daily timekeeping, and attendance reports.',
      icon: Clock,
      path: '/attendance',
      accentColor: 'from-teal-600 to-emerald-700',
      roles: ['admin', 'manager', 'staff']
    },
    {
      title: 'Executive Dashboard',
      description: 'Store analytics, hourly revenue velocity, top sellers, and margin tracking.',
      icon: LayoutDashboard,
      path: '/dashboard',
      accentColor: 'from-rose-600 to-pink-700',
      roles: ['admin']
    },
    {
      title: 'Reports & Analytics',
      description: 'Custom financial audits, stock valuations, and historical export tools.',
      icon: TrendingUp,
      path: '/reports',
      accentColor: 'from-orange-500 to-amber-600',
      roles: ['admin']
    },
    {
      title: 'System Settings',
      description: 'Store locations, security roles, printer setup, and system configuration.',
      icon: Settings,
      path: '/settings',
      accentColor: 'from-slate-700 to-slate-900',
      roles: ['admin', 'manager', 'staff']
    }
  ];

  const userRole = profile?.role || 'staff';
  const availableModules = modules.filter(m => m.roles.includes(userRole));

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-slate-100/80 p-3 sm:p-6 lg:p-10 overflow-hidden font-sans">
      {/* Background Stylized Agos Shapes (Inspired by illustration background shapes in Agos Navy & Gold) */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#1C2D4E] rounded-full mix-blend-multiply opacity-25 filter blur-2xl pointer-events-none" />
      <div className="absolute top-1/3 -right-20 w-80 h-80 bg-[#D4AF37] rounded-full mix-blend-multiply opacity-20 filter blur-3xl pointer-events-none" />
      <div className="absolute -bottom-28 left-1/4 w-[500px] h-[500px] bg-indigo-900/20 rounded-full filter blur-3xl pointer-events-none" />

      {/* Elevated Hero Card Container */}
      <div className="relative z-10 max-w-7xl mx-auto space-y-8">
        
        {/* Main Floating Landing Panel */}
        <div className="bg-white rounded-[28px] sm:rounded-[36px] p-6 sm:p-10 lg:p-12 shadow-2xl border border-slate-200/90 relative overflow-hidden">
          
          {/* Top Embedded Navbar inside Hero Card */}
          <header className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-8 mb-8 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[#1C2D4E] to-[#15233D] rounded-2xl flex items-center justify-center shadow-md shadow-[#1C2D4E]/20">
                <Waves className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div>
                <span className="text-xl font-extrabold tracking-tight text-[#1C2D4E] font-heading">AGOS</span>
                <span className="text-[10px] text-[#D4AF37] font-black tracking-widest uppercase ml-2 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200">
                  Retail ERP
                </span>
              </div>
            </div>

            {/* Quick Links inside Card Header */}
            <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
              <button onClick={() => navigate('/pos')} className="hover:text-[#1C2D4E] transition-colors">POS Register</button>
              <button onClick={() => navigate('/inventory')} className="hover:text-[#1C2D4E] transition-colors">Inventory</button>
              <button onClick={() => navigate('/sales')} className="hover:text-[#1C2D4E] transition-colors">Sales History</button>
              <button onClick={() => navigate('/directory')} className="hover:text-[#1C2D4E] transition-colors">Directory</button>
            </nav>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <Badge variant="outline" className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-700 border-slate-200 text-xs font-medium">
                <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                {activeLocationName}
              </Badge>
              <Button 
                onClick={() => navigate('/pos')}
                className="bg-[#1C2D4E] hover:bg-[#15233D] text-[#D4AF37] font-bold rounded-full px-6 shadow-lg shadow-[#1C2D4E]/20 text-xs tracking-wide"
              >
                Launch POS
              </Button>
            </div>
          </header>

          {/* Hero Main Content Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            
            {/* Left Column: Heading & Copy */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-900 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                Store Operations Workstation
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-[1.15] font-heading">
                Smart Retail & <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1C2D4E] via-indigo-900 to-[#D4AF37]">
                  Inventory Management
                </span>
              </h1>

              <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-lg">
                Welcome back, <span className="font-bold text-slate-900">{profile?.name || user?.email?.split('@')[0]}</span>. Process checkouts, manage product stock, track sales history, and oversee cash registers from your Agos portal.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button 
                  onClick={() => navigate('/pos')}
                  size="lg"
                  className="bg-gradient-to-r from-[#1C2D4E] to-[#2B4570] text-white hover:opacity-95 font-bold rounded-2xl px-7 h-12 shadow-xl shadow-[#1C2D4E]/20 text-sm gap-2"
                >
                  <ShoppingCart className="w-4 h-4 text-[#D4AF37]" /> Start POS Checkout
                </Button>
                <Button 
                  onClick={() => navigate('/inventory')}
                  variant="outline"
                  size="lg"
                  className="rounded-2xl px-6 h-12 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50"
                >
                  <Package className="w-4 h-4 mr-2 text-slate-500" /> Manage Stock
                </Button>
              </div>

              {/* Quick Status Tags */}
              <div className="pt-4 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Local-first store sync
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-500" /> Role: <span className="capitalize font-bold text-slate-800">{userRole}</span>
                </div>
              </div>
            </div>

            {/* Right Column: Agos Isometric Store Operations Illustration Stage */}
            <div className="lg:col-span-6 relative">
              <div className="relative w-full aspect-[4/3] rounded-3xl bg-gradient-to-tr from-slate-50 via-indigo-50/50 to-amber-50/30 p-6 border border-slate-100 flex items-center justify-center overflow-hidden shadow-inner">
                
                {/* Decorative Glowing Rings on Graphic Stage */}
                <div className="absolute w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-[#D4AF37]/15 rounded-full blur-2xl pointer-events-none" />

                {/* Isometric Product/POS Pedestals (Pure CSS & SVG Vector Stage) */}
                <div className="relative z-10 w-full h-full flex flex-col justify-between p-2">
                  
                  {/* Top Floating Badge */}
                  <div className="flex justify-between items-center">
                    <motion.div 
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-md border border-slate-200/80 flex items-center gap-2.5 text-xs font-bold text-slate-800"
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>POS Terminal Active</span>
                    </motion.div>

                    <div className="bg-[#1C2D4E] text-[#D4AF37] px-3 py-1.5 rounded-xl shadow text-[11px] font-black tracking-wider uppercase flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5" /> AGOS LIVE
                    </div>
                  </div>

                  {/* Isometric Graphic Cards Grid */}
                  <div className="grid grid-cols-3 gap-3 my-auto pt-2">
                    
                    {/* Pedestal 1: POS Checkout */}
                    <motion.div 
                      whileHover={{ y: -4 }}
                      onClick={() => navigate('/pos')}
                      className="cursor-pointer bg-gradient-to-b from-white to-emerald-50/60 p-3.5 rounded-2xl shadow-lg border border-emerald-100 flex flex-col items-center text-center space-y-2 group transition-all"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                        <ShoppingCart className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-slate-900">Checkout</p>
                        <p className="text-[10px] text-slate-500 font-medium">Barcode POS</p>
                      </div>
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Ready
                      </span>
                    </motion.div>

                    {/* Pedestal 2: Stock Inventory */}
                    <motion.div 
                      whileHover={{ y: -4 }}
                      onClick={() => navigate('/inventory')}
                      className="cursor-pointer bg-gradient-to-b from-white to-indigo-50/60 p-3.5 rounded-2xl shadow-lg border border-indigo-100 flex flex-col items-center text-center space-y-2 group transition-all"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-[#1C2D4E] text-[#D4AF37] flex items-center justify-center shadow-lg shadow-[#1C2D4E]/30 group-hover:scale-110 transition-transform">
                        <Package className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-slate-900">Stock Items</p>
                        <p className="text-[10px] text-slate-500 font-medium">Catalog Hub</p>
                      </div>
                      <span className="text-[9px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                        Tracked
                      </span>
                    </motion.div>

                    {/* Pedestal 3: Financial Accounts */}
                    <motion.div 
                      whileHover={{ y: -4 }}
                      onClick={() => navigate('/finance')}
                      className="cursor-pointer bg-gradient-to-b from-white to-amber-50/60 p-3.5 rounded-2xl shadow-lg border border-amber-100 flex flex-col items-center text-center space-y-2 group transition-all"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform">
                        <Wallet className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-slate-900">Ledger</p>
                        <p className="text-[10px] text-slate-500 font-medium">Cash Register</p>
                      </div>
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                        Audited
                      </span>
                    </motion.div>

                  </div>

                  {/* Bottom Floating Stats Strip */}
                  <div className="bg-slate-900/90 text-white p-3 rounded-2xl backdrop-blur-md flex items-center justify-between text-xs border border-slate-800">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#D4AF37]" />
                      <span className="font-medium text-slate-300">Operations Hub</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                      <span>Online & Synced</span>
                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Operational Modules Horizontal Icon Strip */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 font-heading tracking-tight">
                Store Modules & Services
              </h2>
              <p className="text-xs text-slate-500">
                Authorized tools for <span className="font-bold text-[#1C2D4E] uppercase">{userRole}</span> account
              </p>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-start lg:justify-center gap-3 sm:gap-6 overflow-x-auto custom-scrollbar">
            {availableModules.map((mod) => {
              const Icon = mod.icon;
              return (
                <button
                  key={mod.path}
                  onClick={() => navigate(mod.path)}
                  title={`${mod.title} - ${mod.description}`}
                  className="group flex flex-col items-center gap-2 shrink-0 p-1.5 sm:p-2 rounded-2xl hover:bg-slate-100/80 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1C2D4E]/20"
                >
                  <div className={cn(
                    "w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br",
                    mod.accentColor,
                    "text-white flex items-center justify-center shadow-md shadow-slate-200 group-hover:scale-110 group-hover:shadow-lg transition-all duration-200 relative"
                  )}>
                    <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
                    {mod.badge && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" title={mod.badge} />
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 group-hover:text-[#1C2D4E] transition-colors max-w-[84px] text-center truncate">
                    {mod.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Home;
