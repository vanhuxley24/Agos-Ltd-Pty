import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  ArrowRight,
  Waves,
  Zap,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Check,
  Building2,
  Store,
  Layers,
  ChevronDown,
  BarChart3,
  Boxes,
  Users
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocations } from '../contexts/LocationContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export const Home: React.FC = () => {
  const { profile, user, isAdmin, isManager } = useAuth();
  const { selectedLocation, locations, selectedLocationId, setSelectedLocationId } = useLocations();
  const navigate = useNavigate();

  const userRole = profile?.role || (isAdmin ? 'admin' : isManager ? 'manager' : 'staff');
  const roleDisplay = userRole.toUpperCase();
  const userName = profile?.name || user?.displayName || user?.email?.split('@')[0] || 'Vape Avenue';
  const activeLocationName = selectedLocation ? selectedLocation.name : 'All Store Locations';

  // Bottom Shelf Module Definitions with exact color archetypes from the reference
  const dockModules = [
    {
      id: 'pos',
      name: 'POS Register',
      shortName: 'POS Register',
      path: '/pos',
      icon: ShoppingCart,
      bgColor: 'bg-emerald-500',
      shadowColor: 'shadow-emerald-500/30',
      hasActiveDot: true,
      roles: ['admin', 'manager', 'staff']
    },
    {
      id: 'inventory',
      name: 'Inventory Catalog',
      shortName: 'Inventory Cat...',
      path: '/inventory',
      icon: Package,
      bgColor: 'bg-[#1E293B]',
      shadowColor: 'shadow-slate-800/30',
      roles: ['admin', 'manager', 'staff']
    },
    {
      id: 'directory',
      name: 'Directory & Loyalty',
      shortName: 'Directory & L...',
      path: '/directory',
      icon: BookOpen,
      bgColor: 'bg-purple-600',
      shadowColor: 'shadow-purple-600/30',
      roles: ['admin', 'manager', 'staff']
    },
    {
      id: 'sales',
      name: 'Sales History',
      shortName: 'Sales History',
      path: '/sales',
      icon: History,
      bgColor: 'bg-amber-500',
      shadowColor: 'shadow-amber-500/30',
      roles: ['admin', 'manager', 'staff']
    },
    {
      id: 'finance',
      name: 'Financial Ledger',
      shortName: 'Financial Led...',
      path: '/finance',
      icon: Wallet,
      bgColor: 'bg-blue-600',
      shadowColor: 'shadow-blue-600/30',
      roles: ['admin', 'manager', 'staff']
    },
    {
      id: 'attendance',
      name: 'Timeclock & Schedule',
      shortName: 'Timeclock & ...',
      path: '/attendance',
      icon: Clock,
      bgColor: 'bg-teal-600',
      shadowColor: 'shadow-teal-600/30',
      roles: ['admin', 'manager', 'staff']
    },
    {
      id: 'dashboard',
      name: 'Executive Dashboard',
      shortName: 'Executive Da...',
      path: '/dashboard',
      icon: LayoutDashboard,
      bgColor: 'bg-rose-600',
      shadowColor: 'shadow-rose-600/30',
      roles: ['admin']
    },
    {
      id: 'reports',
      name: 'Reports & Analytics',
      shortName: 'Reports & An...',
      path: '/reports',
      icon: TrendingUp,
      bgColor: 'bg-orange-500',
      shadowColor: 'shadow-orange-500/30',
      roles: ['admin']
    },
    {
      id: 'settings',
      name: 'System Settings',
      shortName: 'System Setti...',
      path: '/settings',
      icon: Settings,
      bgColor: 'bg-[#1E293B]',
      shadowColor: 'shadow-slate-800/30',
      roles: ['admin', 'manager', 'staff']
    }
  ];

  const availableDockModules = dockModules.filter(m => 
    m.roles.includes(userRole) || (isAdmin && m.roles.includes('admin')) || (isManager && m.roles.includes('manager'))
  );

  return (
    <div className="flex-1 w-full min-h-[calc(100vh)] bg-[#EBF0F6] p-4 sm:p-6 lg:p-8 xl:p-10 flex flex-col items-center justify-between font-sans">
      <div className="w-full max-w-[1680px] flex-1 flex flex-col justify-between gap-6 sm:gap-8">
        
        {/* ========================================================================= */}
        {/* MAIN HERO APPLICATION CANVAS CONTAINER */}
        {/* ========================================================================= */}
        <div className="w-full flex-1 neo-flat-xl rounded-2xl p-6 sm:p-9 lg:p-12 xl:p-14 relative overflow-hidden border border-white/90 shadow-[10px_10px_24px_#C8D3E2,-10px_-10px_24px_#FFFFFF] flex flex-col justify-between">
          
          {/* TOP NAVIGATION BAR INSIDE CANVAS */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 sm:pb-8 border-b border-slate-200/60">
            
            {/* Left: Brand Identity */}
            <div className="flex items-center gap-3">
              <div className="size-11 sm:size-13 rounded-xl bg-[#111827] neo-flat-sm flex items-center justify-center text-white shadow-md">
                <Waves className="size-6 sm:size-7 text-sky-400 stroke-[2.5]" />
              </div>
              <div className="flex items-center gap-2.5">
                <span className="font-extrabold text-2xl sm:text-3xl tracking-tight text-slate-900 font-heading">
                  AGOS
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-amber-100/90 border border-amber-300 text-amber-700 text-[10px] sm:text-xs font-extrabold tracking-wider uppercase neo-inset-sm">
                  RETAIL ERP
                </span>
              </div>
            </div>

            {/* Center Navigation Links (Desktop) */}
            <div className="hidden md:flex items-center gap-6 lg:gap-10 text-xs sm:text-sm font-bold text-slate-600">
              <Link 
                to="/pos" 
                className="hover:text-blue-600 transition-colors cursor-pointer"
              >
                POS Register
              </Link>
              <Link 
                to="/inventory" 
                className="hover:text-blue-600 transition-colors cursor-pointer"
              >
                Inventory
              </Link>
              <Link 
                to="/sales" 
                className="hover:text-blue-600 transition-colors cursor-pointer"
              >
                Sales History
              </Link>
              <Link 
                to="/directory" 
                className="hover:text-blue-600 transition-colors cursor-pointer"
              >
                Directory
              </Link>
            </div>

            {/* Right: Location Pill & Launch POS Action */}
            <div className="flex items-center gap-3">
              
              {/* Store Location Selector Capsule */}
              <div className="w-44 sm:w-52">
                <Select 
                  value={selectedLocationId} 
                  onValueChange={setSelectedLocationId}
                  disabled={!isAdmin && !isManager}
                >
                  <SelectTrigger className="w-full h-10 neo-flat-sm rounded-lg text-xs sm:text-sm font-bold text-slate-700 px-3.5 border border-white/80">
                    <div className="flex items-center gap-2 truncate">
                      <Store className="size-4 text-amber-600 shrink-0" />
                      <SelectValue>
                        {selectedLocationId === 'all' ? 'All Store Locations' : (locations.find(l => l.id === selectedLocationId)?.name || 'Select Location')}
                      </SelectValue>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="neo-flat-lg">
                    {(isAdmin || isManager) && <SelectItem value="all">All Store Locations</SelectItem>}
                    {locations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dark Launch POS Action Button */}
              <Button
                variant="default"
                onClick={() => navigate('/pos')}
                className="h-10 px-5 sm:px-6 rounded-lg bg-[#111827] hover:bg-[#1f2937] text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer"
              >
                Launch POS
              </Button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* HERO 2-COLUMN SECTION */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 xl:gap-16 pt-8 sm:pt-12 items-center flex-1">
            
            {/* LEFT COLUMN: HERO HEADLINE & ACTIONS */}
            <div className="lg:col-span-6 xl:col-span-7 space-y-6 sm:space-y-7">
              
              {/* Eyebrow Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md neo-flat-sm border border-blue-200/70 text-blue-700 text-xs sm:text-sm font-extrabold shadow-xs">
                <Sparkles className="size-4 text-blue-600" />
                <span>Store Operations Workstation</span>
              </div>

              {/* Main Display Headline */}
              <div className="space-y-2">
                <h1 className="text-3xl sm:text-5xl lg:text-5xl xl:text-6xl font-black tracking-tight text-[#0F172A] font-heading leading-[1.12]">
                  Smart Retail &amp;<br />
                  Inventory Manage<span className="text-amber-500 font-extrabold">ment</span>
                </h1>
              </div>

              {/* Description Body Copy */}
              <p className="text-sm sm:text-base lg:text-lg text-slate-600 font-medium leading-relaxed max-w-xl">
                Welcome back, <strong className="text-slate-900 font-bold">{userName}</strong>. Process checkouts, manage product stock, track sales history, and oversee cash registers from your Agos portal.
              </p>

              {/* Hero Action Buttons */}
              <div className="flex flex-wrap items-center gap-3.5 pt-2">
                {/* Primary Button: Start POS Checkout */}
                <button
                  type="button"
                  onClick={() => navigate('/pos')}
                  className="h-12 px-6 sm:px-7 rounded-lg bg-[#1E293B] hover:bg-[#0F172A] text-white font-bold text-sm sm:text-base flex items-center gap-2.5 shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer border border-slate-700"
                >
                  <ShoppingCart className="size-4.5 text-sky-400 stroke-[2.5]" />
                  <span>Start POS Checkout</span>
                </button>

                {/* Secondary Button: Manage Stock */}
                <button
                  type="button"
                  onClick={() => navigate('/inventory')}
                  className="h-12 px-6 sm:px-7 rounded-lg neo-flat text-slate-800 hover:text-slate-950 font-bold text-sm sm:text-base flex items-center gap-2.5 border border-white/90 shadow-sm hover:shadow-md active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Package className="size-4.5 text-slate-600 stroke-[2.2]" />
                  <span>Manage Stock</span>
                </button>
              </div>

              {/* Trust & Status Badges */}
              <div className="flex flex-wrap items-center gap-5 sm:gap-8 pt-3 text-xs sm:text-sm font-semibold text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="size-4.5 rounded-md border border-emerald-500 flex items-center justify-center text-emerald-600">
                    <Check className="size-3.5 stroke-[3]" />
                  </div>
                  <span>Real-time cloud sync</span>
                </div>

                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4.5 text-blue-600 stroke-[2.2]" />
                  <span>Role: <strong className="text-slate-800 font-bold">{roleDisplay}</strong></span>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: INTERACTIVE OPERATIONS HUB */}
            <div className="lg:col-span-6 xl:col-span-5">
              <div className="neo-flat-lg rounded-xl p-5 sm:p-7 lg:p-8 border border-white/95 shadow-[10px_10px_24px_#C8D3E2,-10px_-10px_24px_#FFFFFF] relative overflow-hidden bg-gradient-to-br from-[#EEF4FB] to-[#E5EDF7]">
                
                {/* Hub Header Bar */}
                <div className="flex items-center justify-between mb-5">
                  <div className="neo-flat-sm px-3.5 py-1.5 rounded-md border border-white flex items-center gap-2 text-xs sm:text-sm font-extrabold text-slate-800 shadow-xs">
                    <span className="size-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    <span>POS Register Active</span>
                  </div>

                  <div className="px-3.5 py-1.5 rounded-md bg-[#111827] text-white text-xs font-black flex items-center gap-1.5 shadow-md">
                    <BarChart3 className="size-4 text-sky-400" />
                    <span>AGOS LIVE</span>
                  </div>
                </div>

                {/* 3 Quick Action Station Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
                  
                  {/* Card 1: Checkout */}
                  <div 
                    onClick={() => navigate('/pos')}
                    className="neo-flat rounded-lg p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer hover:scale-[1.02] transition-all border border-white/90 group"
                  >
                    <div className="size-11 sm:size-12 rounded-lg bg-emerald-500 flex items-center justify-center text-white mb-3 shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                      <ShoppingCart className="size-5 stroke-[2.5]" />
                    </div>
                    <h4 className="text-sm font-black text-slate-900 font-heading">
                      Checkout
                    </h4>
                    <p className="text-[11px] text-slate-500 font-semibold mb-2.5">
                      Barcode POS
                    </p>
                    <span className="px-3 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold neo-inset-sm">
                      Ready
                    </span>
                  </div>

                  {/* Card 2: Stock Items */}
                  <div 
                    onClick={() => navigate('/inventory')}
                    className="neo-flat rounded-lg p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer hover:scale-[1.02] transition-all border border-white/90 group"
                  >
                    <div className="size-11 sm:size-12 rounded-lg bg-[#1E293B] flex items-center justify-center text-amber-400 mb-3 shadow-md shadow-slate-900/20 group-hover:scale-105 transition-transform">
                      <Package className="size-5 stroke-[2.5]" />
                    </div>
                    <h4 className="text-sm font-black text-slate-900 font-heading">
                      Stock Items
                    </h4>
                    <p className="text-[11px] text-slate-500 font-semibold mb-2.5">
                      Catalog Hub
                    </p>
                    <span className="px-3 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-extrabold neo-inset-sm">
                      Tracked
                    </span>
                  </div>

                  {/* Card 3: Ledger */}
                  <div 
                    onClick={() => navigate('/finance')}
                    className="neo-flat rounded-lg p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer hover:scale-[1.02] transition-all border border-white/90 group"
                  >
                    <div className="size-11 sm:size-12 rounded-lg bg-amber-500 flex items-center justify-center text-white mb-3 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
                      <Wallet className="size-5 stroke-[2.5]" />
                    </div>
                    <h4 className="text-sm font-black text-slate-900 font-heading">
                      Ledger
                    </h4>
                    <p className="text-[11px] text-slate-500 font-semibold mb-2.5">
                      Cash Register
                    </p>
                    <span className="px-3 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-extrabold neo-inset-sm">
                      Audited
                    </span>
                  </div>

                </div>

                {/* Bottom Hub Status Bar */}
                <div className="h-11 rounded-lg bg-[#1E293B] px-4 flex items-center justify-between text-xs sm:text-sm font-bold text-white shadow-inner">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-amber-400" />
                    <span className="text-slate-200">Operations Hub</span>
                  </div>
                  <span className="text-emerald-400 font-extrabold text-xs">
                    Online &amp; Synced
                  </span>
                </div>

              </div>
            </div>

          </div>

        </div>

        {/* ========================================================================= */}
        {/* BOTTOM SECTION: STORE MODULES & SERVICES DOCK TRAY */}
        {/* ========================================================================= */}
        <div className="space-y-3 pt-2">
          
          {/* Section Header */}
          <div className="px-2">
            <h2 className="text-lg sm:text-xl font-extrabold font-heading text-slate-900">
              Store Modules &amp; Services
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Authorized tools for <strong className="text-slate-800 font-bold uppercase">{roleDisplay}</strong> account
            </p>
          </div>

          {/* Wide Raised Neomorphic Dock Container */}
          <div className="w-full neo-flat-lg rounded-xl p-4 sm:p-6 lg:p-7 border border-white/90 shadow-[8px_8px_20px_#C8D3E2,-8px_-8px_20px_#FFFFFF] overflow-x-auto custom-scrollbar">
            
            <div className="flex items-center justify-between min-w-[760px] gap-2 lg:gap-4 px-2">
              {availableDockModules.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => navigate(item.path)}
                    className="flex flex-col items-center gap-2 cursor-pointer group flex-1"
                  >
                    {/* Icon Badge */}
                    <div className="relative">
                      <div className={cn(
                        "size-13 sm:size-15 rounded-xl flex items-center justify-center text-white transition-all duration-200 shadow-md group-hover:scale-105 group-active:scale-95 group-hover:shadow-lg",
                        item.bgColor,
                        item.shadowColor
                      )}>
                        <Icon className="size-6 sm:size-7 stroke-[2.2]" />
                      </div>

                      {/* Small Active Dot Badge */}
                      {item.hasActiveDot && (
                        <div className="size-3.5 rounded-full bg-emerald-400 border-2 border-white absolute -top-0.5 -right-0.5 shadow-xs" />
                      )}
                    </div>

                    {/* Short Module Label */}
                    <span className="text-xs sm:text-sm font-extrabold text-slate-700 text-center tracking-tight group-hover:text-blue-600 transition-colors whitespace-nowrap">
                      {item.shortName}
                    </span>
                  </motion.div>
                );
              })}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

export default Home;
