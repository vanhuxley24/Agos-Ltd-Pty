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
  Database,
  MapPin,
  Sparkles,
  Sliders,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocations } from '../contexts/LocationContext';
import { auth, db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { name: 'Home', path: '/home', icon: HomeIcon, roles: ['admin', 'manager', 'staff'] },
  { name: 'POS', path: '/pos', icon: ShoppingCart, roles: ['admin', 'manager', 'staff'] },
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['admin'] },
  { name: 'Inventory', path: '/inventory', icon: Package, roles: ['admin', 'manager', 'staff'] },
  { name: 'Purchasing', path: '/purchasing', icon: ShoppingCart, roles: ['admin', 'manager'] },
  { name: 'Directory', path: '/directory', icon: BookOpen, roles: ['admin', 'manager', 'staff'] },
  { name: 'Sales', path: '/sales', icon: History, roles: ['admin', 'manager', 'staff'] },
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

  const isHomePage = location.pathname === '/' || location.pathname === '/home';

  return (
    <div className="min-h-screen flex flex-col bg-[#EBF0F6] text-slate-800 font-sans relative overflow-x-hidden">
      
      {/* Neomorphic Top Header Navigation Bar */}
      {!isHomePage && (
        <header className="sticky top-0 z-40 w-full bg-[#EBF0F6] border-b border-white/60 shadow-[0_4px_12px_#C8D3E2] backdrop-blur-md">
          <div className="w-full px-3 sm:px-5 lg:px-7">
            <div className="flex items-center justify-between h-16 sm:h-18 gap-3">
              
              {/* Left: Brand Logo */}
              <div className="flex items-center gap-3 shrink-0">
                <Link to="/home" className="flex items-center gap-2.5 group">
                  <div className="size-10 sm:size-11 rounded-2xl neo-flat-sm flex items-center justify-center border border-white/90 group-hover:scale-105 transition-transform shadow-sm">
                    <Waves className="size-5 sm:size-6 text-blue-600 stroke-[2.5]" />
                  </div>
                  <div className="flex flex-col hidden sm:flex">
                    <span className="text-base sm:text-lg font-black tracking-tight font-heading leading-none text-slate-800">
                      AGOS
                    </span>
                    <span className="text-[8px] text-blue-600 font-extrabold tracking-widest uppercase mt-0.5 opacity-90">
                      NEOMORPHIC ERP
                    </span>
                  </div>
                </Link>
              </div>

              {/* Center: Neomorphic Navigation Capsule Links */}
              <nav className="hidden lg:flex items-center gap-1.5 p-1 rounded-full neo-inset-sm">
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
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 whitespace-nowrap relative shrink-0",
                          isActive 
                            ? "neo-flat-sm text-blue-600 font-extrabold border border-white/80" 
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        <item.icon className={cn("size-3.5", isActive ? "text-blue-600 stroke-[2.5]" : "text-slate-400")} />
                        <span>{displayName}</span>

                        {showPromoDot && (
                          <span className="size-2 bg-rose-500 rounded-full animate-pulse ml-0.5 shadow-xs" />
                        )}
                        {showPendingBadge && (
                          <span className="px-1.5 py-0.2 text-[9px] font-black bg-rose-500 text-white rounded-full shadow-xs">
                            {pendingCount}
                          </span>
                        )}
                        {showPendingRequestBadge && (
                          <span className="px-1.5 py-0.2 text-[9px] font-black bg-rose-500 text-white rounded-full shadow-xs">
                            {pendingRequestsCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
              </nav>

              {/* Right: Location Selector, Online Status & User Profile */}
              <div className="hidden sm:flex items-center gap-3 shrink-0">
                {/* Location Select */}
                <div className="w-32 lg:w-38">
                  <Select 
                    value={selectedLocationId} 
                    onValueChange={setSelectedLocationId}
                    disabled={!isAdmin && !isManager}
                  >
                    <SelectTrigger className="w-full neo-flat-sm h-9 rounded-full text-xs font-bold text-slate-700">
                      <SelectValue>
                        {selectedLocationId === 'all' ? 'All Stores' : (locations.find(l => l.id === selectedLocationId)?.name || 'Store')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="neo-flat-lg">
                      {(isAdmin || isManager) && <SelectItem value="all">All Locations</SelectItem>}
                      {locations.map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Online / Offline Sync Badge */}
                {isOnline ? (
                  <Badge variant="emerald" className="h-8 px-3 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 shadow-xs">
                    <Wifi className="size-3.5 text-emerald-600 stroke-[2.5]" />
                    <span className="hidden xl:inline">SYNCED</span>
                  </Badge>
                ) : (
                  <Badge variant="orange" className="h-8 px-3 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 shadow-xs">
                    <WifiOff className="size-3.5 text-orange-600 stroke-[2.5]" />
                    <span className="hidden xl:inline">OFFLINE</span>
                  </Badge>
                )}

                {/* User Dropdown / Logout */}
                <div className="flex items-center gap-2 pl-2 border-l border-slate-300/70">
                  <div className="text-right hidden md:block">
                    <p className="text-xs font-extrabold text-slate-800 truncate leading-tight max-w-[110px]">
                      {profile?.name || user?.email?.split('@')[0]}
                    </p>
                    <p className="text-[9px] text-blue-600 font-black uppercase tracking-wider">
                      {isAdmin ? 'Admin' : (profile?.role || 'Staff')}
                    </p>
                  </div>
                  <Button 
                    variant="default" 
                    size="icon-sm"
                    className="size-9 neo-btn rounded-full text-slate-500 hover:text-rose-600"
                    onClick={handleLogout}
                    title="Logout"
                  >
                    <LogOut className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Mobile Menu Trigger */}
              <div className="flex items-center gap-2 lg:hidden">
                <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                  <SheetTrigger render={<Button variant="default" className="neo-btn size-10 rounded-2xl p-0 flex items-center justify-center text-slate-700" />}>
                    <Menu className="size-5" />
                  </SheetTrigger>
                  <SheetContent side="top" className="p-0 bg-[#EBF0F6] text-slate-800 border-b border-white/60 max-h-[85vh] overflow-y-auto neo-flat-xl">
                    <div className="p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-xl neo-flat flex items-center justify-center">
                            <Waves className="size-4 text-blue-600 stroke-[2.5]" />
                          </div>
                          <span className="font-extrabold text-lg font-heading text-slate-800">AGOS ERP</span>
                        </div>
                        <Badge variant="default" className="neo-flat-sm text-blue-600 font-bold px-3">
                          {profile?.role || 'Staff'}
                        </Badge>
                      </div>

                      {/* Location Selector Mobile */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Store Location</label>
                        <Select 
                          value={selectedLocationId} 
                          onValueChange={setSelectedLocationId}
                          disabled={!isAdmin && !isManager}
                        >
                          <SelectTrigger className="w-full neo-flat h-10 rounded-2xl text-xs font-bold text-slate-800">
                            <SelectValue>
                              {selectedLocationId === 'all' ? 'All Locations' : (locations.find(l => l.id === selectedLocationId)?.name || 'Select Location')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="neo-flat-lg">
                            {(isAdmin || isManager) && <SelectItem value="all">All Locations</SelectItem>}
                            {locations.map(loc => (
                              <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Mobile Navigation Links */}
                      <div className="grid grid-cols-2 gap-2.5 pt-2">
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
                                  "flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all",
                                  isActive 
                                    ? "neo-inset text-blue-600 font-extrabold" 
                                    : "neo-flat-sm text-slate-700 hover:text-slate-900"
                                )}
                              >
                                <item.icon className={cn("size-4", isActive ? "text-blue-600 stroke-[2.5]" : "text-slate-500")} />
                                <span>{displayName}</span>
                              </Link>
                            );
                          })}
                      </div>

                      {/* Logout Button Mobile */}
                      <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-xs text-slate-600 font-semibold">{profile?.name || user?.email}</span>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          className="neo-btn-red text-xs gap-1.5 rounded-full px-4"
                          onClick={handleLogout}
                        >
                          <LogOut className="size-3.5" /> Logout
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

      {/* Main Page Content Container */}
      <main className="flex-1 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8, filter: 'blur(2px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "w-full",
              !isHomePage && "p-3 sm:p-5 lg:p-7 max-w-7xl mx-auto"
            )}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};
