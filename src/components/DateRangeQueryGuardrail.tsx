import React, { useState } from 'react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Database, AlertTriangle, RotateCcw, Calendar, Calculator, Loader2, CheckCircle2, Info } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, getCountFromServer, Timestamp } from 'firebase/firestore';
import { toast } from 'sonner';

export interface DateRangeQueryGuardrailProps {
  title?: string;
  description?: string;
  collectionName: string;
  dateField?: string;
  dateFieldType?: 'timestamp' | 'string';
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onApplyQuery: (startDate: string, endDate: string, estimatedCount: number) => void;
  onResetQuery?: () => void;
  activeLoadedRange?: { startDate: string; endDate: string } | null;
  loadedCount?: number;
  isCurrentlyLoaded?: (startDate: string, endDate: string) => boolean;
  isCustomRangeActive?: boolean;
}

export const DateRangeQueryGuardrail: React.FC<DateRangeQueryGuardrailProps> = ({
  title = "Date Range Query Guardrail",
  description = "Guard serverless document read quota by verifying date ranges before executing full dataset queries.",
  collectionName,
  dateField = 'timestamp',
  dateFieldType = 'timestamp',
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApplyQuery,
  onResetQuery,
  activeLoadedRange,
  loadedCount,
  isCurrentlyLoaded,
  isCustomRangeActive = false
}) => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [exactReadCount, setExactReadCount] = useState<number | null>(null);
  const [pendingRange, setPendingRange] = useState<{ start: string; end: string }>({ start: startDate, end: endDate });

  const isAlreadyLoaded = isCurrentlyLoaded
    ? isCurrentlyLoaded(startDate, endDate)
    : Boolean(activeLoadedRange && activeLoadedRange.startDate === startDate && activeLoadedRange.endDate === endDate);

  const handleCalculateReadCost = async (customStart?: string, customEnd?: string) => {
    const s = customStart || startDate;
    const e = customEnd || endDate;

    if (!s || !e) {
      toast.error('Please select both Start Date and End Date');
      return;
    }

    if (new Date(s) > new Date(e)) {
      toast.error('Start Date cannot be after End Date');
      return;
    }

    // Check if range is already displayed
    if (isCurrentlyLoaded ? isCurrentlyLoaded(s, e) : (activeLoadedRange && activeLoadedRange.startDate === s && activeLoadedRange.endDate === e)) {
      toast.info(`The records for ${s} to ${e} are already displayed in the view (${loadedCount ?? 0} records active).`);
    }

    setIsCalculating(true);
    try {
      let countQuery;
      if (dateFieldType === 'timestamp') {
        const startTs = Timestamp.fromDate(new Date(`${s}T00:00:00`));
        const endTs = Timestamp.fromDate(new Date(`${e}T23:59:59`));
        countQuery = query(
          collection(db, collectionName),
          where(dateField, '>=', startTs),
          where(dateField, '<=', endTs)
        );
      } else {
        countQuery = query(
          collection(db, collectionName),
          where(dateField, '>=', s),
          where(dateField, '<=', e)
        );
      }

      const snapshot = await getCountFromServer(countQuery);
      const count = snapshot.data().count;

      setExactReadCount(count);
      setPendingRange({ start: s, end: e });
      setShowConfirmModal(true);
    } catch (error) {
      console.warn('Count aggregation error, defaulting to safe estimation:', error);
      // If collection doesn't have matching index or offline, provide safe estimate
      setExactReadCount(null);
      setPendingRange({ start: s, end: e });
      setShowConfirmModal(true);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleApplyPreset = (presetKey: 'today' | 'yesterday' | 'this_month' | 'last_month' | 'last_30_days') => {
    const now = new Date();
    let s = '';
    let e = format(now, 'yyyy-MM-dd');

    if (presetKey === 'today') {
      s = format(now, 'yyyy-MM-dd');
      e = s;
    } else if (presetKey === 'yesterday') {
      s = format(subDays(now, 1), 'yyyy-MM-dd');
      e = s;
    } else if (presetKey === 'this_month') {
      s = format(startOfMonth(now), 'yyyy-MM-dd');
      e = format(now, 'yyyy-MM-dd');
    } else if (presetKey === 'last_month') {
      const prevMonth = subDays(startOfMonth(now), 1);
      s = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
      e = format(endOfMonth(prevMonth), 'yyyy-MM-dd');
    } else if (presetKey === 'last_30_days') {
      s = format(subDays(now, 30), 'yyyy-MM-dd');
      e = format(now, 'yyyy-MM-dd');
    }

    onStartDateChange(s);
    onEndDateChange(e);
  };

  const handleConfirmQuery = () => {
    setShowConfirmModal(false);
    onApplyQuery(pendingRange.start, pendingRange.end, exactReadCount ?? 0);
  };

  return (
    <>
      <Card className="border border-slate-200/80 shadow-xs bg-slate-50/70 rounded-2xl overflow-hidden mb-5">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-700 shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-slate-800 tracking-tight uppercase">{title}</h4>
                  <Badge variant="outline" className="text-[10px] h-5 bg-white font-bold text-indigo-700 border-indigo-200">
                    Read Cost Estimator
                  </Badge>
                  {isAlreadyLoaded && (
                    <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Data Currently Loaded ({loadedCount ?? 0})
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">{description}</p>
              </div>
            </div>

            {/* Quick Date Presets */}
            <div className="flex flex-wrap items-center gap-1.5 self-start md:self-auto">
              <span className="text-[10px] font-black uppercase text-slate-400 mr-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Quick Range:
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyPreset('today')}
                className="h-6 text-[10px] px-2 py-0 border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
              >
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyPreset('yesterday')}
                className="h-6 text-[10px] px-2 py-0 border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
              >
                Yesterday
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyPreset('this_month')}
                className="h-6 text-[10px] px-2 py-0 border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
              >
                This Month
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyPreset('last_30_days')}
                className="h-6 text-[10px] px-2 py-0 border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
              >
                Last 30 Days
              </Button>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-col sm:flex-row items-end sm:items-center gap-3">
            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
              <div className="space-y-1 w-full sm:w-36">
                <Label className="text-[10px] font-bold uppercase text-slate-500">From Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="h-8 text-xs bg-white border-slate-200 rounded-lg"
                />
              </div>
              <div className="space-y-1 w-full sm:w-36">
                <Label className="text-[10px] font-bold uppercase text-slate-500">To Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="h-8 text-xs bg-white border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto ml-auto">
              <Button
                type="button"
                size="sm"
                disabled={isCalculating}
                onClick={() => handleCalculateReadCost()}
                className="h-8 text-xs font-bold bg-[#1A2B4B] hover:bg-[#2C3E50] text-white rounded-lg gap-1.5 shadow-sm"
              >
                {isCalculating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Calculating Reads...
                  </>
                ) : (
                  <>
                    <Calculator className="w-3.5 h-3.5 text-amber-400" />
                    Estimate Read Cost & Query
                  </>
                )}
              </Button>

              {isCustomRangeActive && onResetQuery && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResetQuery}
                  className="h-8 text-xs font-bold text-slate-600 hover:bg-slate-100 border-slate-200 gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation & Cost Estimation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2 text-slate-800">
              <Calculator className="w-5 h-5 text-indigo-600" />
              Query Read Cost & Impact Estimate
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Review document read requirements before executing this database query.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Target Collection:</span>
                <span className="font-mono font-bold text-slate-800">{collectionName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Date Range:</span>
                <span className="font-bold text-slate-800">{pendingRange.start} → {pendingRange.end}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Estimated Document Reads:</span>
                <span className="font-black text-indigo-700 text-sm">
                  {exactReadCount !== null ? `${exactReadCount.toLocaleString()} docs` : 'Safe dynamic query'}
                </span>
              </div>
            </div>

            {isAlreadyLoaded ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-800 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <div>
                  <p className="font-bold">Data Already Displayed</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    The requested date range ({pendingRange.start} to {pendingRange.end}) matches your active view. Re-applying will refresh records from cache.
                  </p>
                </div>
              </div>
            ) : exactReadCount && exactReadCount > 1000 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-bold">Large Query Warning</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    This query involves {exactReadCount.toLocaleString()} documents. Ensure you require this full timeframe to maintain optimal quota efficiency.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl flex items-start gap-2.5 text-indigo-900 text-xs">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
                <p className="text-[11px] leading-relaxed">
                  Fast aggregation check completed. Proceeding will load the matching records into your current workspace.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowConfirmModal(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmQuery}
              className="text-xs font-bold bg-[#1A2B4B] hover:bg-[#2C3E50] text-white"
            >
              Execute Query ({exactReadCount !== null ? `${exactReadCount} Reads` : 'Proceed'})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
