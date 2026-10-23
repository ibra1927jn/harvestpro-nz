import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { databaseService } from '../services/database.service';
import { attendanceService } from '../services/attendance.service';
import { rollCallService, applyQueuedRollCall, CLOCK_SKEW_WARN_MS, type RollCallAction, type RollCallResult, type RollCallRecord } from '../services/rollCall.service';
import { Picker, AppUser, AttendanceRecord } from '../types';
import { queryKeys } from '@/config/queryClient';
import { mealBreakMissing } from '@/services/harvestMetrics/pay';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { logger } from '@/utils/logger';

const QUEUED_KEY = ['attendance', 'queued'] as const;

/** Mientras haya algo en la cola, se mira cada pocos segundos si ya se envió */
const QUEUED_POLL_MS = 4000;

interface RollCallVars {
  action: RollCallAction;
  pickerId: string;
  attendanceId?: string;
}

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

  // 3. Lo que sigue en la cola de este móvil (fichajes y descansos sin red)
  const queuedQuery = useQuery({
    queryKey: QUEUED_KEY,
    queryFn: async () => {
      try {
        return await rollCallService.listQueued();
      } catch (e) {
        logger.warn('[useAttendance] Could not read the offline queue:', e);
        return [];
      }
    },
    networkMode: 'always',
    enabled: !!appUser?.id,
    refetchInterval: q => ((q.state.data?.length ?? 0) > 0 ? QUEUED_POLL_MS : false),
  });

  const roster = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);
  const queued = useMemo(() => queuedQuery.data ?? [], [queuedQuery.data]);
  const attendance = useMemo<RollCallRecord[]>(
    () => applyQueuedRollCall((attendanceQuery.data ?? []) as AttendanceRecord[], queued),
    [attendanceQuery.data, queued]
  );
  const loading = rosterQuery.isLoading || attendanceQuery.isLoading;

  // La cola se vació (se envió todo): volver a leer los fichajes del servidor
  const lastQueued = useRef(0);
  useEffect(() => {
    if (lastQueued.current > 0 && queued.length < lastQueued.current) {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.daily(appUser?.orchard_id ?? '') });
    }
    lastQueued.current = queued.length;
  }, [queued.length, qc, appUser?.orchard_id]);

  // Una sola mutación para entrada, salida y descanso. networkMode 'always':
  // sin red no se queda en pausa; rollCallService la guarda en la cola del
  // móvil (con su hora) y la pantalla cambia al momento.
  const rollCallMutation = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async ({ action, pickerId, attendanceId }: RollCallVars): Promise<RollCallResult> => {
      if (!appUser?.orchard_id) throw new Error('No orchard assigned.');
      return rollCallService.record(action, {
        pickerId,
        orchardId: appUser.orchard_id,
        attendanceId,
        recordedBy: appUser.id,
      });
    },
    onSuccess: result => {
      if (result.state === 'queued') {
        qc.invalidateQueries({ queryKey: QUEUED_KEY });
        return;
      }
      // Solo cambian los fichajes: la cuadrilla es la misma (antes se volvía a
      // bajar también la plantilla tras cada fichaje: 20 fichajes = 40 consultas)
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
    },
    onError: err => {
      logger.error(err);
    },
  });

  const { mutateAsync } = rollCallMutation;
  const checkIn = useCallback(
    (pickerId: string) => mutateAsync({ action: 'check_in', pickerId }),
    [mutateAsync]
  );
  const findPicker = useCallback(
    (attendanceId: string) => attendance.find(a => a.id === attendanceId)?.picker_id ?? '',
    [attendance]
  );
  const checkOut = useCallback(
    (attendanceId: string) => mutateAsync({ action: 'check_out', pickerId: findPicker(attendanceId), attendanceId }),
    [mutateAsync, findPicker]
  );
  const startBreak = useCallback(
    (attendanceId: string) => mutateAsync({ action: 'break_start', pickerId: findPicker(attendanceId), attendanceId }),
    [mutateAsync, findPicker]
  );
  const endBreak = useCallback(
    (attendanceId: string) => mutateAsync({ action: 'break_end', pickerId: findPicker(attendanceId), attendanceId }),
    [mutateAsync, findPicker]
  );

  // Processing — la persona (entrada) o el tramo (resto) que se está enviando
  const processing = rollCallMutation.isPending
    ? (rollCallMutation.variables?.attendanceId ?? rollCallMutation.variables?.pickerId ?? null)
    : null;

  // Derived State
  const mergedList = useMemo(() => {
    return roster.map((picker: Picker) => {
      // Puede haber varios tramos hoy (salió y volvió, o pasó por otro huerto):
      // manda el abierto; si no hay, el último.
      const records = attendance
        .filter(a => a.picker_id === picker.id)
        .sort((x, y) => (x.check_in ?? '').localeCompare(y.check_in ?? ''));
      const record = records.find(r => !r.check_out) ?? records[records.length - 1];
      const isPresent = !!record && !record.check_out;
      return {
        ...picker,
        attendanceRecord: record,
        isPresent,
        // Descanso empezado y sin terminar en el tramo abierto
        onBreak: isPresent && !!record?.break_start && !record?.break_end,
        // Algo de esta persona sigue en la cola del móvil
        pending: records.some(r => r.pending),
        // Trabajando hoy más de 4 h sin descanso de comida anotado: avisar al
        // team leader (el pago solo descuenta descansos anotados)
        breakMissing: isPresent && mealBreakMissing(records.map(r => ({
          checkIn: r.check_in, checkOut: r.check_out, breakStart: r.break_start,
        }))),
      };
    });
  }, [roster, attendance]);

  const stats = useMemo(() => {
    const present = mergedList.filter(p => p.isPresent).length;
    const absent = mergedList.length - present;
    return { present, absent, total: mergedList.length };
  }, [mergedList]);

  // Reloj del móvil desfasado (medido con la hora del servidor): se avisa
  const clockSkew = useHarvestStore(s => s.clockSkew) || 0;
  const clockSkewMinutes = Math.abs(clockSkew) > CLOCK_SKEW_WARN_MS ? Math.round(clockSkew / 60000) : 0;

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
    checkIn,
    checkOut,
    startBreak,
    endBreak,
    mergedList,
    stats,
    queuedCount: queued.length,
    clockSkewMinutes,
  };
};
