import { logger } from '@/utils/logger';
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { databaseService } from '../services/database.service';
import { attendanceService } from '../services/attendance.service';
import { Picker, AppUser, AttendanceRecord } from '../types';
import { queryKeys } from '@/config/queryClient';

export const useAttendance = (appUser: AppUser | undefined) => {
  const qc = useQueryClient();

  // 1. Fetch Roster
  const rosterQuery = useQuery({
    queryKey: queryKeys.pickers.byTeam(appUser?.id),
    queryFn: () => databaseService.getPickersByTeam(appUser!.id),
    enabled: !!appUser?.id,
  });

  // 2. Fetch Today's Attendance
  const attendanceQuery = useQuery({
    queryKey: queryKeys.attendance.daily(appUser?.orchard_id ?? ''),
    queryFn: () => attendanceService.getDailyAttendance(appUser!.orchard_id!),
    enabled: !!appUser?.orchard_id,
  });

  const roster = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);
  const attendance = useMemo(
    () => (attendanceQuery.data ?? []) as AttendanceRecord[],
    [attendanceQuery.data]
  );
  const loading = rosterQuery.isLoading || attendanceQuery.isLoading;

  // Processing state for individual actions
  const checkInMutation = useMutation({
    mutationFn: async (pickerId: string) => {
      if (!appUser?.orchard_id) throw new Error('No orchard assigned.');
      await attendanceService.checkInPicker(pickerId, appUser.orchard_id, appUser.id);
    },
    onSuccess: () => {
      // Invalidate both queries to refetch fresh data
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      qc.invalidateQueries({ queryKey: queryKeys.pickers.all });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (attendanceId: string) => {
      await attendanceService.checkOutPicker(attendanceId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
    },
    onError: err => {
      logger.error(err);
    },
  });

  // Processing — which ID is currently being processed
  const processing = checkInMutation.isPending
    ? (checkInMutation.variables ?? null)
    : checkOutMutation.isPending
      ? (checkOutMutation.variables ?? null)
      : null;

  // Derived State
  const mergedList = useMemo(() => {
    return roster.map((picker: Picker) => {
      // Puede haber varios tramos hoy (salió y volvió, o pasó por otro huerto):
      // manda el abierto; si no hay, el último.
      const records = attendance
        .filter((a: AttendanceRecord) => a.picker_id === picker.id)
        .sort((x, y) => (x.check_in ?? '').localeCompare(y.check_in ?? ''));
      const record = records.find(r => !r.check_out) ?? records[records.length - 1];
      return {
        ...picker,
        attendanceRecord: record,
        isPresent: !!record && !record.check_out,
      };
    });
  }, [roster, attendance]);

  const stats = useMemo(() => {
    const present = mergedList.filter(p => p.isPresent).length;
    const absent = mergedList.length - present;
    return { present, absent, total: mergedList.length };
  }, [mergedList]);

  // Refresh — manually refetch both queries
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
    qc.invalidateQueries({ queryKey: queryKeys.pickers.all });
  }, [qc]);

  return {
    roster,
    attendance,
    loading,
    processing,
    refresh,
    checkIn: checkInMutation.mutateAsync,
    checkOut: checkOutMutation.mutateAsync,
    mergedList,
    stats,
  };
};
