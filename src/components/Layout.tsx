import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home as HomeIcon,
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  History, 
  Settings, 
  LogOut, 
  Menu,
  X,
  User as UserIcon,
  TrendingUp,
  Users,
  BookOpen,
  Waves,
  Wallet,
  Clock,
  Wifi,
  WifiOff,
  Database
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocations } from '../contexts/LocationContext';
import { auth, db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { name: 'Home', path: '/home', icon: HomeIcon, roles: ['admin', 'manager', 'staff'] },
  { name: 'POS Register', path: '/pos', icon: ShoppingCart, roles: ['admin', 'manager', 'staff'] },
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['admin'] },
  { name: 'Inventory', path: '/inventory', icon: Package, roles: ['admin', 'manager', 'staff'] },
  { name: 'Purchasing', path: '/purchasing', icon: ShoppingCart, roles: ['admin', 'manager'] },
  { name: 'Directory', path: '/directory', icon: BookOpen, roles: ['admin', 'manager', 'staff'] },
  { name: 'Sales History', path: '/sales', icon: History, roles: ['admin', 'manager', 'staff'] },
  { name: 'Reports', path: '/reports', icon: TrendingUp, roles: ['admin'] },
  { name: 'Finance', path: '/finance', icon: Wallet, roles: ['admin', 'manager', 'staff'] },
  { name: 'Attendance', path: '/attendance', icon: Clock, roles: ['admin', 'manager', 'staff'] },
  { name: 'System', path: '/settings', icon: Settings, roles: ['admin', 'manager', 'staff'] },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, user, isAdmin, isManager } = useAuth();
  const { locations, selectedLocationId, setSelectedLocationId } = useLocations();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [pendingPromoCount, setPendingPromoCount] = React.useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = React.useState(0);

  React.useEffect(() => {
    if (!profile) return;
    
    const canViewSales = isAdmin || isManager || ['admin', 'manager', 'staff'].includes(profile.role);
    if (!canViewSales) return;

    const q = query(collection(db, 'sales'), where('status', '==', 'pending'));
    const qPromo = query(collection(db, 'sales'), where('status', '==', 'pending_promo_approval'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let count = snapshot.docs.length;
      if (selectedLocationId !== 'all') {
        count = snapshot.docs.filter(doc => doc.data().locationId === selectedLocationId).length;
      }
      setPendingCount(count);
    }, (err) => {
      console.warn("Failed to listen to pending sales for badge:", err);
    });

    const unsubscribePromo = onSnapshot(qPromo, (snapshot) => {
      let count = snapshot.docs.length;
      if (selectedLocationId !== 'all') {
        count = snapshot.docs.filter(doc => doc.data().locationId === selectedLocationId).length;
      }
      setPendingPromoCount(count);
    }, (err) => {
      console.warn("Failed to listen to pending promo approvals for badge:", err);
    });

    // Listen to pending attendance requests for admins/managers
    let unsubscribeRequests = () => {};
    if (isAdmin || isManager) {
      const qRequests = query(collection(db, 'attendanceRequests'), where('status', '==', 'pending'));
      unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
        setPendingRequestsCount(snapshot.docs.length);
      }, (err) => {
        console.warn("Failed to listen to pending attendance requests for badge:", err);
      });
    } else {
      setPendingRequestsCount(0);
    }

    return () => {
      unsubscribe();
      unsubscribePromo();
      unsubscribeRequests();
    };
  }, [profile, isAdmin, isManager, selectedLocationId]);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem('agos_offline_session');
    try {
      await auth.signOut();
    } catch (e) {
      console.warn("Auth signout skipped or failed during offline logout:", e);
    }
    window.location.href = '/login';
  };

  const NavContent = () => (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#1C2D4E] via-[#15233D] to-[#0A1221] text-[#FDFCF8] border-r border-white/5">
      <div className="p-5 flex items-center gap-2.5">
        <div className="w-9 h-9 bg-gradient-to-br from-[#e5c05c] to-[#D4AF37] rounded-xl flex items-center justify-center shadow-md shadow-amber-500/10">
          <Waves className="w-5 h-5 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-bold tracking-tight font-heading leading-none text-white">Agos</span>
          <span className="text-[9px] text-[#D4AF37] font-black tracking-widest uppercase mt-0.5 opacity-90">Local-First ERP</span>
        </div>
      </div>

      <div className="px-4 mb-3 space-y-2">
        <div className="bg-white/5 p-2.5 rounded-xl border border-white/10 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-1.5 px-0.5">
            <MapPin className="w-3 h-3 text-[#D4AF37]" />
            <span className="text-[9px] font-black text-white/50 uppercase tracking-wider">Active Location</span>
          </div>
          <Select 
            value={selectedLocationId} 
            onValueChange={setSelectedLocationId}
            disabled={!isAdmin && !isManager}
          >
            <SelectTrigger className="w-full bg-white/10 border-white/10 h-8 text-xs font-semibold text-white hover:bg-white/20 transition-colors">
              <SelectValue>
                {selectedLocationId === 'all' ? 'All Locations' : (locations.find(l => l.id === selectedLocationId)?.name || 'Select Location')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-primary text-white border-white/10">
              {(isAdmin || isManager) && <SelectItem value="all">All Locations</SelectItem>}
              {locations.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-1.5">
              <Database className="w-3 h-3 text-emerald-400" />
              <span className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Local Repository</span>
            </div>
            {isOnline ? (
              <Badge variant="outline" className="h-4 bg-emerald-500/25 text-emerald-400 border-emerald-500/20 text-[8px] font-black px-1.5 rounded-full flex items-center gap-1">
                <Wifi className="w-2 h-2" />
                SYNCED
              </Badge>
            ) : (
              <Badge variant="outline" className="h-4 bg-amber-500/25 text-amber-400 border-amber-500/20 text-[8px] font-black px-1.5 rounded-full flex items-center gap-1">
                <WifiOff className="w-2 h-2" />
                OFFLINE
              </Badge>
            )}
          </div>
        </div>
      </div>
      
      <nav className="flex-1 px-3 space-y-0.5 mt-1 overflow-y-auto custom-scrollbar">
        {navItems
          .filter(item => {
            const currentRole = isAdmin ? 'admin' : (profile?.role || 'staff');
            return item.roles.includes(currentRole as any) || 
                   (isManager && item.roles.includes('manager')) ||
                   (isAdmin && item.roles.includes('admin'));
          })
          .map((item) => {
            const isActive = location.pathname === item.path;
            const displayName = (item.path === '/settings' && !isAdmin) ? 'Profile' : item.name;
            const showPendingBadge = item.path === '/sales' && (isAdmin || isManager) && pendingCount > 0;
            const showPromoDot = isAdmin && item.path === '/sales' && pendingPromoCount > 0;
            const showPendingRequestBadge = item.path === '/attendance' && (isAdmin || isManager) && pendingRequestsCount > 0;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-300 group relative overflow-hidden",
                  isActive 
                    ? "bg-gradient-to-r from-[#e5c05c] to-[#D4AF37] text-primary shadow-md shadow-amber-500/10 font-bold" 
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                )}
              >
                <div className="relative">
                  <item.icon className={cn("w-4 h-4 transition-transform duration-300 group-hover:scale-110", isActive ? "text-primary stroke-[2.5px]" : "text-white/40 group-hover:text-white")} />
                  {showPromoDot && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-[#1C2D4E] animate-pulse" />
                  )}
                </div>
                <span className="font-semibold text-xs">{displayName}</span>
                {showPendingBadge && (
                  <span className="ml-auto inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-black leading-none text-white bg-rose-500 rounded-full animate-pulse shadow-sm">
                    {pendingCount}
                  </span>
                )}
                {showPendingRequestBadge && (
                  <span className="ml-auto inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-black leading-none text-white bg-rose-500 rounded-full animate-pulse shadow-sm">
                    {pendingRequestsCount}
                  </span>
                )}
                {isActive && !showPendingBadge && !showPendingRequestBadge && (
                  <motion.div 
                    layoutId="activeNav"
                    className="ml-auto w-1 h-1 rounded-full bg-primary" 
                  />
                )}
              </Link>
            );
          })}
      </nav>

      <div className="p-4 mt-auto">
        <div className="bg-white/5 rounded-xl p-3 mb-2 border border-white/10">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center shadow-sm border border-white/10">
              <UserIcon className="w-4 h-4 text-white/70" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate leading-none mb-0.5">{profile?.name || user?.email?.split('@')[0]}</p>
              <p className="text-[9px] text-[#D4AF37] font-bold uppercase tracking-wider">{isAdmin ? 'Admin' : (profile?.role || 'Staff')}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-2.5 text-white/55 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg h-8 transition-colors px-2 text-xs"
            onClick={handleLogout}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold">Logout</span>
          </Button>
        </div>
      </div>
    </div>
  );

  const isHomePage = location.pathname === '/' || location.pathname === '/home';

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/80 font-sans relative overflow-x-hidden">
      {/* Background Stylized Agos Shapes (Navy & Gold ambient theme glow) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#1C2D4E] rounded-full mix-blend-multiply opacity-20 filter blur-2xl" />
        <div className="absolute top-1/3 -right-20 w-80 h-80 bg-[#D4AF37] rounded-full mix-blend-multiply opacity-15 filter blur-3xl" />
        <div className="absolute -bottom-28 left-1/4 w-[500px] h-[500px] bg-indigo-900/15 rounded-full filter blur-3xl" />
      </div>

      {/* Top Header Navigation Bar (Hidden on Home page) */}
      {!isHomePage && (
        <header className="sticky top-0 z-40 w-full bg-[#1C2D4E] text-[#FDFCF8] border-b border-[#D4AF37]/25 shadow-xl shadow-[#1C2D4E]/15 backdrop-blur-md">
          <div className="w-full px-3 sm:px-4 lg:px-6">
            <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
              
              {/* Left: Brand Logo */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <Link to="/home" className="flex items-center gap-2 group">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-[#1C2D4E] to-[#15233D] border border-[#D4AF37]/40 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-md shadow-black/20 group-hover:scale-105 transition-transform">
                    <Waves className="w-4 h-4 sm:w-5 sm:h-5 text-[#D4AF37]" />
                  </div>
                  <div className="flex flex-col hidden sm:flex">
                    <span className="text-base sm:text-lg font-extrabold tracking-tight font-heading leading-none text-white">AGOS</span>
                    <span className="text-[7px] text-[#D4AF37] font-black tracking-widest uppercase mt-0.5 opacity-90 whitespace-nowrap">Local-First ERP</span>
                  </div>
                </Link>
              </div>

              {/* Center: Inline Navigation Links directly inside Dark Header */}
              <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
                {navItems
                  .filter(item => {
                    const currentRole = isAdmin ? 'admin' : (profile?.role || 'staff');
                    return item.roles.includes(currentRole as any) || 
                           (isManager && item.roles.includes('manager')) ||
                           (isAdmin && item.roles.includes('admin'));
                  })
                  .map((item) => {
                    const isActive = location.pathname === item.path;
                    const displayName = (item.path === '/settings' && !isAdmin) ? 'Profile' : item.name;

                    const showPendingBadge = item.path === '/sales' && (isAdmin || isManager) && pendingCount > 0;
                    const showPromoDot = isAdmin && item.path === '/sales' && pendingPromoCount > 0;
                    const showPendingRequestBadge = item.path === '/attendance' && (isAdmin || isManager) && pendingRequestsCount > 0;

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-extrabold transition-all duration-150 whitespace-nowrap relative shrink-0",
                          isActive 
                            ? "bg-[#D4AF37] text-[#1C2D4E] shadow-md shadow-[#D4AF37]/25" 
                            : "text-slate-200 hover:text-white hover:bg-white/10"
                        )}
                      >
                        <item.icon className={cn("w-3.5 h-3.5", isActive ? "text-[#1C2D4E] stroke-[2.5px]" : "text-[#D4AF37]")} />
                        <span>{displayName}</span>

                        {showPromoDot && (
                          <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse ml-0.5" />
                        )}
                        {showPendingBadge && (
                          <span className="px-1.5 py-0.5 text-[9px] font-black bg-rose-500 text-white rounded-full shadow-xs">
                            {pendingCount}
                          </span>
                        )}
                        {showPendingRequestBadge && (
                          <span className="px-1.5 py-0.5 text-[9px] font-black bg-rose-500 text-white rounded-full shadow-xs">
                            {pendingRequestsCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
              </nav>

              {/* Right: Location Selector, Status & User Profile */}
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                {/* Location Select */}
                <div className="w-28 sm:w-32 lg:w-36">
                  <Select 
                    value={selectedLocationId} 
                    onValueChange={setSelectedLocationId}
                    disabled={!isAdmin && !isManager}
                  >
                    <SelectTrigger className="w-full bg-white/10 border border-white/20 h-8 rounded-full text-xs font-semibold text-white hover:bg-white/15 transition-colors px-3">
                      <SelectValue>
                        {selectedLocationId === 'all' ? 'All Locations' : (locations.find(l => l.id === selectedLocationId)?.name || 'Select Location')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-[#1C2D4E] text-white border-white/20 rounded-xl">
                      {(isAdmin || isManager) && <SelectItem value="all">All Locations</SelectItem>}
                      {locations.map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Offline / Synced Badge */}
                {isOnline ? (
                  <Badge variant="outline" className="h-7 bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] font-extrabold px-2.5 rounded-full flex items-center gap-1.5">
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    <span className="hidden xl:inline">SYNCED</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-7 bg-amber-500/20 text-amber-300 border-amber-500/30 text-[9px] font-extrabold px-2.5 rounded-full flex items-center gap-1.5">
                    <WifiOff className="w-3 h-3 text-amber-400" />
                    <span className="hidden xl:inline">OFFLINE</span>
                  </Badge>
                )}

                {/* User Dropdown / Logout */}
                <div className="flex items-center gap-2 pl-2 border-l border-white/15">
                  <div className="text-right hidden md:block">
                    <p className="text-xs font-bold text-white truncate leading-tight max-w-[120px]">{profile?.name || user?.email?.split('@')[0]}</p>
                    <p className="text-[9px] text-[#D4AF37] font-black uppercase tracking-wider">{isAdmin ? 'Admin' : (profile?.role || 'Staff')}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8 text-slate-300 hover:text-rose-300 hover:bg-rose-500/20 rounded-full transition-colors"
                    onClick={handleLogout}
                    title="Logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Mobile Menu Trigger */}
              <div className="flex items-center gap-2 lg:hidden">
                <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                  <SheetTrigger render={<Button variant="ghost" className="text-white h-9 w-9 hover:bg-white/10 p-0 flex items-center justify-center rounded-full" />}>
                    <Menu className="w-5 h-5" />
                  </SheetTrigger>
                  <SheetContent side="top" className="p-0 bg-[#1C2D4E] text-white border-b border-[#D4AF37]/30 max-h-[85vh] overflow-y-auto">
                    <div className="p-4 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          <Waves className="w-5 h-5 text-[#D4AF37]" />
                          <span className="font-extrabold text-lg font-heading text-white">AGOS ERP</span>
                        </div>
                        <Badge variant="outline" className="bg-white/10 text-[#D4AF37] border-white/20 text-xs font-bold rounded-full px-3">
                          {profile?.role || 'Staff'}
                        </Badge>
                      </div>

                      {/* Location Selector Mobile */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Store Location</label>
                        <Select 
                          value={selectedLocationId} 
                          onValueChange={setSelectedLocationId}
                          disabled={!isAdmin && !isManager}
                        >
                          <SelectTrigger className="w-full bg-white/10 border-white/10 text-xs text-white rounded-xl">
                            <SelectValue>
                              {selectedLocationId === 'all' ? 'All Locations' : (locations.find(l => l.id === selectedLocationId)?.name || 'Select Location')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-[#1C2D4E] text-white border-white/10">
                            {(isAdmin || isManager) && <SelectItem value="all">All Locations</SelectItem>}
                            {locations.map(loc => (
                              <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Mobile Navigation Links */}
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        {navItems
                          .filter(item => {
                            const currentRole = isAdmin ? 'admin' : (profile?.role || 'staff');
                            return item.roles.includes(currentRole as any) || 
                                   (isManager && item.roles.includes('manager')) ||
                                   (isAdmin && item.roles.includes('admin'));
                          })
                          .map((item) => {
                            const isActive = location.pathname === item.path;
                            const displayName = (item.path === '/settings' && !isAdmin) ? 'Profile' : item.name;

                            return (
                              <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                  "flex items-center gap-2 px-3.5 py-2.5 rounded-full text-xs font-extrabold transition-colors",
                                  isActive 
                                    ? "bg-[#D4AF37] text-[#1C2D4E] shadow-md font-black" 
                                    : "bg-white/5 text-white/80 hover:bg-white/10"
                                )}
                              >
                                <item.icon className={cn("w-4 h-4", isActive ? "text-[#1C2D4E]" : "text-[#D4AF37]")} />
                                <span>{displayName}</span>
                              </Link>
                            );
                          })}
                      </div>

                      {/* Logout Button Mobile */}
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                        <span className="text-xs text-slate-300 font-medium">{profile?.name || user?.email}</span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-rose-300 hover:text-rose-100 hover:bg-rose-500/20 text-xs gap-1.5 rounded-full"
                          onClick={handleLogout}
                        >
                          <LogOut className="w-3.5 h-3.5" /> Logout
                        </Button>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

            </div>
          </div>
        </header>
      )}

      {/* Main Page Content */}
      <main className="flex-1 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "w-full",
              !isHomePage && "p-3 sm:p-5 lg:p-6 max-w-7xl mx-auto"
            )}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};
