import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Clock, 
  MapPin, 
  History, 
  Calendar, 
  User, 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  AlertCircle,
  Timer,
  LogIn,
  LogOut,
  ChevronRight,
  Filter,
  Search,
  ArrowRightLeft,
  FileText, 
  Check, 
  X as CloseIcon, 
  MessageSquare, 
  CalendarOff,
  BarChart3,
  DollarSign,
  Coins,
  Download,
  Save,
  Percent,
  Printer,
  RefreshCw
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  setDoc,
  doc, 
  deleteDoc,
  Timestamp,
  serverTimestamp,
  getDocs,
  getDoc,
  limit,
  writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DataTablePagination } from '@/components/DataTablePagination';
import { DateRangeQueryGuardrail } from '@/components/DateRangeQueryGuardrail';
import { useAuth } from '@/contexts/AuthContext';
import { useLocations } from '@/contexts/LocationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabaseService } from '@/lib/supabase-service';
import { Attendance as AttendanceType, Schedule, UserProfile, AttendanceRequest } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format, isSameDay, startOfDay, endOfDay, parse, isValid, addDays, differenceInMinutes, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, isPast, isToday, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { logAction } from '@/lib/audit';

export const Attendance: React.FC = () => {
  const { profile, isAdmin, isManager } = useAuth();
  const { locations, selectedLocationId } = useLocations();
  const { settings } = useSettings();
  
  const [currentUserAttendance, setCurrentUserAttendance] = useState<AttendanceType | null>(null);
  const [personalLogs, setPersonalLogs] = useState<AttendanceType[]>([]);
  const [allLogs, setAllLogs] = useState<AttendanceType[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Partial<Schedule> | null>(null);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkConfig, setBulkConfig] = useState({
    userId: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    startTime: '12:00',
    endTime: '21:00',
    daysOff: [0, 6] as number[] // Sat, Sun off as requested (0=Sun, 6=Sat)
  });
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [scheduleSearch, setScheduleSearch] = useState('');
  const [personalLogsPage, setPersonalLogsPage] = useState(1);
  const [personalLogsPageSize, setPersonalLogsPageSize] = useState(20);
  const [schedulesPage, setSchedulesPage] = useState(1);
  const [schedulesPageSize, setSchedulesPageSize] = useState(20);
  const [compareUserFilter, setCompareUserFilter] = useState('all');
  const [compareDateFilter, setCompareDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));

  const staffAndManagers = useMemo(() => {
    return allUsers.filter(u => u.role === 'staff' || u.role === 'manager');
  }, [allUsers]);

  const filteredCompareUsers = useMemo(() => {
    if (compareUserFilter === 'all') {
      return staffAndManagers;
    }
    return staffAndManagers.filter(u => u.id === compareUserFilter);
  }, [staffAndManagers, compareUserFilter]);

  // Helper to get previous week's Saturday to current week's Monday
  const defaultRange = useMemo(() => {
    const today = new Date();
    const currentMonday = new Date(today);
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    currentMonday.setDate(today.getDate() + diffToMonday);
    
    const prevSaturday = new Date(currentMonday);
    prevSaturday.setDate(currentMonday.getDate() - 2);
    
    return {
      start: format(prevSaturday, 'yyyy-MM-dd'),
      end: format(currentMonday, 'yyyy-MM-dd')
    };
  }, []);

  // Payslip states
  const [payslipStartDate, setPayslipStartDate] = useState(defaultRange.start);
  const [payslipEndDate, setPayslipEndDate] = useState(defaultRange.end);
  const [selectedPayslipUser, setSelectedPayslipUser] = useState<string>('');
  const [ratesList, setRatesList] = useState<any[]>([]);
  const [payslipHourlyRate, setPayslipHourlyRate] = useState<string>('15');
  const [payslipOtRate, setPayslipOtRate] = useState<string>('15');
  const [payslipIncentiveAmount, setPayslipIncentiveAmount] = useState<string>('0');
  const [payslipIncentiveReason, setPayslipIncentiveReason] = useState<string>('');
  const [payslipDeductionAmount, setPayslipDeductionAmount] = useState<string>('0');
  const [payslipDeductionReason, setPayslipDeductionReason] = useState<string>('');
  const [isSavingRates, setIsSavingRates] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('history');

  const availableTabs = useMemo(() => {
    const list = [
      { id: 'history', label: 'My History', icon: History },
      { id: 'schedules', label: 'Team Schedules', icon: Calendar },
      { id: 'requests', label: 'Requests', icon: MessageSquare },
    ];
    if (isAdmin || isManager) {
      list.push(
        { id: 'report', label: 'Report', icon: BarChart3 },
        { id: 'compare', label: 'Comparison', icon: ArrowRightLeft }
      );
    }
    if (isAdmin) {
      list.push({ id: 'payslips', label: 'Payslips', icon: Coins });
    }
    return list;
  }, [isAdmin, isManager]);

  const [scheduleDateRange, setScheduleDateRange] = useState({ start: '', end: '' });
  const [scheduleSortBy, setScheduleSortBy] = useState('date_desc');
  const [sortRules, setSortRules] = useState<{ field: 'date' | 'name' | 'startTime'; direction: 'asc' | 'desc' }[]>([
    { field: 'date', direction: 'desc' },
    { field: 'name', direction: 'asc' }
  ]);
  const [newRequest, setNewRequest] = useState<Partial<AttendanceRequest>>({
    type: 'leave',
    status: 'pending',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    reason: ''
  });
  const [hoveredSchedule, setHoveredSchedule] = useState<{
    userName: string;
    dateStr: string;
    status: {
      type: 'leave' | 'off' | 'work' | 'none';
      label: string;
      fullName: string;
      colorClass: string;
      tooltip: string;
    };
    top: number;
    left: number;
  } | null>(null);
  
  const [reportStartDate, setReportStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [reportEndDate, setReportEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  
  const [editingLog, setEditingLog] = useState<{
    userId: string;
    userName: string;
    date: string;
    timeIn: string;
    timeOut: string;
  } | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());

  const getTimeInMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  };

  const parseTimeStringToDate = (dateStr: string, timeStr: string): Date | null => {
    if (!timeStr || !dateStr) return null;
    const trimmed = timeStr.trim();
    if (!trimmed) return null;
    
    // Try standard formats
    const formats = ['HH:mm', 'H:mm', 'HH:mm:ss', 'H:mm:ss', 'h:mm a', 'hh:mm a', 'h:mm A', 'hh:mm A'];
    for (const fmt of formats) {
      try {
        const d = parse(`${dateStr} ${trimmed}`, `yyyy-MM-dd ${fmt}`, new Date());
        if (isValid(d)) return d;
      } catch {
        // try next
      }
    }

    // Fallback regex match
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3]?.toLowerCase();
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (y && m && d) {
          const res = new Date(y, m - 1, d, hours, minutes, 0);
          if (isValid(res)) return res;
        }
      }
    }

    return null;
  };

  const extractHHMM = (ts: any, backup?: string): string | null => {
    if (!ts && !backup) return null;
    if (ts) {
      try {
        if (typeof ts.toDate === 'function') return format(ts.toDate(), 'HH:mm');
        if (ts.seconds) return format(new Date(ts.seconds * 1000), 'HH:mm');
        const d = new Date(ts);
        if (isValid(d)) return format(d, 'HH:mm');
      } catch {
        // fallback
      }
    }
    if (backup) {
      try {
        const d = new Date(backup);
        if (isValid(d)) return format(d, 'HH:mm');
      } catch {
        // ignore
      }
    }
    return null;
  };

  const formatDisplayTime = (timeStr: string | null | undefined): string => {
    if (!timeStr) return '--:--';
    const trimmed = timeStr.trim();
    if (trimmed === '--:--' || !trimmed) return '--:--';
    const parts = trimmed.split(':');
    if (parts.length < 2) return timeStr;
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].substring(0, 2);
    if (isNaN(hours)) return timeStr;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  const isUserLogMatch = (log: any, user: { id: string; name?: string; email?: string }) => {
    if (!log || !user) return false;
    if (log.userId === user.id) return true;
    if (user.email && log.userId?.toLowerCase() === user.email.toLowerCase()) return true;
    if (user.email && log.userName?.toLowerCase() === user.email.toLowerCase()) return true;
    if (user.name && log.userName?.toLowerCase() === user.name.toLowerCase()) return true;
    if (user.id && log.userName?.toLowerCase() === user.id.toLowerCase()) return true;
    return false;
  };

  const findUserLogForDate = (logs: AttendanceType[], user: { id: string; name?: string; email?: string }, dateStr: string) => {
    const matchingLogs = logs.filter(l => l.date === dateStr && isUserLogMatch(l, user));
    if (matchingLogs.length === 0) return null;
    const logWithTime = matchingLogs.find(l => l.timeIn || l.timeOut || l.timeInBackup || l.timeOutBackup);
    return logWithTime || matchingLogs[0];
  };

  useEffect(() => {
    if (newRequest.type === 'overtime' && newRequest.startDate) {
      const targetUserId = newRequest.userId || profile?.id;
      const dayStr = newRequest.startDate;

      const userSchedule = schedules.find(s => s.userId === targetUserId && s.date === dayStr);
      const userLog = allLogs.find(l => l.userId === targetUserId && l.date === dayStr);

      const schedStart = userSchedule && !userSchedule.isDayOff ? (userSchedule.startTime || '08:00') : '08:00';
      const schedEnd = userSchedule && !userSchedule.isDayOff ? (userSchedule.endTime || '17:00') : '17:00';

      const clockInStr = extractHHMM(userLog?.timeIn, userLog?.timeInBackup);
      const clockOutStr = extractHHMM(userLog?.timeOut, userLog?.timeOutBackup);

      // Detect pre-shift window: actual clock in to scheduled start time
      let maxPreStart: string | null = null;
      let maxPreEnd: string | null = null;
      let preAvail = false;

      if (clockInStr && schedStart && getTimeInMinutes(clockInStr) < getTimeInMinutes(schedStart)) {
        maxPreStart = clockInStr;
        maxPreEnd = schedStart;
        preAvail = true;
      }

      // Detect post-shift window: scheduled end time to actual clock out
      let maxPostStart: string | null = null;
      let maxPostEnd: string | null = null;
      let postAvail = false;

      let postClockOutMins = clockOutStr ? getTimeInMinutes(clockOutStr) : 0;
      const clockInMins = clockInStr ? getTimeInMinutes(clockInStr) : 0;
      const schedEndMins = getTimeInMinutes(schedEnd);

      // If clock-out time is earlier than clock-in time, it crossed midnight into next day
      if (clockOutStr && clockInStr && postClockOutMins < clockInMins) {
        postClockOutMins += 1440;
      }

      if (clockOutStr && schedEnd && postClockOutMins > schedEndMins) {
        maxPostStart = schedEnd;
        maxPostEnd = clockOutStr;
        postAvail = true;
      }

      setNewRequest(prev => {
        if (prev.type !== 'overtime') return prev;
        return {
          ...prev,
          schedStart,
          schedEnd,
          clockInStr,
          clockOutStr,
          isPreShiftSelected: preAvail,
          isPostShiftSelected: postAvail,
          preShiftOtStart: maxPreStart || '',
          preShiftOtEnd: maxPreEnd || '',
          postShiftOtStart: maxPostStart || '',
          postShiftOtEnd: maxPostEnd || '',
          maxPreShiftStart: maxPreStart,
          maxPreShiftEnd: maxPreEnd,
          maxPostShiftStart: maxPostStart,
          maxPostShiftEnd: maxPostEnd
        };
      });
    }
  }, [newRequest.type, newRequest.startDate, newRequest.userId, schedules, allLogs, profile?.id]);

  const formatSafeDate = (dateStr: string | undefined, formatStr: string = 'MMM dd, yyyy') => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isValid(d) ? format(d, formatStr) : dateStr;
  };

  const formatSafeTime = (ts: any, fallbackStr?: string) => {
    if (!ts) return '--:--';
    try {
      if (typeof ts.toDate === 'function') {
        return format(ts.toDate(), 'HH:mm');
      }
      if (ts && typeof ts === 'object' && 'seconds' in ts) {
        return format(new Date(ts.seconds * 1000), 'HH:mm');
      }
      if (fallbackStr) {
        const d = new Date(fallbackStr);
        if (isValid(d)) return format(d, 'HH:mm');
      }
      const d = new Date(ts);
      if (isValid(d)) return format(d, 'HH:mm');
    } catch (e) {
      console.error(e);
    }
    return '--:--';
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;

    // Listen to personal attendance requests
    const qRequests = isManager || isAdmin 
      ? query(collection(db, 'attendanceRequests'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'attendanceRequests'), where('userId', '==', profile.id));

    const unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRequest));
      if (!isManager && !isAdmin) {
        docs.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        });
      }
      setRequests(docs);
    });

    // Listen to today's personal attendance
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const qToday = query(
      collection(db, 'attendance'),
      where('userId', '==', profile.id),
      where('date', '==', todayStr),
      limit(1)
    );
    
    const unsubscribeToday = onSnapshot(qToday, (snapshot) => {
      if (!snapshot.empty) {
        setCurrentUserAttendance({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as AttendanceType);
      } else {
        setCurrentUserAttendance(null);
      }
    });

    // Listen to personal history
    const qHistory = query(
      collection(db, 'attendance'),
      where('userId', '==', profile.id)
    );
    const unsubscribeHistory = onSnapshot(qHistory, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceType));
      logs.sort((a, b) => b.date.localeCompare(a.date));
      setPersonalLogs(logs.slice(0, 10));
    }, (error) => {
      console.warn("Attendance: Error listening to personal history:", error);
    });

    // Listen to all users and schedules (needed for everyone to view schedule)
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      console.warn("Attendance: Error listening to users:", error);
    });

    const unsubscribeSchedules = onSnapshot(collection(db, 'schedules'), (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule)));
    }, (error) => {
      console.warn("Attendance: Error listening to schedules:", error);
    });

    let unsubscribeAllLogs = () => {};
    let unsubscribeRates = () => {};
    if (isAdmin || isManager) {
      unsubscribeAllLogs = onSnapshot(
        collection(db, 'attendance'),
        (snapshot) => {
          const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceType));
          logs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          setAllLogs(logs);
          setLoading(false);
        }, (error) => {
          console.warn("Attendance: Error listening to all attendance logs:", error);
          setLoading(false);
        }
      );
      unsubscribeRates = onSnapshot(collection(db, 'staffRates'), (snapshot) => {
        setRatesList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        console.warn("Attendance: Error listening to staffRates:", error);
      });
    } else if (profile?.id) {
      unsubscribeAllLogs = onSnapshot(
        query(collection(db, 'attendance'), where('userId', '==', profile.id)),
        (snapshot) => {
          setAllLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceType)));
          setLoading(false);
        }, (error) => {
          console.warn("Attendance: Error listening to personal attendance logs:", error);
          setLoading(false);
        }
      );
    } else {
      setLoading(false);
    }

    return () => {
      unsubscribeRequests();
      unsubscribeToday();
      unsubscribeHistory();
      unsubscribeUsers();
      unsubscribeSchedules();
      unsubscribeAllLogs();
      unsubscribeRates();
    };
  }, [profile?.id, isAdmin, isManager]);

  // Auto-select first staff/manager for Payslips
  useEffect(() => {
    if (staffAndManagers.length > 0 && !selectedPayslipUser) {
      setSelectedPayslipUser(staffAndManagers[0].id);
    }
  }, [staffAndManagers, selectedPayslipUser]);

  // Load current staff rates
  const currentStaffRates = useMemo(() => {
    const rateDoc = ratesList.find(r => r.id === selectedPayslipUser);
    return {
      hourlyRate: rateDoc?.hourlyRate ?? 15,
      otRate: rateDoc?.otRate ?? (rateDoc?.hourlyRate ?? 15),
      incentiveAmount: rateDoc?.incentiveAmount ?? 0,
      incentiveReason: rateDoc?.incentiveReason ?? '',
      manualDeduction: rateDoc?.manualDeduction ?? 0,
      deductionReason: rateDoc?.deductionReason ?? ''
    };
  }, [ratesList, selectedPayslipUser]);

  // Sync inputs with saved rates
  useEffect(() => {
    setPayslipHourlyRate(currentStaffRates.hourlyRate.toString());
    setPayslipOtRate(currentStaffRates.otRate.toString());
    setPayslipIncentiveAmount(currentStaffRates.incentiveAmount.toString());
    setPayslipIncentiveReason(currentStaffRates.incentiveReason);
    setPayslipDeductionAmount(currentStaffRates.manualDeduction.toString());
    setPayslipDeductionReason(currentStaffRates.deductionReason);
  }, [currentStaffRates]);

  // Keep OT Rate perfectly synced with the Regular Hourly Rate
  useEffect(() => {
    setPayslipOtRate(payslipHourlyRate);
  }, [payslipHourlyRate]);

  // Save rates to Firestore
  const handleSaveRates = async () => {
    if (!selectedPayslipUser) return;
    setIsSavingRates(true);
    try {
      await setDoc(doc(db, 'staffRates', selectedPayslipUser), {
        hourlyRate: parseFloat(payslipHourlyRate) || 0,
        otRate: parseFloat(payslipHourlyRate) || 0, // Matches regular rate
        incentiveAmount: parseFloat(payslipIncentiveAmount) || 0,
        incentiveReason: payslipIncentiveReason,
        manualDeduction: parseFloat(payslipDeductionAmount) || 0,
        deductionReason: payslipDeductionReason,
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast.success('Rates and adjustments updated successfully');
    } catch (err) {
      console.error('Error saving rates:', err);
      toast.error('Failed to save rates');
    } finally {
      setIsSavingRates(false);
    }
  };

  // Calculate Payslip breakdown
  const payslipData = useMemo(() => {
    if (!selectedPayslipUser || !payslipStartDate || !payslipEndDate) {
      return { days: [], totalScheduledHours: 0, totalActualHours: 0, totalRegularHours: 0, totalOtHours: 0, lateDeductionsCount: 0, totalLateDeductedHours: 0, totalLateMinutes: 0 };
    }

    const start = startOfDay(new Date(payslipStartDate));
    const end = endOfDay(new Date(payslipEndDate));

    if (!isValid(start) || !isValid(end)) {
      return { days: [], totalScheduledHours: 0, totalActualHours: 0, totalRegularHours: 0, totalOtHours: 0, lateDeductionsCount: 0, totalLateDeductedHours: 0, totalLateMinutes: 0 };
    }

    const daysInterval = eachDayOfInterval({ start, end });
    const staffSchedules = schedules.filter(s => s.userId === selectedPayslipUser);
    const staffLogs = allLogs.filter(l => l.userId === selectedPayslipUser);
    const staffRequests = requests.filter(r => r.userId === selectedPayslipUser && r.status === 'approved');

    let totalScheduledHours = 0;
    let totalActualHours = 0;
    let totalRegularHours = 0;
    let totalOtHours = 0;
    let lateDeductionsCount = 0;
    let totalLateDeductedHours = 0;
    let totalLateMinutes = 0;

    const daysBreakdown = daysInterval.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const schedule = staffSchedules.find(s => s.date === dayStr);
      const log = staffLogs.find(l => l.date === dayStr);
      const leaveRequest = staffRequests.find(r => r.type === 'leave' && r.startDate <= dayStr && (r.endDate || r.startDate) >= dayStr);
      const schChange = staffRequests.find(r => r.type === 'schedule_change' && r.startDate === dayStr);

      let status: 'off' | 'leave' | 'absent' | 'worked' | 'none' = 'none';
      let scheduledHrs = 0;
      let actualHrs = 0;
      let regHrs = 0;
      let otHrs = 0;
      let lateMins = 0;
      let lateDeductionHrs = 0;
      let isLateDeducted = false;

      // Calculate scheduled hours
      if (schedule && !schedule.isDayOff) {
        status = 'absent';
        if (schedule.startTime && schedule.endTime) {
          const sMin = getTimeInMinutes(schedule.startTime);
          const eMin = getTimeInMinutes(schedule.endTime);
          scheduledHrs = Math.max(0, (eMin - sMin) / 60);
          totalScheduledHours += scheduledHrs;
        }
      } else if (schedule?.isDayOff) {
        status = 'off';
      }

      if (leaveRequest) {
        status = 'leave';
      }

      if (log) {
        status = 'worked';
        if (log.timeIn && log.timeOut) {
          const clockedDuration = differenceInMinutes(log.timeOut.toDate(), log.timeIn.toDate());
          actualHrs = Math.max(0, clockedDuration / 60);
          totalActualHours += actualHrs;
        }

        // Calculate late minutes and tardiness penalty hours
        // Policy:
        // - 0-5 mins late: 0-5 mins late (0 hr penalty)
        // - > 5 mins to 60 mins: Automatic 1 hour penalty
        // - > 60 mins: Penalty equals exact hours late (e.g. 75m = 1.25 hrs)
        const effectiveStartTime = schChange?.newStartTime || schedule?.startTime;
        const effectiveEndTime = schChange?.newEndTime || schedule?.endTime;

        if (effectiveStartTime && log.timeIn) {
          const sMin = getTimeInMinutes(effectiveStartTime);
          const timeInObj = log.timeIn.toDate();
          const actualInMin = timeInObj.getHours() * 60 + timeInObj.getMinutes();
          if (actualInMin > sMin) {
            lateMins = actualInMin - sMin;
            totalLateMinutes += lateMins;
            if (lateMins > 5 && lateMins <= 60) {
              lateDeductionHrs = 1.0;
              isLateDeducted = true;
              lateDeductionsCount++;
              totalLateDeductedHours += 1.0;
            } else if (lateMins > 60) {
              lateDeductionHrs = lateMins / 60;
              isLateDeducted = true;
              lateDeductionsCount++;
              totalLateDeductedHours += lateDeductionHrs;
            }
          }
        }

        // Calculate regular vs overtime hours
        // Overtime MUST be explicitly requested by staff and approved by management!
        const approvedOtRequests = staffRequests.filter(r => 
          r.type === 'overtime' && 
          r.status === 'approved' && 
          r.startDate === dayStr
        );

        let approvedOtHrs = 0;
        approvedOtRequests.forEach(req => {
          if (typeof req.otHours === 'number' && req.otHours > 0) {
            approvedOtHrs += req.otHours;
          } else {
            let pMins = 0;
            if (req.isPreShiftSelected && req.preShiftOtStart && req.preShiftOtEnd) {
              pMins += Math.max(0, getTimeInMinutes(req.preShiftOtEnd) - getTimeInMinutes(req.preShiftOtStart));
            }
            if (req.isPostShiftSelected && req.postShiftOtStart && req.postShiftOtEnd) {
              pMins += Math.max(0, getTimeInMinutes(req.postShiftOtEnd) - getTimeInMinutes(req.postShiftOtStart));
            }
            approvedOtHrs += pMins / 60;
          }
        });

        // Base shift regular hours calculation (from scheduled start to actual/scheduled end)
        let baseRegHrs = 0;
        if (effectiveStartTime && log.timeOut && effectiveEndTime) {
          const sMin = getTimeInMinutes(effectiveStartTime);
          const eMin = getTimeInMinutes(effectiveEndTime);
          const timeOutObj = log.timeOut.toDate();
          const actualOutMin = timeOutObj.getHours() * 60 + timeOutObj.getMinutes();
          const effectiveOutMin = Math.min(eMin, actualOutMin);
          const baseShiftHrs = Math.max(0, (effectiveOutMin - sMin) / 60);
          baseRegHrs = scheduledHrs > 0 ? Math.min(baseShiftHrs, scheduledHrs) : actualHrs;
        } else {
          baseRegHrs = scheduledHrs > 0 ? Math.min(actualHrs, scheduledHrs) : actualHrs;
        }

        regHrs = Math.max(0, baseRegHrs - lateDeductionHrs);
        otHrs = approvedOtHrs;
        totalRegularHours += regHrs;
        totalOtHours += otHrs;
      }

      return {
        dateStr: dayStr,
        dateFormatted: format(day, 'EEE, MMM dd'),
        status,
        scheduledHrs,
        actualHrs,
        regHrs,
        otHrs,
        lateMins,
        lateDeductionHrs,
        isLateDeducted,
        timeInStr: log?.timeIn ? format(log.timeIn.toDate(), 'HH:mm') : null,
        timeOutStr: log?.timeOut ? format(log.timeOut.toDate(), 'HH:mm') : null,
        scheduleInStr: schChange?.newStartTime || schedule?.startTime || null,
        scheduleOutStr: schChange?.newEndTime || schedule?.endTime || null
      };
    });

    return {
      days: daysBreakdown,
      totalScheduledHours,
      totalActualHours,
      totalRegularHours,
      totalOtHours,
      lateDeductionsCount,
      totalLateDeductedHours,
      totalLateMinutes
    };
  }, [selectedPayslipUser, payslipStartDate, payslipEndDate, schedules, allLogs, requests]);

  const handleTimeIn = async () => {
    if (!profile) return;
    if (selectedLocationId === 'all') {
      toast.error('Please select a specific location to time in');
      return;
    }

    try {
      const location = locations.find(l => l.id === selectedLocationId);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      const attendanceData = {
        userId: profile.id,
        userName: profile.name || 'Staff',
        date: todayStr,
        timeIn: serverTimestamp(),
        timeInBackup: new Date().toISOString(),
        timeOut: null,
        locationId: selectedLocationId,
        locationName: location?.name || 'Unknown',
        notes: ''
      };

      const docRef = await addDoc(collection(db, 'attendance'), attendanceData);
      supabaseService.saveAttendance({
        id: docRef.id,
        userId: profile.id,
        userName: profile.name || 'Staff',
        locationId: selectedLocationId,
        clockIn: new Date().toISOString(),
        status: 'in-progress'
      }).catch(() => {});

      toast.success('Successfully timed in!');
      await logAction(profile, 'TIME_IN', `Timed in at ${location?.name}`);
    } catch (error) {
      console.error('Error timing in:', error);
      toast.error('Failed to time in');
    }
  };

  const handleTimeOut = async () => {
    if (!currentUserAttendance || !profile) return;

    try {
      const docRef = doc(db, 'attendance', currentUserAttendance.id);
      await updateDoc(docRef, {
        timeOut: serverTimestamp(),
        timeOutBackup: new Date().toISOString()
      });

      supabaseService.saveAttendance({
        id: currentUserAttendance.id,
        userId: currentUserAttendance.userId,
        userName: currentUserAttendance.userName,
        locationId: currentUserAttendance.locationId,
        clockIn: currentUserAttendance.timeInBackup || new Date().toISOString(),
        clockOut: new Date().toISOString(),
        status: 'completed'
      }).catch(() => {});

      toast.success('Successfully timed out!');
      await logAction(profile, 'TIME_OUT', `Timed out from ${currentUserAttendance.locationName}`);
    } catch (error) {
      console.error('Error timing out:', error);
      toast.error('Failed to time out');
    }
  };

  const handleSaveSchedule = async () => {
    if (!editingSchedule || !profile) return;
    
    try {
      const scheduleData = {
        ...editingSchedule,
        updatedAt: serverTimestamp()
      };

      if (editingSchedule.id) {
        const docRef = doc(db, 'schedules', editingSchedule.id);
        delete (scheduleData as any).id;
        await updateDoc(docRef, scheduleData);
        toast.success('Schedule updated');
      } else {
        await addDoc(collection(db, 'schedules'), scheduleData);
        toast.success('Schedule created');
      }
      
      setIsScheduleDialogOpen(false);
      setEditingSchedule(null);
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast.error('Failed to save schedule');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!id) {
      toast.error('Invalid schedule ID');
      return;
    }
    
    const isConfirmed = window.confirm('Are you sure you want to delete this schedule entry?');
    if (!isConfirmed) return;

    try {
      await deleteDoc(doc(db, 'schedules', id));
      toast.success('Schedule deleted successfully');
      await logAction(profile, 'DELETE_SCHEDULE', `Deleted schedule entry ${id}`);
    } catch (error) {
      console.error('Error deleting schedule:', error);
      toast.error('Failed to delete schedule. Please try again.');
    }
  };

  const executeApprovedRequestActions = async (req: Partial<AttendanceRequest> & { userId: string; userName: string; startDate: string; type: string }) => {
    if (req.type === 'time_correction') {
      const start = parseISO(req.startDate);
      const end = req.endDate ? parseISO(req.endDate) : start;
      const datesToProcess: string[] = [];

      if (isValid(start) && isValid(end) && end >= start) {
        let curr = start;
        while (curr <= end) {
          datesToProcess.push(format(curr, 'yyyy-MM-dd'));
          curr = addDays(curr, 1);
        }
      } else {
        datesToProcess.push(req.startDate);
      }

      for (const dateStr of datesToProcess) {
        let snap = await getDocs(query(
          collection(db, 'attendance'),
          where('userId', '==', req.userId),
          where('date', '==', dateStr),
          limit(1)
        ));

        if (snap.empty) {
          const dateSnap = await getDocs(query(
            collection(db, 'attendance'),
            where('date', '==', dateStr)
          ));
          const matchedDoc = dateSnap.docs.find(d => {
            const data = d.data();
            return data.userId === req.userId ||
              (req.userName && data.userName?.toLowerCase() === req.userName.toLowerCase()) ||
              (req.userId && data.userId?.toLowerCase() === req.userId.toLowerCase());
          });
          if (matchedDoc) {
            snap = {
              empty: false,
              docs: [matchedDoc]
            } as any;
          }
        }
        
        let timeInDate: Date | null = req.newStartTime ? parseTimeStringToDate(dateStr, req.newStartTime) : null;
        let timeOutDate: Date | null = req.newEndTime ? parseTimeStringToDate(dateStr, req.newEndTime) : null;

        let existingDocData: any = null;
        let existingTimeInDate: Date | null = null;

        if (!snap.empty) {
          existingDocData = snap.docs[0].data();
          if (existingDocData.timeIn?.toDate) {
            existingTimeInDate = existingDocData.timeIn.toDate();
          } else if (existingDocData.timeInBackup) {
            const parsed = new Date(existingDocData.timeInBackup);
            if (isValid(parsed)) existingTimeInDate = parsed;
          }
        }

        const refTimeInDate = timeInDate || existingTimeInDate;

        if (timeOutDate && refTimeInDate && isValid(timeOutDate) && isValid(refTimeInDate) && timeOutDate < refTimeInDate) {
          timeOutDate = addDays(timeOutDate, 1);
        }

        const timeInTimestamp = timeInDate && isValid(timeInDate) ? Timestamp.fromDate(timeInDate) : null;
        const timeInBackup = timeInDate && isValid(timeInDate) ? timeInDate.toISOString() : null;

        const timeOutTimestamp = timeOutDate && isValid(timeOutDate) ? Timestamp.fromDate(timeOutDate) : null;
        const timeOutBackup = timeOutDate && isValid(timeOutDate) ? timeOutDate.toISOString() : null;

        const locationId = req.locationId || existingDocData?.locationId || locations[0]?.id || 'all';
        const locationName = req.locationName || existingDocData?.locationName || locations[0]?.name || 'Default';

        if (!snap.empty) {
          const attDoc = snap.docs[0];
          const updateData: any = {};
          if (timeInTimestamp) {
            updateData.timeIn = timeInTimestamp;
            updateData.timeInBackup = timeInBackup;
          }
          if (timeOutTimestamp) {
            updateData.timeOut = timeOutTimestamp;
            updateData.timeOutBackup = timeOutBackup;
          }
          if (req.locationId) updateData.locationId = req.locationId;
          if (req.locationName) updateData.locationName = req.locationName;

          if (Object.keys(updateData).length > 0) {
            await updateDoc(doc(db, 'attendance', attDoc.id), updateData);
          }
        } else {
          await addDoc(collection(db, 'attendance'), {
            userId: req.userId,
            userName: req.userName,
            date: dateStr,
            timeIn: timeInTimestamp,
            timeInBackup,
            timeOut: timeOutTimestamp,
            timeOutBackup,
            locationId,
            locationName,
            notes: 'Time correction requested and approved'
          });
        }
      }
    } else if (req.type === 'schedule_change') {
      const start = new Date(req.startDate);
      const end = req.endDate ? new Date(req.endDate) : start;
      
      if (isValid(start) && isValid(end)) {
        const days = eachDayOfInterval({ start, end });
        const batch = writeBatch(db);
        
        for (const day of days) {
          const dateStr = format(day, 'yyyy-MM-dd');
          
          // Find existing schedule for this user and date
          const existing = schedules.find(s => s.userId === req.userId && s.date === dateStr);
          
          const scheduleData = {
            userId: req.userId,
            userName: req.userName,
            date: dateStr,
            isDayOff: false,
            startTime: req.newStartTime || null,
            endTime: req.newEndTime || null,
            updatedAt: serverTimestamp()
          };
          
          if (existing) {
            batch.update(doc(db, 'schedules', existing.id), scheduleData);
          } else {
            batch.set(doc(collection(db, 'schedules')), scheduleData);
          }
        }
        await batch.commit();
      }
    }
  };

  const handleSaveDirectLog = async () => {
    if (!editingLog) return;
    try {
      const dateSnap = await getDocs(query(
        collection(db, 'attendance'),
        where('date', '==', editingLog.date)
      ));

      const targetUser = allUsers.find(u => u.id === editingLog.userId) || { id: editingLog.userId, name: editingLog.userName };

      const matchingDocs = dateSnap.docs.filter(d => {
        const data = d.data();
        return isUserLogMatch(data, targetUser) ||
          (editingLog.userName && data.userName?.toLowerCase() === editingLog.userName.toLowerCase()) ||
          (editingLog.userId && data.userId?.toLowerCase() === editingLog.userId.toLowerCase());
      });

      let timeInDate = editingLog.timeIn ? parseTimeStringToDate(editingLog.date, editingLog.timeIn) : null;
      let timeOutDate = editingLog.timeOut ? parseTimeStringToDate(editingLog.date, editingLog.timeOut) : null;

      if (timeOutDate && timeInDate && isValid(timeOutDate) && isValid(timeInDate) && timeOutDate < timeInDate) {
        timeOutDate = addDays(timeOutDate, 1);
      }

      const timeInTimestamp = timeInDate && isValid(timeInDate) ? Timestamp.fromDate(timeInDate) : null;
      const timeInBackup = timeInDate && isValid(timeInDate) ? timeInDate.toISOString() : null;
      const timeOutTimestamp = timeOutDate && isValid(timeOutDate) ? Timestamp.fromDate(timeOutDate) : null;
      const timeOutBackup = timeOutDate && isValid(timeOutDate) ? timeOutDate.toISOString() : null;

      const payload: any = {
        userId: targetUser.id || editingLog.userId,
        userName: targetUser.name || targetUser.email || editingLog.userName,
        date: editingLog.date,
        timeIn: timeInTimestamp,
        timeInBackup: timeInBackup,
        timeOut: timeOutTimestamp,
        timeOutBackup: timeOutBackup,
        updatedAt: serverTimestamp()
      };

      if (matchingDocs.length > 0) {
        const primaryDoc = matchingDocs[0];
        await updateDoc(doc(db, 'attendance', primaryDoc.id), payload);

        // Delete any duplicate redundant docs for the same user and date
        if (matchingDocs.length > 1) {
          for (let i = 1; i < matchingDocs.length; i++) {
            await deleteDoc(doc(db, 'attendance', matchingDocs[i].id));
          }
        }
      } else {
        await addDoc(collection(db, 'attendance'), {
          ...payload,
          locationId: locations[0]?.id || 'all',
          locationName: locations[0]?.name || 'Default',
          notes: 'Directly edited by Admin/Manager',
          createdAt: serverTimestamp()
        });
      }

      toast.success('Attendance log updated successfully!');
      setEditingLog(null);
    } catch (err) {
      console.error('Error saving direct attendance log:', err);
      toast.error('Failed to save attendance log');
    }
  };

  const handleSubmitRequest = async () => {
    if (!profile || !newRequest.reason) {
      toast.error('Please provide a reason');
      return;
    }

    const targetUserId = newRequest.userId || profile.id;
    const targetUser = allUsers.find(u => u.id === targetUserId);
    const targetUserName = targetUser?.name || targetUser?.email || profile.name || profile.email;

    if (newRequest.type === 'overtime') {
      if (!newRequest.isPreShiftSelected && !newRequest.isPostShiftSelected) {
        toast.error('Please select at least one Overtime option (Pre-Shift or Post-Shift)');
        return;
      }

      // Validate Pre-Shift OT
      if (newRequest.isPreShiftSelected) {
        const pStart = newRequest.preShiftOtStart || '';
        const pEnd = newRequest.preShiftOtEnd || '';
        const maxStart = newRequest.maxPreShiftStart || '00:00';
        const maxEnd = newRequest.maxPreShiftEnd || '23:59';

        if (!pStart || !pEnd) {
          toast.error('Please specify both Start and End time for Pre-Shift OT');
          return;
        }
        if (getTimeInMinutes(pStart) >= getTimeInMinutes(pEnd)) {
          toast.error('Pre-Shift OT Start time must be before End time');
          return;
        }
        if (getTimeInMinutes(pStart) < getTimeInMinutes(maxStart)) {
          toast.error(`Pre-shift OT start time (${pStart}) cannot be earlier than actual login time (${maxStart})`);
          return;
        }
        if (getTimeInMinutes(pEnd) > getTimeInMinutes(maxEnd)) {
          toast.error(`Pre-shift OT end time (${pEnd}) cannot exceed shift start time (${maxEnd})`);
          return;
        }
      }

      // Validate Post-Shift OT
      if (newRequest.isPostShiftSelected) {
        const pStart = newRequest.postShiftOtStart || '';
        const pEnd = newRequest.postShiftOtEnd || '';
        const maxStart = newRequest.maxPostShiftStart || '00:00';
        const maxEnd = newRequest.maxPostShiftEnd || '23:59';

        if (!pStart || !pEnd) {
          toast.error('Please specify both Start and End time for Post-Shift OT');
          return;
        }
        if (getTimeInMinutes(pStart) >= getTimeInMinutes(pEnd)) {
          toast.error('Post-Shift OT Start time must be before End time');
          return;
        }
        if (getTimeInMinutes(pStart) < getTimeInMinutes(maxStart)) {
          toast.error(`Post-shift OT start time (${pStart}) cannot be earlier than shift end time (${maxStart})`);
          return;
        }
        if (getTimeInMinutes(pEnd) > getTimeInMinutes(maxEnd)) {
          toast.error(`Post-shift OT end time (${pEnd}) cannot exceed actual logout time (${maxEnd})`);
          return;
        }
      }
    }

    try {
      let otHours = 0;
      if (newRequest.type === 'overtime') {
        let totalOtMins = 0;
        if (newRequest.isPreShiftSelected && newRequest.preShiftOtStart && newRequest.preShiftOtEnd) {
          totalOtMins += getTimeInMinutes(newRequest.preShiftOtEnd) - getTimeInMinutes(newRequest.preShiftOtStart);
        }
        if (newRequest.isPostShiftSelected && newRequest.postShiftOtStart && newRequest.postShiftOtEnd) {
          totalOtMins += getTimeInMinutes(newRequest.postShiftOtEnd) - getTimeInMinutes(newRequest.postShiftOtStart);
        }
        otHours = Math.max(0, totalOtMins / 60);
      }

      const isAutoApprove = (isAdmin || isManager) && (newRequest.autoApprove !== false);
      const initialStatus = isAutoApprove ? 'approved' : 'pending';

      const requestData = {
        ...newRequest,
        status: initialStatus as 'pending' | 'approved',
        otHours: newRequest.type === 'overtime' ? otHours : null,
        userId: targetUserId,
        userName: targetUserName,
        createdBy: profile.id,
        createdByName: profile.name || profile.email,
        createdAt: serverTimestamp(),
        ...(initialStatus === 'approved' ? {
          reviewedBy: profile.id,
          reviewedByName: profile.name || profile.email,
          reviewedAt: serverTimestamp()
        } : {})
      };

      await addDoc(collection(db, 'attendanceRequests'), requestData);

      if (initialStatus === 'approved') {
        await executeApprovedRequestActions({
          ...requestData,
          startDate: newRequest.startDate || format(new Date(), 'yyyy-MM-dd'),
          type: newRequest.type || 'leave'
        });
      }

      toast.success(initialStatus === 'approved' ? 'Request submitted and approved successfully' : 'Request submitted successfully');
      setIsRequestDialogOpen(false);
      setNewRequest({
        type: 'leave',
        status: 'pending',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        userId: profile.id,
        reason: ''
      });
      await logAction(profile, 'REQUEST_SUBMITTED', `Submitted a ${newRequest.type} request for ${targetUserName}`);
    } catch (error) {
      console.error('Error submitting request:', error);
      toast.error('Failed to submit request');
    }
  };

  const handleReviewRequest = async (requestId: string, status: 'approved' | 'rejected') => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'attendanceRequests', requestId), {
        status,
        reviewedBy: profile.id,
        reviewedByName: profile.name || profile.email,
        reviewedAt: serverTimestamp()
      });

      if (status === 'approved') {
        const reqSnap = await getDoc(doc(db, 'attendanceRequests', requestId));
        const reqData = reqSnap.exists() 
          ? ({ id: reqSnap.id, ...reqSnap.data() } as AttendanceRequest) 
          : requests.find(r => r.id === requestId);
        if (reqData) {
          await executeApprovedRequestActions(reqData);
        }
      }

      toast.success(`Request ${status}`);
      await logAction(profile, `REQUEST_${status.toUpperCase()}`, `Request ${requestId} was ${status}`);
    } catch (error) {
      console.error('Error updating request:', error);
      toast.error('Failed to update request');
    }
  };

  const handleGenerateBulkSchedule = async () => {
    if (!profile || !bulkConfig.userId || !bulkConfig.startDate || !bulkConfig.endDate) {
      toast.error('Please complete all bulk generator fields');
      return;
    }

    try {
      setLoading(true);
      const start = new Date(bulkConfig.startDate);
      const end = new Date(bulkConfig.endDate);
      
      if (!isValid(start) || !isValid(end)) {
        toast.error('Invalid date range selected');
        return;
      }

      const days = eachDayOfInterval({ start, end });
      const batch = writeBatch(db);

      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = day.getDay();
        const isDayOff = bulkConfig.daysOff.includes(dayOfWeek);
        
        // Find existing schedule for this date if any (more efficient to check from already loaded schedules)
        const existing = schedules.find(s => s.userId === bulkConfig.userId && s.date === dateStr);
        
        const scheduleData = {
          userId: bulkConfig.userId,
          userName: allUsers.find(u => u.id === bulkConfig.userId)?.name || allUsers.find(u => u.id === bulkConfig.userId)?.email || bulkConfig.userId,
          date: dateStr,
          isDayOff: isDayOff,
          startTime: isDayOff ? null : bulkConfig.startTime,
          endTime: isDayOff ? null : bulkConfig.endTime,
          updatedAt: serverTimestamp()
        };

        if (existing) {
          batch.update(doc(db, 'schedules', existing.id), scheduleData);
        } else {
          batch.set(doc(collection(db, 'schedules')), scheduleData);
        }
      }

      await batch.commit();
      toast.success('Bulk schedule generated successfully');
      setIsBulkDialogOpen(false);
      await logAction(profile, 'BULK_SCHEDULE_GENERATED', `Populated schedule for staff ${bulkConfig.userId} from ${bulkConfig.startDate} to ${bulkConfig.endDate}`);
    } catch (error) {
      console.error('Error in bulk generation:', error);
      toast.error('Failed to generate bulk schedule');
    } finally {
      setLoading(false);
    }
  };

  const calculateStaffStats = (userId: string) => {
    if (!reportStartDate || !reportEndDate) {
      return { totalHours: '0.0', lateMinutes: 0, absences: 0, leaves: 0 };
    }

    try {
      const start = startOfDay(new Date(reportStartDate));
      const end = endOfDay(new Date(reportEndDate));
      
      if (!isValid(start) || !isValid(end)) {
        return { totalHours: '0.0', lateMinutes: 0, absences: 0, leaves: 0 };
      }

      const days = eachDayOfInterval({ start, end });
      
      let totalWorkMinutes = 0;
      let lateMinutes = 0;
      let absences = 0;
      let leaves = 0;

      const staffSchedules = schedules.filter(s => s.userId === userId);
      const staffLogs = allLogs.filter(l => l.userId === userId);
      const staffRequests = requests.filter(r => r.userId === userId && r.status === 'approved');

      days.forEach(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const schedule = staffSchedules.find(s => s.date === dayStr);
        const log = staffLogs.find(l => l.date === dayStr);
        const leaveRequest = staffRequests.find(r => r.type === 'leave' && r.startDate <= dayStr && (r.endDate || r.startDate) >= dayStr);
        const schChange = staffRequests.find(r => r.type === 'schedule_change' && r.startDate === dayStr);

        if (leaveRequest) {
          leaves++;
          return;
        }

        // Important: Absence is only if there IS a schedule (not a day off) and NO log
        if (schedule && !schedule.isDayOff) {
          if (!log) {
            if (isPast(day) && !isToday(day)) {
              absences++;
            }
          } else {
            if (log.timeIn && log.timeOut) {
              const duration = differenceInMinutes(log.timeOut.toDate(), log.timeIn.toDate());
              totalWorkMinutes += duration;
            }

            const effectiveStartTime = schChange?.newStartTime || schedule.startTime;
            if (effectiveStartTime && log.timeIn) {
              const schedInMinutes = getTimeInMinutes(effectiveStartTime);
              const actualInMinutes = log.timeIn.toDate().getHours() * 60 + log.timeIn.toDate().getMinutes();
              if (actualInMinutes > schedInMinutes) {
                lateMinutes += (actualInMinutes - schedInMinutes);
              }
            }
          }
        }
      });

      return {
        totalHours: (totalWorkMinutes / 60).toFixed(1),
        lateMinutes,
        absences,
        leaves
      };
    } catch (error) {
      console.error('Error calculating staff stats:', error);
      return { totalHours: '0.0', lateMinutes: 0, absences: 0, leaves: 0 };
    }
  };

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const getDateSchedule = (userId: string, dateStr: string) => {
    return schedules.find(s => s.userId === userId && s.date === dateStr);
  };

  const upcomingDates = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i));
  }, []);

  const getUserScheduleStatusForDate = (userId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // 1. Check approved leave requests
    const leave = requests.find(r => 
      r.userId === userId && 
      r.status === 'approved' && 
      r.type === 'leave' && 
      r.startDate <= dateStr && 
      (r.endDate ? r.endDate >= dateStr : r.startDate === dateStr)
    );
    
    if (leave) {
      return {
        type: 'leave' as const,
        label: 'L',
        fullName: 'On Leave',
        colorClass: 'bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100',
        tooltip: `On Leave: ${leave.reason || 'No reason provided'}`
      };
    }
    
    // 2. Check schedules
    const schedule = schedules.find(s => s.userId === userId && s.date === dateStr);
    if (schedule) {
      if (schedule.isDayOff) {
        return {
          type: 'off' as const,
          label: 'Off',
          fullName: 'Day Off',
          colorClass: 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100',
          tooltip: 'Day Off'
        };
      } else {
        return {
          type: 'work' as const,
          label: `${schedule.startTime}`,
          fullName: `Working: ${schedule.startTime} - ${schedule.endTime}`,
          colorClass: 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100',
          tooltip: `Working: ${schedule.startTime} - ${schedule.endTime}`
        };
      }
    }
    
    return {
      type: 'none' as const,
      label: '-',
      fullName: 'No Schedule',
      colorClass: 'bg-slate-50/50 text-slate-300 border-slate-100 hover:bg-slate-100/50',
      tooltip: 'No Schedule Set'
    };
  };

  const filteredSchedules = useMemo(() => {
    let result = [...schedules];

    // For staff users, only their schedule should be seen in the table.
    if (!isAdmin && !isManager && profile?.id) {
      result = result.filter(sch => sch.userId === profile.id);
    }

    // Filter by search query
    if (scheduleSearch) {
      const searchLower = scheduleSearch.toLowerCase();
      result = result.filter(sch => {
        const staffName = sch.userName || allUsers.find(u => u.id === sch.userId)?.name || sch.userId;
        return (
          staffName?.toLowerCase().includes(searchLower) ||
          sch.date.includes(searchLower)
        );
      });
    }

    // Filter by date range
    if (scheduleDateRange.start) {
      result = result.filter(sch => sch.date >= scheduleDateRange.start);
    }
    if (scheduleDateRange.end) {
      result = result.filter(sch => sch.date <= scheduleDateRange.end);
    }

    // Multi-key sequential sorting
    result.sort((a, b) => {
      for (const rule of sortRules) {
        let comparison = 0;
        if (rule.field === 'date') {
          comparison = a.date.localeCompare(b.date);
        } else if (rule.field === 'name') {
          const nameA = a.userName || allUsers.find(u => u.id === a.userId)?.name || a.userId || '';
          const nameB = b.userName || allUsers.find(u => u.id === b.userId)?.name || b.userId || '';
          comparison = nameA.localeCompare(nameB);
        } else if (rule.field === 'startTime') {
          comparison = (a.startTime || '').localeCompare(b.startTime || '');
        }
        
        if (comparison !== 0) {
          return rule.direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });

    return result;
  }, [schedules, scheduleSearch, scheduleDateRange, sortRules, allUsers, profile, isAdmin, isManager]);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-primary tracking-tight font-heading">Attendance</h1>
          <p className="text-muted-foreground mt-1">Manage schedules and track your working hours.</p>
        </div>
        <div className="flex items-center gap-3 bg-white/50 backdrop-blur-sm px-6 py-3 rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="text-right">
            <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">{format(currentDate, 'EEEE, MMMM dd')}</p>
            <p className="text-xl font-black text-primary tabular-nums">{format(currentTime, 'HH:mm:ss')}</p>
          </div>
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center">
            <Timer className="w-6 h-6 text-primary" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Action Section */}
        <div className="lg:col-span-4 space-y-6">
          <Card className={cn(
            "relative overflow-hidden border-none shadow-2xl transition-all duration-500",
            currentUserAttendance && !currentUserAttendance.timeOut 
              ? "bg-gradient-to-br from-[#1A2B4B] to-[#2C3E50] text-white border-b-2 border-[#D4AF37]/30" 
              : "bg-[#FDFCF8] border border-[#D4AF37]/10"
          )}>
            <CardHeader className="relative z-10">
              <CardTitle className={cn(
                "text-lg font-bold tracking-tight font-heading",
                currentUserAttendance && !currentUserAttendance.timeOut ? "text-white" : "text-[#1A2B4B]"
              )}>
                Timesheet Control
              </CardTitle>
              <CardDescription className={currentUserAttendance && !currentUserAttendance.timeOut ? "text-white/70" : "text-slate-500"}>
                Clock in when starting shift, clock out when finished.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10 flex flex-col items-center py-5">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-lg ring-4",
                currentUserAttendance && !currentUserAttendance.timeOut 
                  ? "bg-white/10 ring-white/10 text-white" 
                  : "bg-primary/5 ring-primary/5 text-primary"
              )}>
                <Clock className="w-8 h-8" />
              </div>

              {!currentUserAttendance ? (
                <div className="w-full space-y-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <MapPin className="w-4 h-4 text-primary/40" />
                      <div>
                        <p className="text-[10px] font-bold text-primary/40 uppercase">Location</p>
                        <p className="text-xs font-bold text-primary">
                          {selectedLocationId === 'all' ? 'Select location first' : locations.find(l => l.id === selectedLocationId)?.name}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button 
                    className="w-full h-12 text-sm font-black bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl shadow-md shadow-[#1A2B4B]/10 transition-all active:scale-95 group"
                    onClick={handleTimeIn}
                    disabled={selectedLocationId === 'all'}
                  >
                    <LogIn className="w-4 h-4 mr-2 group-hover:translate-x-1 transition-transform" />
                    TIME IN
                  </Button>
                </div>
              ) : !currentUserAttendance.timeOut ? (
                <div className="w-full space-y-4">
                  <div className="space-y-1 text-center text-white">
                    <p className="text-xs font-bold opacity-60 uppercase tracking-widest">Shift Started</p>
                    <p className="text-2xl font-black">
                      {formatSafeTime(currentUserAttendance.timeIn, currentUserAttendance.timeInBackup)}
                    </p>
                    <div className="flex items-center justify-center gap-1.5 text-xs font-medium opacity-80">
                      <MapPin className="w-3 h-3" />
                      {currentUserAttendance.locationName}
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    className="w-full h-12 text-sm font-black bg-white hover:bg-slate-50 text-rose-600 border-none rounded-xl shadow-md transition-all active:scale-95 group"
                    onClick={handleTimeOut}
                  >
                    <LogOut className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                    TIME OUT
                  </Button>
                </div>
              ) : (
                <div className="w-full text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 mb-1">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-base font-black text-primary">Shift Completed</p>
                    <p className="text-xs text-muted-foreground">You are clocked out for today.</p>
                  </div>
                  <div className="flex items-center justify-center gap-5 pt-2">
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">In</p>
                      <p className="text-xs font-bold text-primary">
                        {formatSafeTime(currentUserAttendance.timeIn, currentUserAttendance.timeInBackup)}
                      </p>
                    </div>
                    <div className="w-px h-6 bg-slate-100" />
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Out</p>
                      <p className="text-xs font-bold text-primary">
                        {formatSafeTime(currentUserAttendance.timeOut, currentUserAttendance.timeOutBackup)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            {/* Background elements */}
            <div className="absolute top-0 right-0 -transtale-y-1/2 translate-x-1/2 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-48 h-48 bg-black/5 rounded-full blur-3xl pointer-events-none" />
          </Card>

          <Card className="border-none shadow-xl bg-white/50 backdrop-blur-sm overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-primary/5">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary/40" />
                Today's Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {(() => {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const schedule = getDateSchedule(profile?.id || '', todayStr);
                if (!schedule || schedule.isDayOff) return (
                  <div className="text-center py-4">
                    <CalendarOff className="w-10 h-10 text-slate-500/20 mx-auto mb-3" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{schedule?.isDayOff ? 'Day Off' : 'No Schedule Set'}</p>
                    <p className="text-[10px] mt-1 text-slate-400">Enjoy your rest or consult manager.</p>
                  </div>
                );
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#1A2B4B]/5 rounded-lg flex items-center justify-center text-[#1A2B4B]">
                          <LogIn className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-500">Scheduled In</span>
                      </div>
                      <span className="text-sm font-black text-[#1A2B4B]">{schedule.startTime}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                          <LogOut className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-500">Scheduled Out</span>
                      </div>
                      <span className="text-sm font-black text-primary">{schedule.endTime}</span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-white/50 backdrop-blur-sm overflow-hidden mt-5">
            <CardHeader className="bg-primary/5 border-b border-primary/5 pb-2.5 pt-3.5 px-4">
              <CardTitle className="text-xs font-bold flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-primary/40" />
                Upcoming Team Calendar
              </CardTitle>
              <CardDescription className="text-[10px]">
                Weekly schedule & leave indicator of all team members.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/40">
                      <th className="pl-3 pr-1 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest min-w-[75px]">Staff</th>
                      {upcomingDates.map((date, idx) => (
                        <th key={idx} className="px-0.5 py-1.5 text-center min-w-[34px]">
                          <p className="text-[8px] font-bold text-slate-400 uppercase">{format(date, 'EEE').substring(0, 2)}</p>
                          <p className={cn(
                            "text-[11px] font-black",
                            isToday(date) ? "text-indigo-600 font-extrabold" : "text-slate-700"
                          )}>{format(date, 'd')}</p>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {allUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50/40">
                        <td className="pl-3 pr-1 py-1.5 text-[11px] font-bold text-slate-700 max-w-[85px] truncate">
                          {user.name || user.email?.split('@')[0] || user.id}
                        </td>
                        {upcomingDates.map((date, idx) => {
                          const status = getUserScheduleStatusForDate(user.id, date);
                          return (
                            <td key={idx} className="px-0.5 py-1.5 text-center align-middle">
                              <div className="flex justify-center">
                                {/* The indicator trigger */}
                                <div 
                                  className={cn(
                                    "w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black border transition-all cursor-help shadow-xs",
                                    status.colorClass
                                  )}
                                  onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredSchedule({
                                      userName: user.name || user.email || user.id,
                                      dateStr: format(date, 'EEEE, MMMM dd'),
                                      status,
                                      top: rect.top,
                                      left: rect.left + rect.width / 2,
                                    });
                                  }}
                                  onMouseLeave={() => setHoveredSchedule(null)}
                                >
                                  {status.type === 'work' ? 'W' : status.label}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* View Selection Section */}
        <div className="lg:col-span-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="mb-6">
              {/* Mobile Tab Selector (Select Dropdown) */}
              <div className="block md:hidden">
                <div className="relative">
                  <Label className="text-[10px] font-black uppercase tracking-wider text-[#1A2B4B]/60 mb-1.5 block">
                    Navigate Modules
                  </Label>
                  <Select value={activeTab} onValueChange={setActiveTab}>
                    <SelectTrigger className="w-full h-12 bg-[#FDFCF8] border border-[#D4AF37]/30 text-[#1A2B4B] rounded-xl shadow-sm font-bold text-sm px-4 focus:ring-2 focus:ring-[#1A2B4B] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {(() => {
                          const currentTab = availableTabs.find(t => t.id === activeTab);
                          if (currentTab) {
                            const Icon = currentTab.icon;
                            return (
                              <>
                                <div className="w-6 h-6 rounded-lg bg-[#1A2B4B]/5 flex items-center justify-center text-[#1A2B4B]">
                                  <Icon className="w-4 h-4" />
                                </div>
                                <span className="font-bold">{currentTab.label}</span>
                              </>
                            );
                          }
                          return <span>Select view</span>;
                        })()}
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-[#FDFCF8] border border-[#D4AF37]/20 rounded-xl shadow-lg">
                      {availableTabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                          <SelectItem 
                            key={tab.id} 
                            value={tab.id}
                            className="font-bold text-xs text-[#1A2B4B] hover:bg-[#1A2B4B]/5 focus:bg-[#1A2B4B]/5 cursor-pointer py-3 rounded-lg"
                          >
                            <div className="flex items-center gap-2.5">
                              <Icon className="w-4 h-4 text-[#1A2B4B]/60" />
                              <span>{tab.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Desktop Segmented Control Tab List */}
              <div className="hidden md:block">
                <TabsList className="bg-slate-100/50 p-1.5 rounded-2xl min-h-12 border border-slate-200/60 max-w-full flex w-fit">
                  {availableTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <TabsTrigger 
                        key={tab.id}
                        value={tab.id} 
                        className={cn(
                          "rounded-xl px-5 h-10 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all duration-200",
                          isActive 
                            ? "bg-[#1A2B4B] text-white shadow-md border-b-2 border-[#D4AF37]/40" 
                            : "text-[#1A2B4B]/70 hover:bg-[#1A2B4B]/5 hover:text-[#1A2B4B]"
                        )}
                      >
                        <Icon className={cn("w-3.5 h-3.5", isActive ? "text-[#D4AF37]" : "text-[#1A2B4B]/50")} />
                        {tab.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>
            </div>

            <TabsContent value="requests">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-primary uppercase">Absence & Schedule Requests</h3>
                  <Button 
                    onClick={() => {
                      setNewRequest({
                        type: 'leave',
                        status: 'pending',
                        startDate: format(new Date(), 'yyyy-MM-dd'),
                        userId: profile?.id,
                        userName: profile?.name || profile?.email || '',
                        autoApprove: true,
                        reason: ''
                      });
                      setIsRequestDialogOpen(true);
                    }}
                    className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl gap-2 font-bold text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    New Request
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {requests.map((req) => (
                    <Card key={req.id} className="border-none shadow-sm hover:shadow-md transition-all overflow-hidden bg-white">
                      <CardContent className="p-5">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-12 h-12 rounded-2xl flex items-center justify-center",
                              req.type === 'leave' ? "bg-rose-50 text-rose-500" : 
                              req.type === 'time_correction' ? "bg-amber-50 text-amber-600" : 
                              req.type === 'overtime' ? "bg-purple-50 text-purple-600" : 
                              "bg-[#1A2B4B]/5 text-[#1A2B4B]"
                            )}>
                              {req.type === 'leave' ? <CalendarOff className="w-6 h-6" /> : 
                               req.type === 'time_correction' ? <Clock className="w-6 h-6" /> : 
                               req.type === 'overtime' ? <Clock className="w-6 h-6" /> : 
                               <ArrowRightLeft className="w-6 h-6" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-black text-primary">{req.userName}</p>
                                <Badge variant="secondary" className={cn(
                                  "text-[10px] font-bold uppercase",
                                  req.status === 'approved' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                  req.status === 'rejected' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                  "bg-amber-50 text-amber-600 border-amber-100"
                                )}>
                                  {req.status}
                                </Badge>
                                {req.createdByName && req.createdBy !== req.userId && (
                                  <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-600 border-slate-200 font-semibold py-0">
                                    By Admin: {req.createdByName}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 font-medium">
                                {req.type === 'leave' ? 'Leave Request' : 
                                 req.type === 'time_correction' ? 'Actual Time Correction' : 
                                 req.type === 'overtime' ? 'Overtime Request' : 
                                 'Schedule Change'} • {formatSafeDate(req.startDate)}
                                {req.endDate && ` to ${formatSafeDate(req.endDate)}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex-1 max-w-md bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <div className="flex items-start gap-2">
                              <MessageSquare className="w-3 h-3 text-slate-400 mt-1" />
                              <p className="text-xs text-slate-600 italic">"{req.reason}"</p>
                            </div>
                            {req.type === 'schedule_change' && (
                              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-indigo-600">
                                <Clock className="w-3 h-3" />
                                Proposed: {req.newStartTime} - {req.newEndTime}
                              </div>
                            )}
                            {req.type === 'overtime' && (
                              <div className="mt-2 space-y-1">
                                <div className="flex items-center gap-2 text-[10px] font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded w-fit">
                                  <Clock className="w-3 h-3" />
                                  Total OT Requested: {req.otHours ? `${req.otHours.toFixed(1)} hrs` : 'Custom'}
                                </div>
                                {req.isPreShiftSelected && (
                                  <p className="text-[10px] text-slate-600 font-medium">
                                    • <span className="font-bold text-slate-800">Pre-Shift OT:</span> {req.preShiftOtStart} - {req.preShiftOtEnd} (Max: {req.maxPreShiftStart || '07:30'}-{req.maxPreShiftEnd || '08:00'})
                                  </p>
                                )}
                                {req.isPostShiftSelected && (
                                  <p className="text-[10px] text-slate-600 font-medium">
                                    • <span className="font-bold text-slate-800">Post-Shift OT:</span> {req.postShiftOtStart} - {req.postShiftOtEnd} (Max: {req.maxPostShiftStart || '17:00'}-{req.maxPostShiftEnd || '18:00'})
                                  </p>
                                )}
                              </div>
                            )}
                            {req.type === 'time_correction' && (
                              <div className="mt-2 space-y-1">
                                <div className="flex items-center gap-2 text-[10px] font-bold text-amber-600">
                                  <Clock className="w-3 h-3" />
                                  Correction: {req.newStartTime || '--:--'} - {req.newEndTime || '--:--'}
                                </div>
                                {req.locationName && (
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                    <MapPin className="w-3 h-3" />
                                    Location: {req.locationName}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {isManager && req.status === 'pending' && (
                            <div className="flex items-center gap-2 min-w-max">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-9 px-4 border-emerald-100 text-emerald-600 hover:bg-emerald-50 gap-2 font-bold text-xs"
                                onClick={() => handleReviewRequest(req.id, 'approved')}
                              >
                                <Check className="w-4 h-4" /> Approve
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-9 px-4 border-rose-100 text-rose-600 hover:bg-rose-50 gap-2 font-bold text-xs"
                                onClick={() => handleReviewRequest(req.id, 'rejected')}
                              >
                                <CloseIcon className="w-4 h-4" /> Reject
                              </Button>
                            </div>
                          )}

                          {(isManager || isAdmin) && req.status === 'approved' && req.type === 'time_correction' && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 px-3 border-indigo-100 text-indigo-600 hover:bg-indigo-50 gap-1.5 font-bold text-[11px]"
                              onClick={async () => {
                                await executeApprovedRequestActions(req);
                                toast.success('Attendance record re-synced successfully!');
                              }}
                            >
                              <RefreshCw className="w-3.5 h-3.5" /> Sync to Log
                            </Button>
                          )}

                          {req.reviewedBy && (
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Reviewed by</p>
                              <p className="text-xs font-bold text-primary">{req.reviewedByName}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {requests.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 border-dashed">
                      <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400 font-medium">No requests found.</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="report">
              <div className="space-y-6">
                <DateRangeQueryGuardrail
                  title="Attendance Reports Guardrail"
                  description="Specify a date range to summarize staff hours, tardiness, and absences with read cost estimation."
                  collectionName="attendance"
                  dateField="date"
                  dateFieldType="string"
                  startDate={reportStartDate}
                  endDate={reportEndDate}
                  onStartDateChange={setReportStartDate}
                  onEndDateChange={setReportEndDate}
                  activeLoadedRange={{ startDate: reportStartDate, endDate: reportEndDate }}
                  loadedCount={allLogs.filter(l => l.date >= reportStartDate && l.date <= reportEndDate).length}
                  isCurrentlyLoaded={(s, e) => s >= reportStartDate && e <= reportEndDate}
                  onApplyQuery={(start, end, count) => {
                    setReportStartDate(start);
                    setReportEndDate(end);
                    toast.success(`Applied report date range: ${start} to ${end}. Found ${count} attendance log(s).`);
                  }}
                  isCustomRangeActive={true}
                />

                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Staff Name</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Worked Hours</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Lates (Min)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Absences</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Approved Leaves</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {allUsers.map((user) => {
                        const stats = calculateStaffStats(user.id);
                        return (
                          <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-black text-sm text-primary">{user.name || user.email || user.id}</td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500 tabular-nums">
                              <Badge className="bg-[#1A2B4B]/5 text-[#1A2B4B] border-[#1A2B4B]/10 font-black">
                                {stats.totalHours} hrs
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-xs font-bold tabular-nums">
                              <span className={cn(
                                stats.lateMinutes > 0 ? "text-rose-600" : "text-emerald-600"
                              )}>
                                {stats.lateMinutes} min
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-400 tabular-nums">
                              {stats.absences > 0 ? (
                                <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-100">
                                  {stats.absences}
                                </Badge>
                              ) : '0'}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-400 tabular-nums">
                              {stats.leaves > 0 ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100">
                                  {stats.leaves}
                                </Badge>
                              ) : '0'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <div className="space-y-4">
                {personalLogs
                  .slice((personalLogsPage - 1) * personalLogsPageSize, personalLogsPage * personalLogsPageSize)
                  .map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-primary">
                          {formatSafeDate(log.date, 'MMMM dd, yyyy')}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                            <MapPin className="w-3 h-3" /> {log.locationName}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-8 pr-4">
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Time In</p>
                        <Badge variant="outline" className="bg-[#1A2B4B]/5 text-[#1A2B4B] border-[#1A2B4B]/10 font-black tabular-nums">
                          {formatSafeTime(log.timeIn, log.timeInBackup)}
                        </Badge>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Time Out</p>
                        {log.timeOut ? (
                          <Badge variant="outline" className="bg-amber-50/50 text-amber-700 border-amber-100 font-black tabular-nums">
                            {formatSafeTime(log.timeOut, log.timeOutBackup)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-50 text-rose-500 border-rose-100 font-bold italic">
                            Active
                          </Badge>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </motion.div>
                ))}
                {personalLogs.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 border-dashed">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-medium">No attendance records found.</p>
                  </div>
                ) : (
                  <DataTablePagination
                    currentPage={personalLogsPage}
                    totalPages={Math.ceil(personalLogs.length / personalLogsPageSize) || 1}
                    pageSize={personalLogsPageSize}
                    totalItems={personalLogs.length}
                    onPageChange={setPersonalLogsPage}
                    onPageSizeChange={size => {
                      setPersonalLogsPageSize(size);
                      setPersonalLogsPage(1);
                    }}
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="schedules">
              <div className="space-y-6">
                <div className="flex flex-col gap-4 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 max-w-sm">
                      <Search className="w-4 h-4 text-slate-400" />
                      <Input 
                        placeholder="Search staff schedules..." 
                        className="bg-slate-50 border-none h-10 text-xs text-primary" 
                        value={scheduleSearch}
                        onChange={(e) => setScheduleSearch(e.target.value)}
                      />
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-slate-400 font-bold uppercase">From</Label>
                        <Input 
                          type="date"
                          className="h-10 text-xs w-36 border-slate-200 bg-white text-primary"
                          value={scheduleDateRange.start}
                          onChange={(e) => setScheduleDateRange(prev => ({ ...prev, start: e.target.value }))}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-slate-400 font-bold uppercase">To</Label>
                        <Input 
                          type="date"
                          className="h-10 text-xs w-36 border-slate-200 bg-white text-primary"
                          value={scheduleDateRange.end}
                          onChange={(e) => setScheduleDateRange(prev => ({ ...prev, end: e.target.value }))}
                        />
                      </div>
                      {(scheduleDateRange.start || scheduleDateRange.end) && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-[10px] font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                          onClick={() => setScheduleDateRange({ start: '', end: '' })}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-slate-100">
                    <div className="flex flex-col gap-2 w-full md:w-auto">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sort Priority:</span>
                        {sortRules.map((rule, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 bg-[#1A2B4B]/5 text-[#1A2B4B] px-3 py-1.5 rounded-xl border border-[#1A2B4B]/10 text-[11px] font-bold">
                            <span className="capitalize">{rule.field === 'startTime' ? 'Shift Start' : rule.field === 'name' ? 'Staff Name' : rule.field}</span>
                            <button
                              type="button"
                              className="text-[#D4AF37] hover:text-[#1A2B4B] transition-colors px-1 text-xs font-black"
                              onClick={() => {
                                const updated = [...sortRules];
                                updated[idx].direction = updated[idx].direction === 'asc' ? 'desc' : 'asc';
                                setSortRules(updated);
                              }}
                              title="Toggle direction"
                            >
                              {rule.direction === 'asc' ? '↑' : '↓'}
                            </button>
                            {sortRules.length > 1 && (
                              <button
                                type="button"
                                className="text-[#1A2B4B]/60 hover:text-rose-600 transition-colors font-normal pl-1 ml-1 border-l border-[#1A2B4B]/20"
                                onClick={() => {
                                  setSortRules(sortRules.filter((_, i) => i !== idx));
                                }}
                              >
                                <CloseIcon className="w-3 h-3 inline" />
                              </button>
                            )}
                          </div>
                        ))}
                        
                        {sortRules.length < 3 && (
                          <Select
                            value=""
                            onValueChange={(val) => {
                              if (val) {
                                setSortRules([...sortRules, { field: val as any, direction: 'asc' }]);
                              }
                            }}
                          >
                            <SelectTrigger className="w-[120px] h-8 text-[11px] font-bold bg-slate-50 border-none rounded-xl text-primary">
                              <Plus className="w-3 h-3 mr-1" /> Add Sort
                            </SelectTrigger>
                            <SelectContent>
                              {['date', 'name', 'startTime']
                                .filter(field => !sortRules.some(r => r.field === field))
                                .map(field => (
                                  <SelectItem key={field} value={field}>
                                    {field === 'date' ? 'Date' : field === 'name' ? 'Staff Name' : 'Shift Start'}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>

                    {(isAdmin || isManager) && (
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline"
                          className="border-[#1A2B4B]/20 text-[#1A2B4B] hover:bg-[#1A2B4B]/5 rounded-xl gap-2 font-bold text-xs h-10"
                          onClick={() => setIsBulkDialogOpen(true)}
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                          Bulk Populate
                        </Button>
                        <Button 
                          className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl gap-2 font-bold text-xs h-10 shadow-sm"
                          onClick={() => {
                            setEditingSchedule({ date: format(new Date(), 'yyyy-MM-dd') });
                            setIsScheduleDialogOpen(true);
                          }}
                        >
                          <Plus className="w-4 h-4" />
                          Add Single Date
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Staff</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Shift</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        {(isAdmin || isManager) && <th className="px-6 py-4 text-right"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredSchedules
                        .slice((schedulesPage - 1) * schedulesPageSize, schedulesPage * schedulesPageSize)
                        .map((sch) => (
                        <tr key={sch.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-primary">
                              {formatSafeDate(sch.date, 'MMM dd, yyyy')}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                              {formatSafeDate(sch.date, 'EEEE')}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-600">
                            {sch.userName || allUsers.find(u => u.id === sch.userId)?.name || sch.userId}
                          </td>
                          <td className="px-6 py-4 text-xs font-black text-indigo-600 tabular-nums">
                            {sch.isDayOff ? '--:--' : `${sch.startTime} - ${sch.endTime}`}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="secondary" className={cn(
                              "text-[10px] font-bold uppercase",
                              sch.isDayOff ? "bg-slate-100 text-slate-400" : "bg-emerald-50 text-emerald-600"
                            )}>
                              {sch.isDayOff ? 'Day Off' : 'Working'}
                            </Badge>
                          </td>
                          {(isAdmin || isManager) && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                                  onClick={() => {
                                    setEditingSchedule(sch);
                                    setIsScheduleDialogOpen(true);
                                  }}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-rose-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSchedule(sch.id);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <DataTablePagination
                    currentPage={schedulesPage}
                    totalPages={Math.ceil(filteredSchedules.length / schedulesPageSize) || 1}
                    pageSize={schedulesPageSize}
                    totalItems={filteredSchedules.length}
                    onPageChange={setSchedulesPage}
                    onPageSizeChange={size => {
                      setSchedulesPageSize(size);
                      setSchedulesPage(1);
                    }}
                  />
                  {schedules.length === 0 && (
                    <div className="text-center py-20 bg-white">
                      <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400 font-medium">No schedules generated yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="compare">
              <div className="space-y-4">
                <DateRangeQueryGuardrail
                  title="Daily Comparison Query Guardrail"
                  description="Specify the comparison date to audit scheduled vs actual attendance hours."
                  collectionName="attendance"
                  dateField="date"
                  dateFieldType="string"
                  startDate={compareDateFilter}
                  endDate={compareDateFilter}
                  onStartDateChange={(newStart) => setCompareDateFilter(newStart)}
                  onEndDateChange={(newEnd) => setCompareDateFilter(newEnd)}
                  activeLoadedRange={{ startDate: compareDateFilter, endDate: compareDateFilter }}
                  loadedCount={allLogs.filter(l => l.date === compareDateFilter).length}
                  isCurrentlyLoaded={(s, e) => s === compareDateFilter && e === compareDateFilter}
                  onApplyQuery={(start, end, count) => {
                    setCompareDateFilter(start);
                    toast.success(`Comparing scheduled vs actual records for ${start}. Found ${count} attendance log(s).`);
                  }}
                  isCustomRangeActive={true}
                />

                <Card className="border-none shadow-xl overflow-hidden rounded-3xl">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-base font-bold">Staff Filter & Inspection</CardTitle>
                        <CardDescription className="text-xs">
                          Evaluating scheduled vs actual for {compareDateFilter ? formatSafeDate(compareDateFilter, 'MMMM dd, yyyy') : 'selected date'}.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-56 sm:w-64">
                          <Select value={compareUserFilter} onValueChange={setCompareUserFilter}>
                            <SelectTrigger className="w-full h-9 text-xs bg-white border-slate-200/80 rounded-xl focus:ring-1 focus:ring-[#1A2B4B]">
                              <SelectValue placeholder="All Staff & Managers" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Staff & Managers</SelectItem>
                              {staffAndManagers.map(u => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name || u.email || u.id} ({u.role === 'manager' ? 'Manager' : 'Staff'})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Staff Name</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Scheduled In</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actual In</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Scheduled Out</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actual Out</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            {(isAdmin || isManager) && (
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredCompareUsers.length === 0 ? (
                            <tr>
                              <td colSpan={isAdmin || isManager ? 7 : 6} className="text-center py-12 text-slate-400 italic text-sm">
                                No matching staff members found.
                              </td>
                            </tr>
                          ) : (
                            filteredCompareUsers.map((user) => {
                              const targetDateStr = compareDateFilter || format(new Date(), 'yyyy-MM-dd');
                              const schedule = getDateSchedule(user.id, targetDateStr);
                              const attendance = findUserLogForDate(allLogs, user, targetDateStr);

                              const actualInStr = extractHHMM(attendance?.timeIn, attendance?.timeInBackup);
                              const actualOutStr = extractHHMM(attendance?.timeOut, attendance?.timeOutBackup);

                              const isInLate = schedule && !schedule.isDayOff && actualInStr && (
                                actualInStr > (schedule.startTime || '00:00')
                              );

                              return (
                                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 font-bold text-sm text-primary">{user.name || user.email || user.id}</td>
                                  <td className="px-6 py-4 text-xs font-medium text-slate-400 tabular-nums">
                                    {schedule?.isDayOff ? 'DAY OFF' : formatDisplayTime(schedule?.startTime)}
                                  </td>
                                  <td className="px-6 py-4 text-xs font-black text-primary tabular-nums">
                                    {formatDisplayTime(actualInStr)}
                                  </td>
                                  <td className="px-6 py-4 text-xs font-medium text-slate-400 tabular-nums">
                                    {schedule?.isDayOff ? 'DAY OFF' : formatDisplayTime(schedule?.endTime)}
                                  </td>
                                  <td className="px-6 py-4 text-xs font-black text-primary tabular-nums">
                                    {formatDisplayTime(actualOutStr)}
                                  </td>
                                  <td className="px-6 py-4">
                                    {schedule?.isDayOff ? (
                                      <Badge variant="outline" className="bg-slate-50 text-slate-400 border-slate-100 font-bold uppercase text-[9px] tracking-widest">Off</Badge>
                                    ) : !attendance ? (
                                      <Badge variant="outline" className="bg-rose-50 text-rose-500 border-rose-100 font-bold uppercase text-[9px] tracking-widest">Absent</Badge>
                                    ) : isInLate ? (
                                      <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-100 font-bold uppercase text-[9px] tracking-widest">Late Arrival</Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold uppercase text-[9px] tracking-widest">On Time</Badge>
                                    )}
                                  </td>
                                  {(isAdmin || isManager) && (
                                    <td className="px-6 py-4 text-right">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 px-2.5 text-xs font-bold text-[#1A2B4B] hover:bg-slate-100 gap-1 rounded-lg"
                                        onClick={() => setEditingLog({
                                          userId: user.id,
                                          userName: user.name || user.email || user.id,
                                          date: targetDateStr,
                                          timeIn: actualInStr || schedule?.startTime || '08:00',
                                          timeOut: actualOutStr || schedule?.endTime || '17:00'
                                        })}
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                        Edit Log
                                      </Button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="payslips">
              {!isAdmin ? (
                <div className="bg-white border border-slate-100 shadow-xl rounded-3xl p-8 text-center space-y-4">
                  <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Access Denied</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Only administrators are authorized to access, configure, and generate staff payslips. Please contact your administrator if you believe this is an error.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Print styles injected locally */}
                  <style>{`
                    @media print {
                      /* Force background colors and graphical colors to render exactly */
                      * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                      }
                      /* Hide any non-print elements */
                      .no-print, header, footer, nav, aside {
                        display: none !important;
                      }
                      /* Ensure all parent containers have visible overflow & height auto */
                      html, body, #root, main, [role="main"], .min-h-screen, div {
                        overflow: visible !important;
                        height: auto !important;
                        min-height: auto !important;
                        max-height: none !important;
                        position: static !important;
                      }
                      body {
                        background: #f8fafc !important;
                        color: #0f172a !important;
                      }
                      body * {
                        visibility: hidden !important;
                      }
                      #printable-payslip-area, #printable-payslip-area * {
                        visibility: visible !important;
                      }
                      #printable-payslip-area {
                        position: absolute !important;
                        left: 0 !important;
                        right: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        max-width: 800px !important;
                        margin: 0 auto !important;
                        background: white !important;
                        border: 1px solid rgba(226, 232, 240, 0.8) !important;
                        border-radius: 24px !important;
                        box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1) !important;
                        overflow: hidden !important;
                      }
                    }
                  `}</style>

                {/* Configuration controls card */}
                <div className="space-y-4 no-print">
                  <DateRangeQueryGuardrail
                    title="Payslip Date Range & Query Guardrail"
                    description="Select the payroll evaluation window to calculate total hours, overtime, tardiness, and net pay."
                    collectionName="attendance"
                    dateField="date"
                    dateFieldType="string"
                    startDate={payslipStartDate}
                    endDate={payslipEndDate}
                    onStartDateChange={setPayslipStartDate}
                    onEndDateChange={setPayslipEndDate}
                    activeLoadedRange={{ startDate: payslipStartDate, endDate: payslipEndDate }}
                    loadedCount={allLogs.filter(l => l.date >= payslipStartDate && l.date <= payslipEndDate).length}
                    isCurrentlyLoaded={(s, e) => s >= payslipStartDate && e <= payslipEndDate}
                    onApplyQuery={(start, end, count) => {
                      setPayslipStartDate(start);
                      setPayslipEndDate(end);
                      toast.success(`Applied payslip period: ${start} to ${end}. Loaded ${count} attendance log(s).`);
                    }}
                    isCustomRangeActive={true}
                  />

                  <Card className="border-none shadow-xl overflow-hidden rounded-3xl">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <CardTitle className="text-base font-bold">Staff Member Selection</CardTitle>
                          <CardDescription className="text-xs">Choose the employee whose payslip you want to review or export.</CardDescription>
                        </div>
                        <div className="w-full sm:w-72">
                          <Select value={selectedPayslipUser} onValueChange={setSelectedPayslipUser}>
                            <SelectTrigger className="w-full h-10 text-xs bg-white border-slate-200 shadow-xs">
                              <SelectValue placeholder="Select Staff Member...">
                                {selectedPayslipUser ? (staffAndManagers.find(u => u.id === selectedPayslipUser)?.name || staffAndManagers.find(u => u.id === selectedPayslipUser)?.email || selectedPayslipUser) : undefined}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {staffAndManagers.map(u => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name || u.email || u.id} ({u.role === 'manager' ? 'Manager' : 'Staff'})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Side: Manipulation controls (Rates, Incentives, Deductions) */}
                  <div className="lg:col-span-4 space-y-6 no-print">
                    <Card className="border-none shadow-xl rounded-3xl">
                      <CardHeader className="border-b border-slate-100/80 bg-slate-50/50">
                        <div className="flex items-center gap-2">
                          <Coins className="w-4 h-4 text-indigo-500" />
                          <CardTitle className="text-sm font-bold">Compensation & Adjustments</CardTitle>
                        </div>
                        <CardDescription>Customize rates, overtime parameters, and extra pay.</CardDescription>
                      </CardHeader>
                      <CardContent className="p-6 space-y-4">
                        {/* Regular hourly rate */}
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-slate-600">Regular Hourly Rate ({settings.currency})</Label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">{settings.currency}</span>
                            <Input 
                              type="number" 
                              min="0"
                              step="0.01"
                              className="pl-7 h-9 text-xs"
                              value={payslipHourlyRate}
                              onChange={(e) => setPayslipHourlyRate(e.target.value)}
                            />
                          </div>
                        </div>

                        {/* Overtime rate */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-slate-600">Overtime Hourly Rate ({settings.currency})</Label>
                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-amber-200/50">
                              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
                              Locked to Regular Rate
                            </span>
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">{settings.currency}</span>
                            <Input 
                              type="number" 
                              min="0"
                              step="0.01"
                              className="pl-7 h-9 text-xs bg-slate-50 cursor-not-allowed font-medium text-slate-500 border-dashed"
                              value={payslipOtRate}
                              readOnly
                              disabled
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium">Applied to clocked hours exceeding scheduled shift length (automatically matches regular rate).</span>
                        </div>

                        {/* Incentives */}
                        <div className="border-t border-slate-100 pt-4 space-y-4">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600">Add Incentives ({settings.currency})</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">{settings.currency}</span>
                              <Input 
                                type="number" 
                                min="0"
                                step="0.01"
                                className="pl-7 h-9 text-xs"
                                value={payslipIncentiveAmount}
                                onChange={(e) => setPayslipIncentiveAmount(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600">Incentive Reason</Label>
                            <Input 
                              placeholder="e.g. Bonus, Overtime Bonus, Travel Allowance"
                              className="h-9 text-xs"
                              value={payslipIncentiveReason}
                              onChange={(e) => setPayslipIncentiveReason(e.target.value)}
                            />
                          </div>
                        </div>

                        {/* Deductions */}
                        <div className="border-t border-slate-100 pt-4 space-y-4">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600">Manual Deduction ({settings.currency})</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">{settings.currency}</span>
                              <Input 
                                type="number" 
                                min="0"
                                step="0.01"
                                className="pl-7 h-9 text-xs"
                                value={payslipDeductionAmount}
                                onChange={(e) => setPayslipDeductionAmount(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600">Deduction Reason</Label>
                            <Input 
                              placeholder="e.g. Uniform fee, equipment damage"
                              className="h-9 text-xs"
                              value={payslipDeductionReason}
                              onChange={(e) => setPayslipDeductionReason(e.target.value)}
                            />
                          </div>
                        </div>

                        {/* Save adjustments */}
                        <Button 
                          className="w-full mt-2 h-10 bg-[#1A2B4B] hover:bg-[#2C3E50] text-white font-bold text-xs uppercase tracking-wide gap-2 rounded-xl"
                          disabled={isSavingRates || !selectedPayslipUser}
                          onClick={handleSaveRates}
                        >
                          <Save className="w-3.5 h-3.5" />
                          {isSavingRates ? 'Saving Settings...' : 'Save Rates & settings'}
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Rule Alert Card */}
                    <Card className="border-none shadow-md bg-amber-50/50 border border-amber-100 rounded-3xl">
                      <CardContent className="p-4 space-y-2 text-xs text-amber-800">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          Late Deduction Rule Active
                        </div>
                        <p className="leading-relaxed">
                          Staff arriving <strong>5 minutes or more</strong> past their scheduled start time are penalized by <strong>1 hour deduction</strong> from their payable regular hours for that day.
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Right Side: Payslip Printable Statement */}
                  <div className="lg:col-span-8 space-y-6">
                     {/* Payslip view */}
                    <Card id="printable-payslip-area" className="border border-slate-200/80 shadow-xl overflow-hidden rounded-3xl bg-white">
                      <CardContent className="p-8 space-y-8">
                        {/* Header of Payslip */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-6 gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-[#1A2B4B] flex items-center justify-center text-white font-black italic">S</div>
                              <span className="font-black tracking-wider text-slate-800 uppercase">SALARY PAYMENT SLIP</span>
                            </div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-1">Official Statement of Earnings</p>
                          </div>
                          <div className="text-left md:text-right">
                            <span className="text-xs font-bold text-[#D4AF37] bg-[#D4AF37]/10 px-2.5 py-1 rounded-full uppercase tracking-wider text-[10px] border border-[#D4AF37]/20">
                              CONFIDENTIAL
                            </span>
                            <p className="text-xs text-slate-400 font-semibold mt-1">
                              Period: {isValid(new Date(payslipStartDate)) ? format(new Date(payslipStartDate), 'MMM dd, yyyy') : ''} – {isValid(new Date(payslipEndDate)) ? format(new Date(payslipEndDate), 'MMM dd, yyyy') : ''}
                            </p>
                          </div>
                        </div>

                        {/* Employee details row */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                          <div>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Employee Name</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">
                              {staffAndManagers.find(u => u.id === selectedPayslipUser)?.name || staffAndManagers.find(u => u.id === selectedPayslipUser)?.email || selectedPayslipUser || 'Unknown'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Designation / Role</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5 capitalize">
                              {staffAndManagers.find(u => u.id === selectedPayslipUser)?.role || 'Staff'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Date of Statement</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{format(new Date(), 'MMM dd, yyyy')}</p>
                          </div>
                        </div>

                        {/* 1. Daily Work & Earnings Breakdown inside the printable payslip (MOVED TO TOP) */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1">1. Daily Work & Earnings Breakdown</h4>
                          <div className="overflow-hidden border border-slate-100 rounded-2xl">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50/70 border-b border-slate-100">
                                  <th className="py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                                  <th className="py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                                  <th className="py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-right">Regular Hrs</th>
                                  <th className="py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-right">OT Hrs</th>
                                  <th className="py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-right">Late Penalty</th>
                                  <th className="py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-right">Daily Earnings</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {payslipData.days.map(day => {
                                  const regularPay = day.regHrs * (parseFloat(payslipHourlyRate) || 0);
                                  const otPay = day.otHrs * (parseFloat(payslipOtRate) || 0);
                                  const dailyEarned = regularPay + otPay;
                                  return (
                                    <tr key={day.dateStr} className="text-xs hover:bg-slate-50/50">
                                      <td className="py-2 px-4 font-semibold text-slate-700">{day.dateFormatted}</td>
                                      <td className="py-2 px-4 text-center">
                                        {day.status === 'worked' ? (
                                          <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">WORKED</span>
                                        ) : day.status === 'leave' ? (
                                          <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">LEAVE</span>
                                        ) : day.status === 'off' ? (
                                          <span className="text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">OFF</span>
                                        ) : day.status === 'absent' ? (
                                          <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">ABSENT</span>
                                        ) : (
                                          <span className="text-slate-300">—</span>
                                        )}
                                      </td>
                                      <td className="py-2 px-4 text-right font-medium text-slate-600">
                                        {day.regHrs > 0 ? `${day.regHrs.toFixed(1)} hrs` : '—'}
                                      </td>
                                      <td className="py-2 px-4 text-right font-medium text-indigo-600">
                                        {day.otHrs > 0 ? `${day.otHrs.toFixed(1)} hrs` : '—'}
                                      </td>
                                      <td className="py-2 px-4 text-right">
                                        {day.lateDeductionHrs > 0 ? (
                                          <span className="text-rose-600 font-black text-[10px]">-{(day.lateDeductionHrs % 1 === 0 ? day.lateDeductionHrs : day.lateDeductionHrs.toFixed(2))} hr</span>
                                        ) : '—'}
                                      </td>
                                      <td className="py-2 px-4 text-right font-bold text-slate-800">
                                        {dailyEarned > 0 ? (
                                          `${settings.currency}${dailyEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        ) : (
                                          `${settings.currency}0.00`
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* 2. Breakdown grids: Earnings vs Deductions */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                          {/* Earnings side */}
                          <div className="space-y-4">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">2.1 Earnings & Income</h4>
                            <div className="space-y-2.5">
                              {/* Regular hours */}
                              <div className="flex justify-between items-center text-xs text-slate-600">
                                <div className="space-y-0.5">
                                  <p className="font-semibold">Regular Hours Worked</p>
                                  <p className="text-[10px] text-slate-400">({payslipData.totalRegularHours.toFixed(1)} hrs @ {settings.currency}{parseFloat(payslipHourlyRate).toFixed(2)}/hr)</p>
                                </div>
                                <span className="font-bold text-slate-800">
                                  {settings.currency}{(payslipData.totalRegularHours * (parseFloat(payslipHourlyRate) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>

                              {/* Overtime hours */}
                              <div className="flex justify-between items-center text-xs text-slate-600 border-t border-slate-50 pt-2.5">
                                <div className="space-y-0.5">
                                  <p className="font-semibold">Overtime Hours</p>
                                  <p className="text-[10px] text-slate-400">({payslipData.totalOtHours.toFixed(1)} hrs @ {settings.currency}{parseFloat(payslipOtRate).toFixed(2)}/hr)</p>
                                </div>
                                <span className="font-bold text-slate-800">
                                  {settings.currency}{(payslipData.totalOtHours * (parseFloat(payslipOtRate) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>

                              {/* Incentives */}
                              {(parseFloat(payslipIncentiveAmount) || 0) > 0 && (
                                <div className="flex justify-between items-center text-xs text-slate-600 border-t border-slate-50 pt-2.5">
                                  <div className="space-y-0.5">
                                    <p className="font-semibold">Incentives / Allowance</p>
                                    {payslipIncentiveReason && <p className="text-[10px] text-slate-400">({payslipIncentiveReason})</p>}
                                  </div>
                                  <span className="font-bold text-emerald-600">
                                    +{settings.currency}{parseFloat(payslipIncentiveAmount).toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Deductions side */}
                          <div className="space-y-4">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">2.2 Deductions</h4>
                            <div className="space-y-2.5">
                              {/* Late deductions */}
                              <div className="flex justify-between items-center text-xs text-slate-600">
                                <div className="space-y-0.5">
                                  <p className="font-semibold">Late Penalties (Tardiness &gt; 5m)</p>
                                  <p className="text-[10px] text-rose-500 font-medium">({payslipData.lateDeductionsCount} instance{payslipData.lateDeductionsCount !== 1 ? 's' : ''} = {payslipData.totalLateDeductedHours % 1 === 0 ? payslipData.totalLateDeductedHours : payslipData.totalLateDeductedHours.toFixed(2)} hr{payslipData.totalLateDeductedHours !== 1 ? 's' : ''} deducted)</p>
                                </div>
                                <span className="font-bold text-rose-600">
                                  -{settings.currency}{(payslipData.totalLateDeductedHours * (parseFloat(payslipHourlyRate) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>

                              {/* Manual deduction */}
                              {(parseFloat(payslipDeductionAmount) || 0) > 0 && (
                                <div className="flex justify-between items-center text-xs text-slate-600 border-t border-slate-50 pt-2.5">
                                  <div className="space-y-0.5">
                                    <p className="font-semibold">Other Adjustments</p>
                                    {payslipDeductionReason && <p className="text-[10px] text-slate-400">({payslipDeductionReason})</p>}
                                  </div>
                                  <span className="font-bold text-rose-600">
                                    -{settings.currency}{parseFloat(payslipDeductionAmount).toFixed(2)}
                                  </span>
                                </div>
                              )}

                              {(!payslipData.lateDeductionsCount && !(parseFloat(payslipDeductionAmount) || 0)) && (
                                <div className="text-xs text-slate-400 italic py-2">
                                  No deductions applied to this pay period.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 3. Pay summary totals */}
                        <div className="space-y-3 pt-2">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">3. Payment Totals Summary</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-slate-100 p-5 rounded-2xl bg-slate-50/30">
                            <div className="text-center bg-slate-50 p-4 rounded-xl border border-slate-100/50">
                              <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Gross Earnings</span>
                              <p className="text-lg font-extrabold text-slate-800 mt-0.5">
                                {settings.currency}{(
                                  ((payslipData.totalRegularHours + payslipData.totalLateDeductedHours) * (parseFloat(payslipHourlyRate) || 0)) + 
                                  (payslipData.totalOtHours * (parseFloat(payslipOtRate) || 0)) + 
                                  (parseFloat(payslipIncentiveAmount) || 0)
                                ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>

                            <div className="text-center bg-slate-50 p-4 rounded-xl border border-slate-100/50">
                              <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Total Deductions</span>
                              <p className="text-lg font-extrabold text-rose-600 mt-0.5">
                                {settings.currency}{(
                                  (payslipData.totalLateDeductedHours * (parseFloat(payslipHourlyRate) || 0)) +
                                  (parseFloat(payslipDeductionAmount) || 0)
                                ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>

                            <div className="text-center bg-[#1A2B4B]/5 border border-[#1A2B4B]/10 p-4 rounded-xl">
                              <span className="text-[10px] text-[#1A2B4B] font-black uppercase tracking-wider">Net Payable Pay</span>
                              <p className="text-lg font-black text-[#1A2B4B] mt-0.5">
                                {settings.currency}{(
                                  (payslipData.totalRegularHours * (parseFloat(payslipHourlyRate) || 0)) + 
                                  (payslipData.totalOtHours * (parseFloat(payslipOtRate) || 0)) + 
                                  (parseFloat(payslipIncentiveAmount) || 0) -
                                  (parseFloat(payslipDeductionAmount) || 0)
                                ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Bottom notes and signatures */}
                        <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pt-4 text-xs border-t border-slate-100">
                          <div className="space-y-1">
                            <p className="font-bold text-slate-700">Remarks & Note:</p>
                            <p className="text-slate-400 text-[11px] leading-relaxed max-w-sm">
                              This statement was generated electronically according to the verified schedule and clock logs. Hours are rounded and calculations follow company late policy guidelines.
                            </p>
                          </div>
                          <div className="text-center space-y-4 pt-4 sm:pt-0">
                            <div className="h-0.5 w-40 bg-slate-200" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Signature</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Print controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <p className="text-[11px] text-slate-400 leading-relaxed max-w-md">
                        <strong>Printing Tip:</strong> For the absolute highest precision and best formatting on paper or PDF, click the print button below to print. Be sure to enable <strong>"Background graphics"</strong> in your browser print settings.
                      </p>
                      <Button 
                        variant="default" 
                        className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl font-bold text-xs uppercase tracking-wide gap-2 h-10 px-5 shrink-0"
                        onClick={() => {
                          window.focus();
                          window.print();
                        }}
                      >
                        <Printer className="w-4 h-4 text-white" />
                        Print / Save as PDF
                      </Button>
                    </div>

                    {/* Attendance audit detail table */}
                    <Card className="border-none shadow-xl overflow-hidden rounded-3xl no-print">
                      <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                        <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-500">Daily Attendance Audit Log</CardTitle>
                        <CardDescription>Verify raw calculations for regular and overtime hours.</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Date</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Status</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Schedule Shift</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Clocked Period</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Reg Pay Hrs</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">OT Hrs</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Late Penalty</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Daily Earnings</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {payslipData.days.map(day => {
                                const regularPay = day.regHrs * (parseFloat(payslipHourlyRate) || 0);
                                const otPay = day.otHrs * (parseFloat(payslipOtRate) || 0);
                                const dailyEarned = regularPay + otPay;
                                return (
                                  <tr key={day.dateStr} className="hover:bg-slate-50/50 transition-colors text-xs">
                                    <td className="px-5 py-3.5 font-semibold text-slate-700">{day.dateFormatted}</td>
                                    <td className="px-5 py-3.5 text-center">
                                      {day.status === 'worked' ? (
                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wide">WORKED</span>
                                      ) : day.status === 'leave' ? (
                                        <span className="bg-blue-50 text-blue-700 border border-blue-100 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wide">LEAVE</span>
                                      ) : day.status === 'off' ? (
                                        <span className="bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wide">OFF</span>
                                      ) : day.status === 'absent' ? (
                                        <span className="bg-rose-50 text-rose-700 border border-rose-100 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wide">ABSENT</span>
                                      ) : (
                                        <span className="text-slate-300 font-medium">—</span>
                                      )}
                                    </td>
                                    <td className="px-5 py-3.5 text-slate-500 font-medium">
                                      {day.scheduleInStr ? `${day.scheduleInStr} - ${day.scheduleOutStr} (${day.scheduledHrs.toFixed(1)}h)` : '—'}
                                    </td>
                                    <td className="px-5 py-3.5 text-slate-700 font-bold">
                                      {day.timeInStr ? `${day.timeInStr} - ${day.timeOutStr || '??'} (${day.actualHrs.toFixed(1)}h)` : '—'}
                                    </td>
                                    <td className="px-5 py-3.5 text-right font-black text-slate-800">
                                      {day.regHrs > 0 ? `${day.regHrs.toFixed(1)} hr` : '—'}
                                    </td>
                                    <td className="px-5 py-3.5 text-right font-bold text-indigo-600">
                                      {day.otHrs > 0 ? `${day.otHrs.toFixed(1)} hr` : '—'}
                                    </td>
                                    <td className="px-5 py-3.5">
                                      {day.lateDeductionHrs > 0 ? (
                                        <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-100 text-[10px] font-bold">
                                          Late {day.lateMins}m (-{(day.lateDeductionHrs % 1 === 0 ? day.lateDeductionHrs : day.lateDeductionHrs.toFixed(2))}h)
                                        </Badge>
                                      ) : day.lateMins > 0 ? (
                                        <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-100 text-[10px] font-bold">
                                          Late {day.lateMins}m (Grace)
                                        </Badge>
                                      ) : '—'}
                                    </td>
                                    <td className="px-5 py-3.5 text-right font-bold text-slate-800">
                                      {dailyEarned > 0 ? (
                                        `${settings.currency}${dailyEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      ) : (
                                        `${settings.currency}0.00`
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Request Dialog */}
      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
          <div className="bg-gradient-to-r from-[#1A2B4B] to-[#2C3E50] p-8 text-white border-b-2 border-[#D4AF37]/30">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black italic">Submit Request</DialogTitle>
              <DialogDescription className="text-white/60 font-medium pt-2">
                Apply for leave, propose a schedule change, or request actual clock in/out correction.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="p-8 space-y-6 bg-white">
            {(isAdmin || isManager) && (
              <div className="space-y-3 bg-amber-50/70 p-4 rounded-2xl border border-amber-200/80">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Post On Behalf Of Staff</Label>
                  <Select 
                    value={newRequest.userId || profile?.id || ''} 
                    onValueChange={(val) => {
                      const selectedUser = allUsers.find(u => u.id === val);
                      setNewRequest(prev => ({ 
                        ...prev, 
                        userId: val,
                        userName: selectedUser?.name || selectedUser?.email || ''
                      }));
                    }}
                  >
                    <SelectTrigger className="bg-white border border-amber-200 h-11 rounded-xl text-xs font-bold text-slate-800 shadow-sm">
                      <SelectValue placeholder="Select Staff Member" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {allUsers.map(u => (
                        <SelectItem key={u.id} value={u.id} className="font-semibold text-xs">
                          {u.name || u.email} ({u.role || 'staff'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center justify-between pt-2 border-t border-amber-200/60">
                  <span className="text-[11px] font-bold text-amber-900">Auto-approve immediately</span>
                  <input 
                    type="checkbox"
                    className="rounded border-amber-300 text-[#1A2B4B] focus:ring-[#1A2B4B] w-4 h-4 cursor-pointer"
                    checked={newRequest.autoApprove !== false}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, autoApprove: e.target.checked }))}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">Request Type</Label>
                <Select 
                  value={newRequest.type} 
                  onValueChange={(val) => setNewRequest(prev => ({ ...prev, type: val as any }))}
                >
                  <SelectTrigger className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leave">Leave of Absence</SelectItem>
                    <SelectItem value="schedule_change">Schedule Change</SelectItem>
                    <SelectItem value="time_correction">Actual Time IN/OUT Change</SelectItem>
                    <SelectItem value="overtime">Overtime Request (Pre/Post Shift)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">Effective Date</Label>
                <Input 
                  type="date" 
                  className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                  value={newRequest.startDate}
                  onChange={(e) => setNewRequest(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
            </div>

            {(newRequest.type === 'leave' || newRequest.type === 'schedule_change' || newRequest.type === 'time_correction') && (
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">End Date (optional for multi-day)</Label>
                <Input 
                  type="date" 
                  className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                  value={newRequest.endDate || ''}
                  onChange={(e) => setNewRequest(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            )}

            {newRequest.type === 'schedule_change' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">New Start Time</Label>
                  <Input 
                    type="time" 
                    className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                    value={newRequest.newStartTime || ''}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, newStartTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">New End Time</Label>
                  <Input 
                    type="time" 
                    className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                    value={newRequest.newEndTime || ''}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, newEndTime: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {newRequest.type === 'time_correction' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Correct Actual IN</Label>
                    <Input 
                      type="time" 
                      className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                      value={newRequest.newStartTime || ''}
                      onChange={(e) => setNewRequest(prev => ({ ...prev, newStartTime: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Correct Actual OUT</Label>
                    <Input 
                      type="time" 
                      className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                      value={newRequest.newEndTime || ''}
                      onChange={(e) => setNewRequest(prev => ({ ...prev, newEndTime: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Correction Location</Label>
                  <Select 
                    value={newRequest.locationId || (locations.filter(l => l.id !== 'all')[0]?.id || '')} 
                    onValueChange={(val) => {
                      const loc = locations.find(l => l.id === val);
                      setNewRequest(prev => ({ 
                        ...prev, 
                        locationId: val, 
                        locationName: loc?.name || '' 
                      }));
                    }}
                  >
                    <SelectTrigger className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold">
                      <SelectValue placeholder="Select Location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.filter(l => l.id !== 'all').map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {newRequest.type === 'overtime' && (
              <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#1A2B4B]">Overtime Hours Options</h4>
                  <span className="text-[10px] font-bold text-slate-400">Based on Schedule & Actual Logins</span>
                </div>

                {/* Schedule vs Actual Logins Info Card */}
                <div className="grid grid-cols-2 gap-2 p-3 bg-white rounded-xl border border-slate-200/80 text-xs">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Scheduled Shift</span>
                    <span className="font-bold text-slate-800">
                      {newRequest.schedStart && newRequest.schedEnd ? `${newRequest.schedStart} - ${newRequest.schedEnd}` : '08:00 - 17:00'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Actual Attendance</span>
                    <span className="font-bold text-[#1A2B4B]">
                      {newRequest.clockInStr ? newRequest.clockInStr : 'No In'} - {newRequest.clockOutStr ? newRequest.clockOutStr : 'No Out'}
                    </span>
                  </div>
                </div>

                {/* Pre-Shift OT Section */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-[#1A2B4B] focus:ring-[#1A2B4B] w-4 h-4 cursor-pointer"
                        checked={!!newRequest.isPreShiftSelected}
                        disabled={!newRequest.maxPreShiftStart}
                        onChange={(e) => setNewRequest(prev => ({ ...prev, isPreShiftSelected: e.target.checked }))}
                      />
                      <span className={cn("text-xs font-black", !newRequest.maxPreShiftStart ? "text-slate-400" : "text-slate-800")}>
                        Pre-Shift Overtime
                      </span>
                    </label>
                    {newRequest.maxPreShiftStart ? (
                      <span className="text-[10px] font-bold text-[#1A2B4B] bg-[#1A2B4B]/10 px-2 py-0.5 rounded-full">
                        Eligible: {newRequest.maxPreShiftStart} - {newRequest.maxPreShiftEnd}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        Not Applicable
                      </span>
                    )}
                  </div>

                  {newRequest.isPreShiftSelected && newRequest.maxPreShiftStart && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[9px] font-black uppercase text-slate-400">OT Start Time</Label>
                          <Input 
                            type="time" 
                            className="bg-slate-50 border border-slate-200 h-10 rounded-lg text-xs font-bold"
                            value={newRequest.preShiftOtStart || ''}
                            onChange={(e) => setNewRequest(prev => ({ ...prev, preShiftOtStart: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label className="text-[9px] font-black uppercase text-slate-400">OT End Time</Label>
                          <Input 
                            type="time" 
                            className="bg-slate-50 border border-slate-200 h-10 rounded-lg text-xs font-bold"
                            value={newRequest.preShiftOtEnd || ''}
                            onChange={(e) => setNewRequest(prev => ({ ...prev, preShiftOtEnd: e.target.value }))}
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-amber-700 bg-amber-50 p-2 rounded-lg font-medium">
                        Bounded: You can edit times between actual clock-in (<span className="font-bold">{newRequest.maxPreShiftStart}</span>) and shift start (<span className="font-bold">{newRequest.maxPreShiftEnd}</span>).
                      </p>
                    </div>
                  )}

                  {!newRequest.maxPreShiftStart && (
                    <p className="text-[10px] text-slate-400 font-medium italic">
                      No pre-shift overtime window detected (actual clock-in is not earlier than scheduled start time).
                    </p>
                  )}
                </div>

                {/* Post-Shift OT Section */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-[#1A2B4B] focus:ring-[#1A2B4B] w-4 h-4 cursor-pointer"
                        checked={!!newRequest.isPostShiftSelected}
                        disabled={!newRequest.maxPostShiftStart}
                        onChange={(e) => setNewRequest(prev => ({ ...prev, isPostShiftSelected: e.target.checked }))}
                      />
                      <span className={cn("text-xs font-black", !newRequest.maxPostShiftStart ? "text-slate-400" : "text-slate-800")}>
                        Post-Shift Overtime
                      </span>
                    </label>
                    {newRequest.maxPostShiftStart ? (
                      <span className="text-[10px] font-bold text-[#1A2B4B] bg-[#1A2B4B]/10 px-2 py-0.5 rounded-full">
                        Eligible: {newRequest.maxPostShiftStart} - {newRequest.maxPostShiftEnd}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        Not Applicable
                      </span>
                    )}
                  </div>

                  {newRequest.isPostShiftSelected && newRequest.maxPostShiftStart && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[9px] font-black uppercase text-slate-400">OT Start Time</Label>
                          <Input 
                            type="time" 
                            className="bg-slate-50 border border-slate-200 h-10 rounded-lg text-xs font-bold"
                            value={newRequest.postShiftOtStart || ''}
                            onChange={(e) => setNewRequest(prev => ({ ...prev, postShiftOtStart: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label className="text-[9px] font-black uppercase text-slate-400">OT End Time</Label>
                          <Input 
                            type="time" 
                            className="bg-slate-50 border border-slate-200 h-10 rounded-lg text-xs font-bold"
                            value={newRequest.postShiftOtEnd || ''}
                            onChange={(e) => setNewRequest(prev => ({ ...prev, postShiftOtEnd: e.target.value }))}
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-amber-700 bg-amber-50 p-2 rounded-lg font-medium">
                        Bounded: You can edit times between shift end (<span className="font-bold">{newRequest.maxPostShiftStart}</span>) and actual clock-out (<span className="font-bold">{newRequest.maxPostShiftEnd}</span>).
                      </p>
                    </div>
                  )}

                  {!newRequest.maxPostShiftStart && (
                    <p className="text-[10px] text-slate-400 font-medium italic">
                      No post-shift overtime window detected (actual clock-out is not later than scheduled end time).
                    </p>
                  )}
                </div>

                {/* Total OT Requested Summary */}
                <div className="flex items-center justify-between p-3 bg-[#1A2B4B]/5 rounded-xl text-xs font-bold text-[#1A2B4B]">
                  <span>Total Overtime Requested:</span>
                  <span className="text-sm font-black">
                    {(() => {
                      let mins = 0;
                      if (newRequest.isPreShiftSelected && newRequest.preShiftOtStart && newRequest.preShiftOtEnd) {
                        mins += Math.max(0, getTimeInMinutes(newRequest.preShiftOtEnd) - getTimeInMinutes(newRequest.preShiftOtStart));
                      }
                      if (newRequest.isPostShiftSelected && newRequest.postShiftOtStart && newRequest.postShiftOtEnd) {
                        mins += Math.max(0, getTimeInMinutes(newRequest.postShiftOtEnd) - getTimeInMinutes(newRequest.postShiftOtStart));
                      }
                      return `${(mins / 60).toFixed(1)} hrs`;
                    })()}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400">Reason / Details</Label>
              <textarea 
                className="w-full bg-slate-50 border-none rounded-xl p-4 text-xs font-medium min-h-[100px] focus:ring-2 focus:ring-[#1A2B4B] outline-none"
                placeholder="Explain the reason for your request..."
                value={newRequest.reason || ''}
                onChange={(e) => setNewRequest(prev => ({ ...prev, reason: e.target.value }))}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button 
                variant="ghost" 
                onClick={() => setIsRequestDialogOpen(false)}
                className="rounded-xl font-bold"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitRequest}
                className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl shadow-lg shadow-[#1A2B4B]/10 font-bold px-8 h-12"
              >
                Submit Request
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Generator Dialog */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-3xl text-primary">
          <div className="bg-gradient-to-r from-[#1A2B4B] to-[#2C3E50] p-8 text-white border-b-2 border-[#D4AF37]/30">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black italic">Bulk Schedule Generator</DialogTitle>
              <DialogDescription className="text-white/60 font-medium pt-2">
                Populate shifts and day-offs for multiple dates at once.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="p-8 space-y-6 bg-white overflow-y-auto max-h-[70vh]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">Staff Member</Label>
                <Select 
                  value={bulkConfig.userId} 
                  onValueChange={(v) => setBulkConfig({ ...bulkConfig, userId: v })}
                >
                  <SelectTrigger className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold text-primary">
                    <SelectValue placeholder="Select Staff">
                      {bulkConfig.userId ? (allUsers.find(u => u.id === bulkConfig.userId)?.name || allUsers.find(u => u.id === bulkConfig.userId)?.email) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name ? `${u.name} (${u.email})` : u.email || u.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Range Start</Label>
                  <Input 
                    type="date" 
                    className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                    value={bulkConfig.startDate}
                    onChange={(e) => setBulkConfig({ ...bulkConfig, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Range End</Label>
                  <Input 
                    type="date" 
                    className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                    value={bulkConfig.endDate}
                    onChange={(e) => setBulkConfig({ ...bulkConfig, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Shift Start</Label>
                  <Input 
                    type="time" 
                    className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                    value={bulkConfig.startTime}
                    onChange={(e) => setBulkConfig({ ...bulkConfig, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Shift End</Label>
                  <Input 
                    type="time" 
                    className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                    value={bulkConfig.endTime}
                    onChange={(e) => setBulkConfig({ ...bulkConfig, endTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">Day Offs (Select to skip work days)</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {daysOfWeek.map((day, idx) => (
                    <Button
                      key={idx}
                      type="button"
                      variant={bulkConfig.daysOff.includes(idx) ? "default" : "outline"}
                      className={cn(
                        "h-8 text-[10px] font-black rounded-lg",
                        bulkConfig.daysOff.includes(idx) ? "bg-rose-500 hover:bg-rose-600" : ""
                      )}
                      onClick={() => {
                        const newDaysOff = bulkConfig.daysOff.includes(idx)
                          ? bulkConfig.daysOff.filter(d => d !== idx)
                          : [...bulkConfig.daysOff, idx];
                        setBulkConfig({ ...bulkConfig, daysOff: newDaysOff });
                      }}
                    >
                      {day.substring(0, 3)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4 sticky bottom-0 bg-white">
              <Button 
                variant="ghost" 
                onClick={() => setIsBulkDialogOpen(false)}
                className="rounded-xl font-bold"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleGenerateBulkSchedule}
                className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl shadow-lg shadow-[#1A2B4B]/10 font-bold px-8 h-12"
                disabled={loading}
              >
                {loading ? 'Generating...' : 'Generate Schedules'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-3xl text-primary">
          <div className="bg-gradient-to-r from-[#1A2B4B] to-[#2C3E50] p-8 text-white border-b-2 border-[#D4AF37]/30">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black italic">Single Date Schedule</DialogTitle>
              <DialogDescription className="text-white/60 font-medium pt-2">
                Manually set or override a shift for one specific date.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="p-8 space-y-6 bg-white">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">Staff Member</Label>
                <Select 
                  value={editingSchedule?.userId || ''} 
                  onValueChange={(v) => {
                    const user = allUsers.find(u => u.id === v);
                    setEditingSchedule({ ...editingSchedule, userId: v, userName: user?.name || user?.email || v });
                  }}
                  disabled={!!editingSchedule?.id}
                >
                  <SelectTrigger className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold text-primary">
                    <SelectValue placeholder="Select Staff">
                      {editingSchedule?.userId ? (allUsers.find(u => u.id === editingSchedule.userId)?.name || allUsers.find(u => u.id === editingSchedule.userId)?.email) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name ? `${u.name} (${u.email})` : u.email || u.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">Date</Label>
                <Input 
                  type="date" 
                  className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                  value={editingSchedule?.date || ''} 
                  onChange={(e) => setEditingSchedule({ ...editingSchedule, date: e.target.value })}
                  disabled={!!editingSchedule?.id}
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input 
                  type="checkbox" 
                  id="dayOff"
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={editingSchedule?.isDayOff || false}
                  onChange={(e) => setEditingSchedule({ ...editingSchedule, isDayOff: e.target.checked })}
                />
                <Label htmlFor="dayOff" className="text-xs font-bold text-slate-600">Mark as Day Off</Label>
              </div>

              {!editingSchedule?.isDayOff && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Start Time</Label>
                    <Input 
                      type="time" 
                      className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                      value={editingSchedule?.startTime || ''} 
                      onChange={(e) => setEditingSchedule({ ...editingSchedule, startTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">End Time</Label>
                    <Input 
                      type="time" 
                      className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                      value={editingSchedule?.endTime || ''} 
                      onChange={(e) => setEditingSchedule({ ...editingSchedule, endTime: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsScheduleDialogOpen(false)} className="rounded-xl font-bold">Cancel</Button>
              <Button onClick={handleSaveSchedule} className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl shadow-lg shadow-[#1A2B4B]/10 font-bold px-8 h-12">
                Save Changes
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingLog} onOpenChange={(open) => { if (!open) setEditingLog(null); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-3xl text-primary">
          <div className="bg-gradient-to-r from-[#1A2B4B] to-[#2C3E50] p-8 text-white border-b-2 border-[#D4AF37]/30">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black italic">Edit Actual Attendance Log</DialogTitle>
              <DialogDescription className="text-white/60 font-medium pt-2">
                Directly adjust Actual IN and Actual OUT log for staff.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="p-8 space-y-6 bg-white">
            <div className="space-y-4">
              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400">Staff Member</Label>
                <p className="text-sm font-bold text-primary pt-1">{editingLog?.userName}</p>
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400">Date</Label>
                <p className="text-sm font-bold text-primary pt-1">{editingLog?.date}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Actual In Time</Label>
                  <Input 
                    type="time" 
                    className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                    value={editingLog?.timeIn || ''} 
                    onChange={(e) => setEditingLog(prev => prev ? { ...prev, timeIn: e.target.value } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Actual Out Time</Label>
                  <Input 
                    type="time" 
                    className="bg-slate-50 border-none h-12 rounded-xl text-xs font-bold"
                    value={editingLog?.timeOut || ''} 
                    onChange={(e) => setEditingLog(prev => prev ? { ...prev, timeOut: e.target.value } : null)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditingLog(null)} className="rounded-xl font-bold">Cancel</Button>
              <Button onClick={handleSaveDirectLog} className="bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-xl shadow-lg shadow-[#1A2B4B]/10 font-bold px-8 h-12">
                Save Log
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {hoveredSchedule && createPortal(
        <div 
          className="fixed z-[9999] pointer-events-none bg-slate-950 text-white text-[11px] p-2.5 rounded-xl shadow-2xl text-center leading-relaxed"
          style={{
            top: `${hoveredSchedule.top - 8}px`,
            left: `${hoveredSchedule.left}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="font-bold border-b border-white/10 pb-1 mb-1 text-white whitespace-nowrap">
            {hoveredSchedule.dateStr}
          </p>
          <p className="font-semibold text-slate-300 whitespace-nowrap">
            {hoveredSchedule.userName}
          </p>
          <p className={cn(
            "font-black mt-1 whitespace-nowrap",
            hoveredSchedule.status.type === 'leave' ? "text-rose-400" :
            hoveredSchedule.status.type === 'off' ? "text-slate-400" :
            hoveredSchedule.status.type === 'work' ? "text-emerald-400" : "text-slate-400"
          )}>
            {hoveredSchedule.status.fullName}
          </p>
          {hoveredSchedule.status.type === 'leave' && (
            <p className="text-[10px] text-rose-300 italic mt-1 max-w-[180px] break-words leading-tight">
              Reason: {hoveredSchedule.status.tooltip.replace('On Leave: ', '')}
            </p>
          )}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-950" />
        </div>,
        document.body
      )}
    </div>
  );
};

export default Attendance;
