import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowUpRight, 
  ChevronRight, 
  CreditCard, 
  Sparkles, 
  Utensils, 
  TrendingUp, 
  Volume2, 
  Sliders, 
  Check, 
  ChevronLeft,
  ChevronDown,
  Play,
  Pause,
  Square,
  FastForward,
  Home,
  ThumbsUp,
  X,
  Info,
  MoreHorizontal,
  ArrowRight,
  ShieldCheck,
  Zap,
  ShoppingBag
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ==========================================
// 1. NEOMORPHIC STATISTIC RADIAL GAUGE (IMAGE 1 & 2)
// ==========================================
interface NeomorphicDialProps {
  percentage?: number;
  label?: string;
  amount?: string;
  category?: string;
  categoryIcon?: React.ReactNode;
  title?: string;
  className?: string;
  onToggleIncome?: () => void;
}

export const NeomorphicDialGauge: React.FC<NeomorphicDialProps> = ({
  percentage = 25,
  label = "Restaurants",
  amount = "$ 1,593.58",
  category = "Restaurants",
  categoryIcon,
  title = "Statistic",
  className,
  onToggleIncome
}) => {
  const [isOutcome, setIsOutcome] = useState(true);

  return (
    <div className={cn("neo-flat-lg p-6 sm:p-7 rounded-3xl flex flex-col items-center justify-center relative", className)}>
      {/* Top Header Row with Back Button, Title, and Grid */}
      <div className="w-full flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button 
            type="button"
            className="neo-btn size-9 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-900"
            title="Back"
          >
            <ChevronLeft className="size-4 stroke-[2.5]" />
          </button>
          <div className="neo-inset size-9 rounded-xl flex items-center justify-center text-slate-500">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="size-1 rounded-full bg-slate-400" />
              <div className="size-1 rounded-full bg-slate-400" />
              <div className="size-1 rounded-full bg-slate-400" />
              <div className="size-1 rounded-full bg-slate-400" />
            </div>
          </div>
        </div>

        <h3 className="text-base sm:text-lg font-extrabold font-heading text-slate-800 tracking-tight">
          {title}
        </h3>

        <div className="size-9" /> {/* Spacer */}
      </div>

      {/* Period Selector Capsule (Image 1) */}
      <div className="w-full max-w-xs mb-6">
        <div className="neo-flat-sm rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-600 font-semibold cursor-pointer hover:shadow-[2px_2px_5px_#C8D3E2,-2px_-2px_5px_#FFFFFF] transition-all">
          <span className="text-slate-400">Period:</span>
          <span className="text-slate-800 font-bold">Last 30 days</span>
          <ChevronRight className="size-4 text-slate-400" />
        </div>
      </div>

      {/* Circular Segmented Dial (Image 1 & 2) */}
      <div className="relative size-56 sm:size-64 flex items-center justify-center my-2 select-none">
        {/* Outer Beveled Rim */}
        <div className="absolute inset-0 rounded-full neo-flat-lg border-4 border-white/80 flex items-center justify-center" />

        {/* Sunken Channel Track */}
        <div className="absolute inset-3 rounded-full neo-inset-deep flex items-center justify-center">
          
          {/* Segmented Radial Divides (SVG) */}
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background ring track */}
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="transparent"
              stroke="#E2E9F2"
              strokeWidth="10"
            />
            {/* Radial Segment Dividers (Notches) */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1="50"
                y1="12"
                x2="50"
                y2="22"
                stroke="#C8D3E2"
                strokeWidth="1.5"
                transform={`rotate(${deg} 50 50)`}
              />
            ))}
            
            {/* Orange Segment (25% highlight as seen in Image 1) */}
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="transparent"
              stroke="url(#orangeGradient)"
              strokeWidth="11"
              strokeDasharray="238.76"
              strokeDashoffset={238.76 * (1 - percentage / 100)}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />

            <defs>
              <linearGradient id="orangeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FB923C" />
                <stop offset="100%" stopColor="#EA580C" />
              </linearGradient>
            </defs>
          </svg>

          {/* Highlight Percentage Tag floating on the segment */}
          <div className="absolute bottom-10 left-8 sm:bottom-12 sm:left-10 transform -rotate-12">
            <span className="text-sm sm:text-base font-black text-white drop-shadow-sm font-heading">
              {percentage}%
            </span>
          </div>

          {/* Inner Raised Center Hub */}
          <div className="size-28 sm:size-32 rounded-full neo-flat flex flex-col items-center justify-center p-2 relative z-10 border border-white/80 shadow-md">
            
            {/* Center Red Button with Up-Right Arrow (Image 1) */}
            <button
              type="button"
              onClick={() => {
                setIsOutcome(!isOutcome);
                onToggleIncome?.();
              }}
              className="neo-btn-red size-12 sm:size-14 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform group cursor-pointer"
              title="Switch Income or Outcome"
            >
              <ArrowUpRight className="size-6 stroke-[3] transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>

            {/* Circular Engraved Curved Text Effect */}
            <span className="text-[7px] font-black text-slate-400 tracking-wider uppercase mt-1 text-center leading-tight">
              {isOutcome ? 'Outcome Velocity' : 'Income Velocity'}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Category Stat Card (Image 1: "Restaurants 25% $ 1593,58") */}
      <div className="w-full max-w-xs mt-5">
        <div className="neo-flat-sm rounded-2xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="neo-inset size-10 rounded-xl flex items-center justify-center text-slate-600">
              {categoryIcon || <Utensils className="size-5 text-slate-700" />}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">{category}</p>
              <p className="text-[10px] text-slate-400 font-semibold">Active Category</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-black text-orange-600 bg-orange-100/70 px-2 py-0.5 rounded-full neo-inset-sm">
              {percentage}%
            </span>
            <p className="text-sm font-extrabold text-slate-800 font-mono mt-0.5">
              {amount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. NEOMORPHIC HRTBT SMART / VIP CARD (IMAGE 1)
// ==========================================
interface NeomorphicCardProps {
  cardHolder?: string;
  brandTitle?: string;
  cardNumber?: string;
  expDate?: string;
  balance?: string;
  creditUsed?: string;
  creditLimit?: string;
  percentageUsed?: number;
  className?: string;
}

export const NeomorphicSmartCard: React.FC<NeomorphicCardProps> = ({
  cardHolder = "VIP CUSTOMER",
  brandTitle = "HRTBT",
  cardNumber = "5303  6084  2402  3649",
  expDate = "09/28",
  balance = "₱ 14,020.44",
  creditUsed = "₱ 220",
  creditLimit = "₱ 1,000",
  percentageUsed = 22,
  className
}) => {
  return (
    <div className={cn("neo-flat-lg p-6 sm:p-7 rounded-3xl flex flex-col justify-between relative overflow-hidden", className)}>
      
      {/* The 3D Raised Physical Card Canvas */}
      <div className="w-full relative aspect-[1.58/1] rounded-2xl neo-flat p-5 flex flex-col justify-between border border-white/90 shadow-[8px_8px_18px_#C8D3E2,-8px_-8px_18px_#FFFFFF] overflow-hidden group hover:scale-[1.01] transition-transform duration-300">
        
        {/* Iridescent Holographic Foil Wave (Bottom-Left from Image 1) */}
        <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-gradient-to-tr from-purple-500 via-pink-400 to-amber-300 opacity-60 filter blur-md pointer-events-none mix-blend-multiply" />
        <div className="absolute -bottom-8 -left-8 w-28 h-28 border-2 border-white/60 rounded-full pointer-events-none" />
        <div className="absolute -bottom-4 -left-4 w-20 h-20 border border-white/40 rounded-full pointer-events-none" />

        {/* Top Header: Brand Title & Metallic Chip */}
        <div className="flex items-start justify-between z-10">
          <div className="flex flex-col">
            <span className="font-extrabold text-xl sm:text-2xl tracking-wider text-slate-800 font-heading italic">
              {brandTitle}
            </span>
            <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">
              AGOS VIP ACCESS
            </span>
          </div>

          {/* Embossed Metallic Smart Chip (Image 1) */}
          <div className="w-10 h-8 rounded-lg neo-flat-sm border border-amber-300/80 bg-gradient-to-br from-amber-100 via-amber-200 to-amber-300 flex items-center justify-center relative shadow-xs">
            <div className="w-full h-[1px] bg-amber-400/80 absolute top-2.5" />
            <div className="w-full h-[1px] bg-amber-400/80 absolute bottom-2.5" />
            <div className="h-full w-[1px] bg-amber-400/80 absolute left-3" />
            <div className="h-full w-[1px] bg-amber-400/80 absolute right-3" />
            <div className="size-2 rounded-full border border-amber-500/80 bg-amber-200" />
          </div>
        </div>

        {/* Card Number Embossed (Image 1) */}
        <div className="my-auto z-10 pt-2">
          <p className="font-mono text-sm sm:text-base font-bold tracking-widest text-slate-700 drop-shadow-xs">
            {cardNumber}
          </p>
        </div>

        {/* Bottom Row: Expiration Date & Contactless Hologram */}
        <div className="flex items-end justify-between z-10">
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">VALID THRU</p>
            <p className="font-mono text-xs sm:text-sm font-bold text-slate-700">{expDate}</p>
          </div>

          <div className="flex items-center gap-1">
            <div className="size-5 rounded-full neo-flat-sm border border-white/80 bg-slate-200/50" />
            <div className="size-5 rounded-full neo-flat-sm border border-white/80 bg-slate-300/60 -ml-2.5" />
          </div>
        </div>
      </div>

      {/* Card Pager Dots (Image 1) */}
      <div className="flex items-center justify-center gap-2 my-4">
        <div className="size-2 rounded-full bg-slate-400 neo-inset-sm" />
        <div className="size-2 rounded-full bg-slate-300" />
        <div className="size-2 rounded-full bg-slate-300" />
      </div>

      {/* Balance Section (Image 1: "Balance $ 14,020.44") */}
      <div className="flex items-center justify-between py-1">
        <span className="text-sm font-extrabold text-slate-800 font-heading">Balance</span>
        <span className="text-lg sm:text-xl font-extrabold font-mono text-slate-800">{balance}</span>
      </div>

      {/* Credit Limit Progress Slider (Image 1: "$ 220 / $ 1000") */}
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded-full neo-inset p-0.5 flex items-center relative">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500 shadow-xs"
            style={{ width: `${percentageUsed}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
          <span>Credit limit</span>
          <span className="font-mono text-slate-700 font-bold">{creditUsed} / {creditLimit}</span>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. NEOMORPHIC TOGGLE SWITCH WITH NOTIFICATION (IMAGE 1)
// ==========================================
interface NeomorphicNotificationSwitchProps {
  label?: string;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}

export const NeomorphicNotificationSwitch: React.FC<NeomorphicNotificationSwitchProps> = ({
  label = "Notify about new services & inventory alerts",
  defaultChecked = true,
  onChange,
  className
}) => {
  const [checked, setChecked] = useState(defaultChecked);

  const toggle = () => {
    const next = !checked;
    setChecked(next);
    onChange?.(next);
  };

  return (
    <div className={cn("neo-flat p-4 sm:p-5 rounded-3xl flex items-center gap-4 justify-between", className)}>
      <div 
        onClick={toggle}
        className="flex items-center gap-3 neo-inset-deep rounded-2xl p-2 cursor-pointer select-none transition-all"
      >
        <span className={cn("text-xs font-black px-2", checked ? "text-slate-400" : "text-slate-800")}>
          OFF
        </span>

        {/* Red Grooved Switch Pill from Image 1 */}
        <div className={cn(
          "w-12 h-7 rounded-xl flex items-center justify-center transition-all duration-300 shadow-md",
          checked 
            ? "neo-btn-red translate-x-0" 
            : "bg-slate-300 shadow-inner -translate-x-1"
        )}>
          {/* Vertical texture lines on the switch */}
          <div className="flex items-center gap-0.5">
            <div className="w-[1.5px] h-3.5 bg-white/60 rounded-full" />
            <div className="w-[1.5px] h-3.5 bg-white/60 rounded-full" />
            <div className="w-[1.5px] h-3.5 bg-white/60 rounded-full" />
          </div>
        </div>
      </div>

      <span className="text-xs sm:text-sm font-semibold text-slate-700 leading-snug flex-1">
        {label}
      </span>
    </div>
  );
};

// ==========================================
// 4. NEOMORPHIC ROTARY DIAL / KNOB (IMAGE 2)
// ==========================================
export const NeomorphicRotaryKnob: React.FC<{
  value?: number;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
}> = ({
  value = 65,
  label = "System Velocity",
  className
}) => {
  const rotationAngle = (value / 100) * 270 - 135;

  return (
    <div className={cn("neo-flat-lg p-6 rounded-3xl flex flex-col items-center justify-center", className)}>
      <div className="relative size-44 sm:size-48 flex items-center justify-center select-none">
        
        {/* Circular Sunken Ring with Tick Notches */}
        <div className="absolute inset-0 rounded-full neo-flat flex items-center justify-center border-2 border-white/80">
          {/* Radial Tick Lines around knob */}
          {[...Array(12)].map((_, i) => {
            const deg = i * 30;
            return (
              <div 
                key={i} 
                className="absolute w-[2px] h-3 bg-slate-400/80 rounded-full"
                style={{
                  top: 6,
                  transformOrigin: 'bottom center',
                  transform: `rotate(${deg}deg) translateY(0px)`
                }}
              />
            );
          })}
        </div>

        {/* Sunken Blue Halo Ring (Image 2) */}
        <div className="absolute inset-5 rounded-full neo-inset-deep border-2 border-blue-500/40 flex items-center justify-center shadow-[inset_0_0_12px_rgba(59,130,246,0.3)]">
          
          {/* Center Convex Knob Button */}
          <div 
            className="size-24 rounded-full neo-flat flex items-center justify-center relative cursor-pointer group shadow-lg border border-white/90"
            style={{ transform: `rotate(${rotationAngle}deg)` }}
          >
            {/* Needle Line Indicator */}
            <div className="absolute top-2 w-1 h-5 rounded-full bg-blue-600 shadow-sm" />
            <div className="size-4 rounded-full neo-inset-sm" />
          </div>
        </div>
      </div>

      <div className="mt-3 text-center">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-base font-extrabold font-mono text-slate-800">{value}%</p>
      </div>
    </div>
  );
};

// ==========================================
// 5. NEOMORPHIC SLIDER / STEP CONTROLLER (IMAGE 2)
// ==========================================
export const NeomorphicProgressBar: React.FC<{
  progress?: number;
  label?: string;
  showTicks?: boolean;
  className?: string;
}> = ({
  progress = 60,
  label = "Monthly Target Progress",
  showTicks = true,
  className
}) => {
  return (
    <div className={cn("neo-flat p-5 rounded-3xl space-y-3", className)}>
      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
        <span>{label}</span>
        <span className="font-mono text-blue-600">{progress}%</span>
      </div>

      {/* Recessed Track with Vertical Ticks & Raised Thumb (Image 2) */}
      <div className="h-7 w-full rounded-2xl neo-inset-deep p-1 flex items-center relative overflow-hidden">
        {/* Blue Filled Section */}
        <div 
          className="h-full rounded-xl bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300 flex items-center justify-end relative shadow-xs"
          style={{ width: `${progress}%` }}
        >
          {/* Raised Thumb Handle */}
          <div className="w-5 h-6 rounded-lg neo-flat-sm absolute -right-2 top-1/2 -translate-y-1/2 flex items-center justify-center border border-white cursor-pointer shadow-md">
            <div className="flex gap-0.5">
              <div className="w-[1px] h-3 bg-slate-400" />
              <div className="w-[1px] h-3 bg-slate-400" />
            </div>
          </div>
        </div>

        {/* Background Tick Marks */}
        {showTicks && (
          <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none opacity-40">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="w-[1px] h-2.5 bg-slate-500" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 6. NEOMORPHIC BOTTOM NAVIGATION BAR (IMAGE 1)
// ==========================================
export const NeomorphicNavBar: React.FC<{
  activeTab: string;
  onSelect: (tab: string) => void;
  className?: string;
}> = ({
  activeTab,
  onSelect,
  className
}) => {
  const navButtons = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'pos', icon: Zap, label: 'POS' },
    { id: 'cards', icon: CreditCard, label: 'Cards' },
    { id: 'settings', icon: Sliders, label: 'Settings' },
  ];

  return (
    <div className={cn("neo-flat-lg p-2.5 rounded-3xl flex items-center justify-around gap-2 max-w-md mx-auto", className)}>
      {navButtons.map((item) => {
        const isActive = activeTab === item.id;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "size-12 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer outline-none",
              isActive 
                ? "neo-inset text-blue-600 font-bold" 
                : "neo-btn text-slate-500 hover:text-slate-800"
            )}
            title={item.label}
          >
            <Icon className={cn("size-5", isActive ? "stroke-[2.5]" : "stroke-2")} />
          </button>
        );
      })}
    </div>
  );
};
